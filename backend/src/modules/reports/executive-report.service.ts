import { Injectable } from '@nestjs/common';
import { PRODUCT_NAME } from '../../common/constants/product';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { type ProcessGrants, ProcessAccessService } from '../access/process-access.service';
import {
  ApprovalEntity,
  AreaEntity,
  SolicitationEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SettingsService } from '../settings/settings.service';
import type { ReportFiltersDto } from './dto/report-filters.dto';

// ── pdfmake setup (server-side v0.3.x singleton) ──────────────────────────────
// pdfmake/js/index.js exports a singleton instance, NOT a constructor class.
// API: singleton.setLocalAccessPolicy, setUrlAccessPolicy, addFonts, virtualfs,
//      createPdf(docDef).getBuffer() → Promise<Buffer>

 
const pdfmakeLib = require('pdfmake/js/index.js') as {
  setLocalAccessPolicy: (cb: () => boolean) => void;
  setUrlAccessPolicy: (cb: () => boolean) => void;
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  addFonts: (fonts: Record<string, unknown>) => void;
  createPdf: (docDef: unknown) => { getBuffer: () => Promise<Buffer> };
};
 
const vfsFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>;

pdfmakeLib.setLocalAccessPolicy(() => false);
pdfmakeLib.setUrlAccessPolicy(() => false);

// Load bundled Roboto fonts into the virtual filesystem
Object.entries(vfsFonts).forEach(([k, v]) => {
  pdfmakeLib.virtualfs.writeFileSync(k, Buffer.from(v, 'base64'));
});

pdfmakeLib.addFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

// ── Label maps ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  canceled: 'Cancelado',
  new: 'Novo',
  in_analysis: 'Em análise',
  waiting_approval: 'Ag. aprovação',
  in_progress: 'Em andamento',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  waiting_integration: 'Ag. integração',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

const SLA_LABELS: Record<string, string> = {
  on_track: 'OK',
  warning: 'Atenção',
  breached: 'Vencido',
  paused: 'Pausado',
  completed: 'Concluído',
};

const TERMINAL_STATUSES = [
  'resolved', 'canceled', 'completed', 'approved', 'cancelled', 'rejected',
];

// ── Safe string coercion ──────────────────────────────────────────────────────
// Prevents pdfmake from receiving null/undefined cell values (causes 500).
function safe(val: unknown, fallback = '—'): string {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

// ── Raw query shape types ─────────────────────────────────────────────────────

type RawSummary = {
  total: string;
  completed: string;
  slaBreached: string;
  avgResolutionDays: string | null;
};

type RawStatus = { status: string; count: string };

type RawArea = {
  areaId: string | null;
  total: string;
  completed: string;
  slaBreached: string;
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ExecutiveReportService {
  constructor(
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(AreaEntity)
    private readonly areasRepo: Repository<AreaEntity>,
    @InjectRepository(ApprovalEntity)
    private readonly approvalsRepo: Repository<ApprovalEntity>,
    private readonly settingsService: SettingsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  async generateSolicitationsReport(
    filters: ReportFiltersDto,
    actor: JwtPayload,
  ): Promise<Buffer> {
    const terminalIn = TERMINAL_STATUSES.map((s) => `'${s}'`).join(', ');
    // O relatório cobre os cards que a pessoa vê: pelo vínculo com cada processo (antes: pela área).
    const grants = await this.processAccess.grantsOf(actor);

    const [summaryRaw, statusRowsRaw, areaRowsRaw, totalCount, solRowsRaw, pendingApprovals, orgName] =
      await Promise.all([
        this.buildBaseQb(filters, grants)
          .select('COUNT(*)', 'total')
          .addSelect(
            `SUM(CASE WHEN s.status IN (${terminalIn}) THEN 1 ELSE 0 END)`,
            'completed',
          )
          .addSelect(
            `SUM(CASE WHEN s.sla_status = 'breached' THEN 1 ELSE 0 END)`,
            'slaBreached',
          )
          .addSelect(
            `ROUND(AVG(CASE WHEN s.status IN (${terminalIn}) ` +
            `THEN EXTRACT(EPOCH FROM (s.updated_at - s.created_at)) / 86400.0 ` +
            `ELSE NULL END)::numeric, 1)`,
            'avgResolutionDays',
          )
          .getRawOne<RawSummary>(),

        this.buildBaseQb(filters, grants)
          .select('s.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('s.status')
          .orderBy('count', 'DESC')
          .getRawMany<RawStatus>(),

        this.buildBaseQb(filters, grants)
          .select('s.area_id', 'areaId')
          .addSelect('COUNT(*)', 'total')
          .addSelect(
            `SUM(CASE WHEN s.status IN (${terminalIn}) THEN 1 ELSE 0 END)`,
            'completed',
          )
          .addSelect(
            `SUM(CASE WHEN s.sla_status = 'breached' THEN 1 ELSE 0 END)`,
            'slaBreached',
          )
          .groupBy('s.area_id')
          .orderBy('total', 'DESC')
          .getRawMany<RawArea>(),

        this.buildBaseQb(filters, grants).getCount(),

        // Avoid TypeORM take()+leftJoinAndSelect() pagination bug (createOrderByCombinedWithSelectExpression).
        // Load solicitations without the join, then batch-load assignees separately below.
        this.buildBaseQb(filters, grants)
          .orderBy('s.created_at', 'DESC')
          .limit(200)
          .getMany(),

        this.approvalsRepo
          .createQueryBuilder('a')
          .where("a.status = 'pending'")
          .getCount(),

        this.settingsService.getValue<string>('org.name', PRODUCT_NAME),
      ]);

    // Ensure query results are always arrays/objects even on empty datasets
    const summaryRow = summaryRaw ?? { total: '0', completed: '0', slaBreached: '0', avgResolutionDays: null };
    const statusRows: RawStatus[] = statusRowsRaw ?? [];
    const areaRows: RawArea[] = areaRowsRaw ?? [];
    const solRows: SolicitationEntity[] = solRowsRaw ?? [];

    const areaIds = [
      ...new Set(areaRows.map((r) => r.areaId).filter(Boolean)),
    ] as string[];
    const areas =
      areaIds.length > 0 ? await this.areasRepo.findBy({ id: In(areaIds) }) : [];
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    // Batch-load assignee names (avoids TypeORM take()+join pagination bug)
    const assigneeIds = [...new Set(solRows.map((s) => s.assigneeId).filter(Boolean))] as string[];
    const assigneeMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const assignees = await this.solicitationsRepo.manager
        .getRepository<{ id: string; fullName: string }>('UserEntity')
        .findBy({ id: In(assigneeIds) } as never);
      for (const u of assignees) {
        assigneeMap.set(u.id, u.fullName);
      }
    }

    const docDef = this.buildDocDefinition({
      filters,
      orgName,
      summaryRow,
      statusRows,
      areaRows,
      areaMap,
      pendingApprovals,
      solRows,
      assigneeMap,
      totalCount,
    });

    return this.renderPdf(docDef);
  }

  // ── Query builder helpers ───────────────────────────────────────────────────

  private buildBaseQb(
    filters: ReportFiltersDto,
    grants: ProcessGrants,
  ): SelectQueryBuilder<SolicitationEntity> {
    const qb = this.solicitationsRepo.createQueryBuilder('s');

    this.processAccess.applySolicitationScopeWith(qb, grants, 's');

    if (filters.startDate) {
      qb.andWhere('s.created_at >= :rptStart', { rptStart: filters.startDate });
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setUTCHours(23, 59, 59, 999);
      qb.andWhere('s.created_at <= :rptEnd', { rptEnd: end });
    }
    if (filters.areaId) {
      qb.andWhere('s.area_id = :rptAreaId', { rptAreaId: filters.areaId });
    }
    if (filters.status) {
      qb.andWhere('s.status = :rptStatus', { rptStatus: filters.status });
    }
    if (filters.formId) {
      qb.andWhere('s.form_id = :rptFormId', { rptFormId: filters.formId });
    }
    if (filters.responsibleUserId) {
      qb.andWhere('s.assignee_id = :rptResponsibleId', {
        rptResponsibleId: filters.responsibleUserId,
      });
    }

    return qb;
  }

  // ── PDF rendering ───────────────────────────────────────────────────────────

  private renderPdf(docDef: unknown): Promise<Buffer> {
    return pdfmakeLib.createPdf(docDef).getBuffer();
  }

  // ── Document definition builder ─────────────────────────────────────────────

  private buildDocDefinition(params: {
    filters: ReportFiltersDto;
    orgName: string;
    summaryRow: RawSummary;
    statusRows: RawStatus[];
    areaRows: RawArea[];
    areaMap: Map<string, string>;
    pendingApprovals: number;
    solRows: SolicitationEntity[];
    assigneeMap: Map<string, string>;
    totalCount: number;
  }): unknown {
    const {
      filters, orgName, summaryRow, statusRows, areaRows,
      areaMap, pendingApprovals, solRows, assigneeMap, totalCount,
    } = params;

    const now = new Date();
    const generatedAt = now.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }) + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const periodText = this.buildPeriodText(filters);
    const total = parseInt(summaryRow.total, 10) || 0;
    const completed = parseInt(summaryRow.completed, 10) || 0;
    const slaBreached = parseInt(summaryRow.slaBreached, 10) || 0;
    const inProgress = Math.max(0, total - completed);
    const avgDays =
      summaryRow.avgResolutionDays != null
        ? parseFloat(summaryRow.avgResolutionDays).toFixed(1)
        : '—';

    const showAreaSection = !filters.areaId && areaRows.length > 0;
    const sectionNum = showAreaSection ? { sol: 4 } : { sol: 3 };

    // ── Cell helpers ───────────────────────────────────────────────────────────
    const th = (text: string): Record<string, unknown> => ({
      text,
      bold: true,
      fontSize: 8,
      color: 'white',
      fillColor: '#1d4ed8',
      margin: [4, 5, 4, 5],
    });

    const td = (text: string | number, isEven: boolean, bold = false): Record<string, unknown> => ({
      text: String(text),
      fontSize: 8,
      bold,
      margin: [4, 4, 4, 4],
      fillColor: isEven ? null : '#f8fafc',
    });

    const kpiCell = (label: string, value: string | number, color = '#1e40af'): Record<string, unknown> => ({
      stack: [
        { text: String(label), fontSize: 8, color: '#64748b', margin: [0, 0, 0, 4] },
        { text: String(value), fontSize: 22, bold: true, color },
      ],
      margin: [12, 14, 12, 14],
    });

    // ── Status table ───────────────────────────────────────────────────────────
    const statusTableBody = [
      [th('Status'), th('Quantidade'), th('%')],
      ...statusRows.map((r, i) => {
        const cnt = parseInt(r.count, 10) || 0;
        const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0';
        return [
          td(STATUS_LABELS[r.status] ?? r.status, i % 2 === 0),
          td(cnt, i % 2 === 0),
          td(`${pct}%`, i % 2 === 0),
        ];
      }),
    ];

    // ── Area table ─────────────────────────────────────────────────────────────
    const areaTableBody = [
      [th('Área'), th('Total'), th('Concluídas'), th('SLA Vencido')],
      ...areaRows.map((r, i) => [
        td(r.areaId ? (areaMap.get(r.areaId) ?? 'Sem área') : 'Sem área', i % 2 === 0),
        td(parseInt(r.total, 10) || 0, i % 2 === 0),
        td(parseInt(r.completed, 10) || 0, i % 2 === 0),
        td(parseInt(r.slaBreached, 10) || 0, i % 2 === 0),
      ]),
    ];

    // ── Solicitations table ────────────────────────────────────────────────────
    const noDataRow = [
      {
        text: 'Nenhuma solicitação no período',
        colSpan: 8,
        alignment: 'center',
        fontSize: 8,
        color: '#64748b',
        margin: [4, 6, 4, 6],
      },
      ...Array(7).fill(''),
    ];

    const solTableBody = [
      [
        th('#'), th('Título'), th('Status'), th('Prioridade'),
        th('Responsável'), th('Área'), th('SLA'), th('Data'),
      ],
      ...(solRows.length > 0
        ? solRows.map((s, i) => {
            const isEven = i % 2 === 0;
            // Defensive: title should never be null (NOT NULL column) but guard anyway
            const rawTitle = safe(s.title, 'Sem título');
            const title = rawTitle.length > 42 ? rawTitle.slice(0, 42) + '…' : rawTitle;
            const createdAtStr = s.createdAt
              ? new Date(s.createdAt).toLocaleDateString('pt-BR')
              : '—';
            return [
              td(safe(i + 1), isEven),
              td(safe(title, 'Sem título'), isEven),
              td(safe(STATUS_LABELS[s.status] ?? s.status), isEven),
              td(safe(PRIORITY_LABELS[s.priority] ?? s.priority), isEven),
              td(safe(s.assigneeId ? (assigneeMap.get(s.assigneeId) ?? '—') : '—', 'Não atribuído'), isEven),
              td(safe(s.areaId ? (areaMap.get(s.areaId) ?? '—') : '—', 'Sem área'), isEven),
              td(safe(s.slaStatus ? (SLA_LABELS[s.slaStatus] ?? s.slaStatus) : '—'), isEven),
              td(safe(createdAtStr), isEven),
            ];
          })
        : [noDataRow]),
    ];

    const content: unknown[] = [
      // ── CAPA ──────────────────────────────────────────────────────────────────
      {
        stack: [
          {
            text: orgName,
            fontSize: 26,
            bold: true,
            color: '#0f172a',
            alignment: 'center',
            margin: [0, 90, 0, 10],
          },
          {
            canvas: [
              {
                type: 'line',
                x1: 0, y1: 0, x2: 515, y2: 0,
                lineWidth: 2,
                lineColor: '#1d4ed8',
              },
            ],
            margin: [0, 4, 0, 16],
          },
          {
            text: 'Relatório Executivo de Solicitações',
            fontSize: 17,
            bold: true,
            color: '#1d4ed8',
            alignment: 'center',
            margin: [0, 0, 0, 16],
          },
          {
            text: `Período: ${periodText}`,
            fontSize: 11,
            alignment: 'center',
            color: '#334155',
            margin: [0, 0, 0, 6],
          },
          {
            text: `Gerado em: ${generatedAt}`,
            fontSize: 9,
            alignment: 'center',
            color: '#64748b',
          },
        ],
      },

      // ── SEÇÃO 1: KPIs ─────────────────────────────────────────────────────────
      {
        text: '1. Indicadores Principais',
        fontSize: 13,
        bold: true,
        color: '#1d4ed8',
        margin: [0, 24, 0, 8],
        pageBreak: 'before',
      },
      {
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              kpiCell('Total de Solicitações', total),
              kpiCell('Concluídas', completed, '#16a34a'),
              kpiCell('Em Andamento', inProgress, inProgress > 0 ? '#d97706' : '#16a34a'),
            ],
            [
              kpiCell('SLA Vencido', slaBreached, slaBreached > 0 ? '#dc2626' : '#16a34a'),
              kpiCell('Aprovações Pendentes', pendingApprovals, pendingApprovals > 0 ? '#d97706' : '#16a34a'),
              kpiCell('Tempo Médio (dias)', avgDays),
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#e2e8f0',
          vLineColor: () => '#e2e8f0',
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 20],
      },

      // ── SEÇÃO 2: Por status ──────────────────────────────────────────────────
      {
        text: '2. Distribuição por Status',
        fontSize: 13,
        bold: true,
        color: '#1d4ed8',
        margin: [0, 0, 0, 8],
      },
      statusRows.length > 0
        ? {
            table: {
              headerRows: 1,
              widths: ['*', 80, 70],
              body: statusTableBody,
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 20],
          }
        : {
            text: 'Nenhum dado disponível.',
            fontSize: 9,
            color: '#64748b',
            margin: [0, 0, 0, 20],
          },

      // ── SEÇÃO 3: Por área (condicional) ──────────────────────────────────────
      ...(showAreaSection
        ? [
            {
              text: '3. Distribuição por Área',
              fontSize: 13,
              bold: true,
              color: '#1d4ed8',
              margin: [0, 0, 0, 8],
            },
            {
              table: {
                headerRows: 1,
                widths: ['*', 70, 70, 80],
                body: areaTableBody,
              },
              layout: 'lightHorizontalLines',
              margin: [0, 0, 0, 20],
            },
          ]
        : []),

      // ── SEÇÃO 4 (ou 3): Tabela de solicitações ────────────────────────────────
      {
        text: `${sectionNum.sol}. Solicitações${
          solRows.length > 0
            ? ` (${solRows.length}${totalCount > 200 ? '+' : ''})`
            : ''
        }`,
        fontSize: 13,
        bold: true,
        color: '#1d4ed8',
        margin: [0, 0, 0, 8],
        pageBreak: 'before',
      },
      {
        table: {
          headerRows: 1,
          widths: [14, '*', 52, 44, 64, 54, 34, 52],
          body: solTableBody,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 6],
      },

      ...(totalCount > 200
        ? [
            {
              text: `* Exibindo apenas as 200 mais recentes de um total de ${totalCount} solicitações.`,
              fontSize: 8,
              italics: true,
              color: '#64748b',
              margin: [0, 4, 0, 0],
            },
          ]
        : []),
    ];

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [40, 60, 40, 55],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
      footer: (currentPage: number, pageCount: number) => ({
        margin: [40, 4, 40, 0],
        columns: [
          {
            text: `${orgName} — ${generatedAt}`,
            fontSize: 7,
            color: '#94a3b8',
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: 'right',
            fontSize: 7,
            color: '#94a3b8',
          },
        ],
      }),
      content,
    };
  }

  private buildPeriodText(filters: ReportFiltersDto): string {
    const fmt = (s: string): string => new Date(s).toLocaleDateString('pt-BR');
    if (filters.startDate && filters.endDate) {
      return `${fmt(filters.startDate)} a ${fmt(filters.endDate)}`;
    }
    if (filters.startDate) return `A partir de ${fmt(filters.startDate)}`;
    if (filters.endDate) return `Até ${fmt(filters.endDate)}`;
    return 'Todo o período';
  }
}
