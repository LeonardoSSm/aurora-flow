import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository, type SelectQueryBuilder, type WhereExpressionBuilder } from 'typeorm';
import { ResponseExportedEvent } from '../../common/events/response-events';
import {
  FormEntity,
  FormFieldEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
  SubmissionItemEntity,
  UserEntity,
} from '../../database/entities';
import { type AccessActor, type ProcessGrants, ProcessAccessService } from '../access/process-access.service';
import {
  collectFormFields,
  formatDateTime,
  formatRecordValue,
  formColumns,
  ORIGIN_LABELS,
  phaseColumns,
  PRIORITY_LABELS,
  type RecordColumn,
  shortCode,
  SLA_LABELS,
  STATUS_LABELS,
  systemColumns,
  type ValueField,
} from './record-columns';
import { normalizeReportConfig, type RecordReportConfig } from './record-report-config';
import { buildReportDocument, renderPdf, type ReportRow, sortRows } from './record-report-pdf';
import type { QueryRecordsDto, RecordFilterDto, RecordFiltersDto } from './dto/query-records.dto';

/** Acima disso o PDF fica lento e ilegível; a tela pede para filtrar mais. */
export const MAX_REPORT_ROWS = 5000;

/** Colunas que a tela abre marcadas na primeira visita (as do formulário entram depois). */
const DEFAULT_SYSTEM_COLUMNS = ['sys:title', 'sys:phase', 'sys:status', 'sys:assignee', 'sys:createdAt'];
const DEFAULT_FORM_COLUMNS = 4;

export interface RecordsMeta {
  formId: string;
  formName: string;
  columns: RecordColumn[];
  defaultColumns: string[];
  canExport: boolean;
  maxReportRows: number;
}

export interface RecordRow {
  id: string;
  submissionId: string | null;
  values: Record<string, string>;
}

export interface RecordsPage {
  data: RecordRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Tudo o que se precisa saber do processo para listar, filtrar e formatar. */
interface RecordsContext {
  form: FormEntity;
  grants: ProcessGrants;
  canSeeSensitive: boolean;
  phases: KanbanPhaseEntity[];
  formFields: Map<string, ValueField & { label: string; isSensitive: boolean }>;
  phaseFields: Map<string, ValueField>;
  columns: RecordColumn[];
  columnByKey: Map<string, RecordColumn>;
}

const like = (text: string): string => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

@Injectable()
export class RecordsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly processAccess: ProcessAccessService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
  ) {}

  // ─── Leitura ────────────────────────────────────────────────────────────

  async meta(formId: string, actor: AccessActor): Promise<RecordsMeta> {
    const ctx = await this.loadContext(formId, actor);
    const formDefaults = ctx.columns
      .filter((column) => column.group === 'form' && !column.masked)
      .slice(0, DEFAULT_FORM_COLUMNS)
      .map((column) => column.key);
    return {
      formId,
      formName: ctx.form.name,
      columns: ctx.columns,
      defaultColumns: [...DEFAULT_SYSTEM_COLUMNS.slice(0, 1), ...formDefaults, ...DEFAULT_SYSTEM_COLUMNS.slice(1)],
      canExport: ctx.grants.scope(formId, 'responses.export') !== 'none',
      maxReportRows: MAX_REPORT_ROWS,
    };
  }

  async query(formId: string, dto: QueryRecordsDto, actor: AccessActor): Promise<RecordsPage> {
    const ctx = await this.loadContext(formId, actor);
    const qb = await this.baseQuery(ctx, dto, actor);

    const sortColumn: Record<string, string> = {
      'sys:createdAt': 'solicitation.createdAt',
      'sys:updatedAt': 'solicitation.updatedAt',
      'sys:phaseEnteredAt': 'solicitation.phaseEnteredAt',
      'sys:title': 'solicitation.title',
    };
    const sortBy = sortColumn[dto.sortBy ?? 'sys:createdAt'] ?? 'solicitation.createdAt';
    const direction = (dto.sortDir ?? 'desc').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(sortBy, direction, 'NULLS LAST').addOrderBy('solicitation.id', 'ASC');

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    qb.skip((page - 1) * limit).take(limit);
    const [cards, total] = await qb.getManyAndCount();
    const rows = await this.buildRows(ctx, cards);
    return {
      data: rows.map(({ row }) => row),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Relatório ──────────────────────────────────────────────────────────

  async reportPdf(
    formId: string,
    filters: RecordFiltersDto,
    rawConfig: unknown,
    actor: AccessActor & { fullName?: string; email?: string },
  ): Promise<{ buffer: Buffer; filename: string; count: number }> {
    const { ctx, config, rows } = await this.prepareReport(formId, filters, rawConfig, actor);
    const document = buildReportDocument(config, ctx.columns, rows, {
      processName: ctx.form.name,
      generatedAt: formatDateTime(new Date()),
      generatedBy: [actor.fullName, actor.email].find((name) => name?.trim()) ?? 'usuário',
      filters: this.describeFilters(ctx, filters),
      phaseOrder: ctx.phases.map((phase) => phase.label),
    });
    const buffer = await renderPdf(document);

    this.eventEmitter.emit('responses.exported', new ResponseExportedEvent(actor.sub, formId, 'pdf', rows.length));
    return { buffer, filename: this.reportFilename(ctx, 'pdf'), count: rows.length };
  }

  /**
   * As mesmas colunas (na ordem e com os títulos do montador) e a mesma ordenação do PDF, em CSV para
   * planilha. Agrupar não se aplica: a coluna do grupo, se escolhida, sai como coluna comum.
   */
  async reportCsv(
    formId: string,
    filters: RecordFiltersDto,
    rawConfig: unknown,
    actor: AccessActor,
  ): Promise<{ buffer: Buffer; filename: string; count: number }> {
    const { ctx, config, rows } = await this.prepareReport(formId, filters, rawConfig, actor);
    const columns = config.columns.flatMap((column) => {
      const known = ctx.columnByKey.get(column.key);
      return known ? [{ key: column.key, label: column.label ?? known.label }] : [];
    });
    const lines = [
      columns.map((column) => csvCell(column.label)).join(';'),
      ...sortRows(rows, config.sortBy, config.sortDir).map((row) =>
        columns.map((column) => csvCell(row.values[column.key] ?? '')).join(';'),
      ),
    ];
    // BOM + ";" + CRLF: o Excel em português abre com acentos e colunas certas.
    const buffer = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');

    this.eventEmitter.emit('responses.exported', new ResponseExportedEvent(actor.sub, formId, 'csv', rows.length));
    return { buffer, filename: this.reportFilename(ctx, 'csv'), count: rows.length };
  }

  private async prepareReport(
    formId: string,
    filters: RecordFiltersDto,
    rawConfig: unknown,
    actor: AccessActor,
  ): Promise<{ ctx: RecordsContext; config: RecordReportConfig; rows: ReportRow[] }> {
    await this.processAccess.assertFormAccess(formId, actor, 'responses.export');
    const config = normalizeReportConfig(rawConfig);
    const ctx = await this.loadContext(formId, actor);
    if (!config.columns.some((column) => ctx.columnByKey.has(column.key))) {
      throw new BadRequestException('Relatório: nenhuma das colunas escolhidas existe mais neste processo.');
    }

    const qb = await this.baseQuery(ctx, filters, actor);
    qb.orderBy('solicitation.createdAt', 'ASC').addOrderBy('solicitation.id', 'ASC');
    const total = await qb.getCount();
    if (total > MAX_REPORT_ROWS) {
      throw new BadRequestException(
        `O relatório teria ${total.toLocaleString('pt-BR')} registros; o máximo é ${MAX_REPORT_ROWS.toLocaleString('pt-BR')}. Filtre por período ou por fase.`,
      );
    }
    const rows = (await this.buildRows(ctx, await qb.getMany())).map(
      ({ row, sortValues }) => ({ values: row.values, sortValues }) satisfies ReportRow,
    );
    return { ctx, config, rows };
  }

  private reportFilename(ctx: RecordsContext, extension: 'pdf' | 'csv'): string {
    const day = new Date().toISOString().slice(0, 10);
    return `registros-${slug(ctx.form.name)}-${day}.${extension}`;
  }

  // ─── Contexto ───────────────────────────────────────────────────────────

  private async loadContext(formId: string, actor: AccessActor): Promise<RecordsContext> {
    const form = await this.processAccess.assertProcessVisible(formId, actor);
    const grants = await this.processAccess.grantsOf(actor);
    const canSeeSensitive = grants.scope(formId, 'responses.view_sensitive') !== 'none';

    const [phases, formFieldRows, statusRows, assigneeRows] = await Promise.all([
      this.dataSource.getRepository(KanbanPhaseEntity).find({ where: { formId }, order: { order: 'ASC' } }),
      this.dataSource
        .getRepository(FormFieldEntity)
        .createQueryBuilder('field')
        .innerJoinAndSelect('field.formVersion', 'version')
        .innerJoinAndSelect('field.section', 'section')
        .leftJoinAndSelect('field.options', 'options')
        .where('version.form_id = :formId', { formId })
        .getMany(),
      this.solicitationsRepository
        .createQueryBuilder('solicitation')
        .select('DISTINCT solicitation.status', 'status')
        .where('solicitation.form_id = :formId', { formId })
        .getRawMany<{ status: string }>(),
      this.dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .select(['user.id', 'user.fullName'])
        .where(
          'user.id IN (SELECT s.assignee_id FROM solicitations s WHERE s.form_id = :formId AND s.assignee_id IS NOT NULL)',
          { formId },
        )
        .orderBy('user.fullName', 'ASC')
        .getMany(),
    ]);
    const phaseFieldRows = phases.length
      ? await this.dataSource
          .getRepository(KanbanPhaseFieldEntity)
          .find({ where: { phaseId: In(phases.map((phase) => phase.id)) } })
      : [];

    const formFields = collectFormFields(
      formFieldRows.map((field) => ({
        field,
        versionNumber: field.formVersion.versionNumber,
        sectionOrder: field.section?.order ?? 0,
      })),
    );
    const phase = phaseColumns(phases, phaseFieldRows);
    const columns = [
      ...systemColumns({
        phases,
        assignees: assigneeRows.map((user) => ({ id: user.id, name: user.fullName })),
        statuses: orderStatuses(statusRows.map((row) => row.status)),
      }),
      ...formColumns(formFields, canSeeSensitive),
      ...phase.columns,
    ];
    return {
      form,
      grants,
      canSeeSensitive,
      phases,
      formFields,
      phaseFields: phase.fields,
      columns,
      columnByKey: new Map(columns.map((column) => [column.key, column])),
    };
  }

  // ─── Consulta ───────────────────────────────────────────────────────────

  /**
   * Os cards do processo que a pessoa alcança — mesma regra do Kanban e das antigas Respostas: quem vê
   * as respostas ou as solicitações do processo inteiro vê todos; os demais, os próprios (abriu ou é
   * responsável). O filtro de cards da fase esconde dos dois. Depois, os filtros da tela.
   */
  private async baseQuery(
    ctx: RecordsContext,
    filters: RecordFiltersDto,
    actor: AccessActor,
  ): Promise<SelectQueryBuilder<SolicitationEntity>> {
    const formId = ctx.form.id;
    const qb = this.solicitationsRepository
      .createQueryBuilder('solicitation')
      .leftJoinAndSelect('solicitation.submission', 'submission')
      .leftJoinAndSelect('solicitation.assignee', 'assignee')
      .leftJoinAndSelect('solicitation.createdByUser', 'createdByUser')
      .where('solicitation.form_id = :formId', { formId });

    const seesAll =
      ctx.grants.scope(formId, 'responses.view') === 'all' ||
      ctx.grants.scope(formId, 'solicitations.view') === 'all';
    if (!seesAll) this.processAccess.applySolicitationScopeWith(qb, ctx.grants);

    const hiddenIds = (await this.processAccess.hiddenCards(actor, formId)).map((card) => card.id);
    if (hiddenIds.length) {
      qb.andWhere('NOT (solicitation.id = ANY(CAST(:hiddenCardIds AS uuid[])))', { hiddenCardIds: hiddenIds });
    }

    const dateColumn = filters.dateField === 'updatedAt' ? 'solicitation.updated_at' : 'solicitation.created_at';
    if (filters.from) qb.andWhere(`${dateColumn} >= :periodFrom`, { periodFrom: new Date(filters.from) });
    if (filters.to) qb.andWhere(`${dateColumn} <= :periodTo`, { periodTo: new Date(filters.to) });

    const search = filters.search?.trim();
    if (search) this.applySearch(qb, ctx, search);

    (filters.filters ?? []).forEach((filter, index) => this.applyFilter(qb, ctx, filter, index));
    return qb;
  }

  /** Códigos de resposta em que se pode procurar: os sensíveis só para quem os vê. */
  private searchableFormCodes(ctx: RecordsContext): string[] | null {
    if (ctx.canSeeSensitive) return null;
    return [...ctx.formFields.entries()].filter(([, field]) => !field.isSensitive).map(([code]) => code);
  }

  private applySearch(qb: SelectQueryBuilder<SolicitationEntity>, ctx: RecordsContext, search: string): void {
    const pattern = like(search);
    const allowedCodes = this.searchableFormCodes(ctx);
    // Escolhas guardam o valor interno; quem busca digita o rótulo. Acha as opções pelo rótulo.
    const wanted = normalizeText(search);
    const optionHits: Array<{ code: string; value: string }> = [];
    for (const [code, field] of ctx.formFields) {
      if (allowedCodes && !allowedCodes.includes(code)) continue;
      for (const option of field.options) {
        if (normalizeText(option.displayLabel).includes(wanted)) optionHits.push({ code, value: option.internalValue });
      }
    }

    qb.andWhere(
      new Brackets((where) => {
        where
          .where('solicitation.title ILIKE :searchText')
          .orWhere('solicitation.description ILIKE :searchText')
          .orWhere('submission.responder_name ILIKE :searchText')
          .orWhere('submission.responder_email ILIKE :searchText')
          .orWhere('assignee.full_name ILIKE :searchText')
          .orWhere('createdByUser.full_name ILIKE :searchText')
          .orWhere('CAST(solicitation.id AS text) ILIKE :searchId')
          .orWhere(
            `EXISTS (SELECT 1 FROM submission_items si WHERE si.submission_id = solicitation.submission_id
              ${allowedCodes ? 'AND si.field_code = ANY(CAST(:searchCodes AS text[]))' : ''}
              AND (si.value_text ILIKE :searchText OR CAST(si.value_number AS text) ILIKE :searchText
                   OR CAST(si.value_json AS text) ILIKE :searchText))`,
          )
          .orWhere(
            `EXISTS (SELECT 1 FROM kanban_phase_field_values kv WHERE kv.solicitation_id = solicitation.id
              AND (kv.value_text ILIKE :searchText OR CAST(kv.value_number AS text) ILIKE :searchText
                   OR CAST(kv.value_json AS text) ILIKE :searchText))`,
          );
        optionHits.forEach((hit, index) => {
          where.orWhere(
            `EXISTS (SELECT 1 FROM submission_items si WHERE si.submission_id = solicitation.submission_id
              AND si.field_code = :searchOptCode${index}
              AND (si.value_text = :searchOptValue${index}
                   OR (jsonb_typeof(si.value_json) = 'array' AND si.value_json ? :searchOptValue${index})))`,
            { [`searchOptCode${index}`]: hit.code, [`searchOptValue${index}`]: hit.value },
          );
        });
      }),
      { searchText: pattern, searchId: like(search.replace(/^#/, '').toLowerCase()), ...(allowedCodes ? { searchCodes: allowedCodes } : {}) },
    );
  }

  private applyFilter(
    qb: SelectQueryBuilder<SolicitationEntity>,
    ctx: RecordsContext,
    filter: RecordFilterDto,
    index: number,
  ): void {
    const column = ctx.columnByKey.get(filter.key);
    if (!column) throw new BadRequestException(`Filtro: a coluna "${filter.key}" não existe neste processo.`);
    if (column.filter === 'none') throw new BadRequestException(`Filtro: "${column.label}" não pode ser filtrada.`);
    const values = (filter.values ?? []).filter((value) => value !== '');
    const text = filter.text?.trim() ?? '';
    // Filtro vazio (nada marcado, nada digitado) não restringe.
    if (column.filter === 'text' ? !text : values.length === 0) return;

    const p = (name: string): string => `f${index}${name}`;
    const [group, code] = splitKey(filter.key);

    if (group === 'sys') {
      this.applySystemFilter(qb, ctx, code, values, text, p);
      return;
    }

    const source =
      group === 'form'
        ? `FROM submission_items v WHERE v.submission_id = solicitation.submission_id AND v.field_code = :${p('code')}`
        : `FROM kanban_phase_field_values v WHERE v.solicitation_id = solicitation.id AND v.field_code = :${p('code')}`;
    if (column.filter === 'text') {
      // Quem filtra digita como a tela mostra (83,5 · 03/11/2026); o banco guarda 83.5 · 2026-11-03.
      const stored = storedVariant(text);
      qb.andWhere(
        `EXISTS (SELECT 1 ${source} AND (v.value_text ILIKE :${p('text')} OR CAST(v.value_number AS text) ILIKE :${p('text')}
          OR CAST(v.value_json AS text) ILIKE :${p('text')}
          ${stored ? `OR v.value_text ILIKE :${p('stored')} OR CAST(v.value_number AS text) ILIKE :${p('stored')}` : ''}))`,
        { [p('code')]: code, [p('text')]: like(text), ...(stored ? { [p('stored')]: like(stored) } : {}) },
      );
    } else if (column.filter === 'boolean') {
      const booleans = values.filter((value) => value === 'true' || value === 'false').map((value) => value === 'true');
      if (!booleans.length) return;
      qb.andWhere(`EXISTS (SELECT 1 ${source} AND v.value_boolean = ANY(CAST(:${p('values')} AS boolean[])))`, {
        [p('code')]: code,
        [p('values')]: booleans,
      });
    } else {
      qb.andWhere(
        `EXISTS (SELECT 1 ${source} AND (v.value_text = ANY(CAST(:${p('values')} AS text[]))
          OR (jsonb_typeof(v.value_json) = 'array' AND v.value_json ?| CAST(:${p('values')} AS text[]))))`,
        { [p('code')]: code, [p('values')]: values },
      );
    }
  }

  private applySystemFilter(
    qb: WhereExpressionBuilder,
    ctx: RecordsContext,
    name: string,
    values: string[],
    text: string,
    p: (name: string) => string,
  ): void {
    switch (name) {
      case 'phase': {
        // Card sem fase (ou numa fase que não existe mais) está na primeira — como no Kanban.
        const first = ctx.phases[0]?.id;
        const allIds = ctx.phases.map((phase) => phase.id);
        const ids = values.filter(isUuid);
        if (!ids.length) return;
        const params = { [p('values')]: ids, [p('all')]: allIds };
        if (first && ids.includes(first)) {
          qb.andWhere(
            `(solicitation.current_phase_id = ANY(CAST(:${p('values')} AS uuid[])) OR solicitation.current_phase_id IS NULL
              OR NOT (solicitation.current_phase_id = ANY(CAST(:${p('all')} AS uuid[]))))`,
            params,
          );
        } else {
          qb.andWhere(`solicitation.current_phase_id = ANY(CAST(:${p('values')} AS uuid[]))`, params);
        }
        return;
      }
      case 'status':
        qb.andWhere(`solicitation.status IN (:...${p('values')})`, { [p('values')]: values });
        return;
      case 'priority':
        qb.andWhere(`solicitation.priority IN (:...${p('values')})`, { [p('values')]: values });
        return;
      case 'origin':
        qb.andWhere(`solicitation.origin_type IN (:...${p('values')})`, { [p('values')]: values });
        return;
      case 'sla':
        qb.andWhere(`CAST(solicitation.sla_status AS text) IN (:...${p('values')})`, { [p('values')]: values });
        return;
      case 'assignee': {
        const ids = values.filter((value) => value !== '__none__' && isUuid(value));
        const none = values.includes('__none__');
        const parts = [
          ...(ids.length ? [`solicitation.assignee_id = ANY(CAST(:${p('values')} AS uuid[]))`] : []),
          ...(none ? ['solicitation.assignee_id IS NULL'] : []),
        ];
        if (parts.length) qb.andWhere(`(${parts.join(' OR ')})`, { [p('values')]: ids });
        return;
      }
      case 'title':
        qb.andWhere(`solicitation.title ILIKE :${p('text')}`, { [p('text')]: like(text) });
        return;
      case 'requester':
        qb.andWhere(`COALESCE(createdByUser.full_name, submission.responder_name, '') ILIKE :${p('text')}`, {
          [p('text')]: like(text),
        });
        return;
      case 'requesterEmail':
        qb.andWhere(`COALESCE(createdByUser.email, submission.responder_email, '') ILIKE :${p('text')}`, {
          [p('text')]: like(text),
        });
        return;
      default:
        throw new BadRequestException(`Filtro: "${name}" não pode ser filtrada.`);
    }
  }

  // ─── Linhas ─────────────────────────────────────────────────────────────

  private async buildRows(
    ctx: RecordsContext,
    cards: SolicitationEntity[],
  ): Promise<Array<{ row: RecordRow; sortValues: Record<string, string | number> }>> {
    if (cards.length === 0) return [];
    const submissionIds = cards.map((card) => card.submissionId).filter((id): id is string => !!id);
    const [items, phaseValues] = await Promise.all([
      submissionIds.length
        ? this.dataSource.getRepository(SubmissionItemEntity).find({ where: { submissionId: In(submissionIds) } })
        : Promise.resolve([] as SubmissionItemEntity[]),
      this.dataSource
        .getRepository(KanbanPhaseFieldValueEntity)
        .find({ where: { solicitationId: In(cards.map((card) => card.id)) } }),
    ]);
    const itemsBySubmission = groupBy(items, (item) => item.submissionId);
    const valuesByCard = groupBy(phaseValues, (value) => value.solicitationId);
    const phaseById = new Map(ctx.phases.map((phase) => [phase.id, phase]));
    const firstPhase = ctx.phases[0];

    return cards.map((card) => {
      const values: Record<string, string> = {};
      const sortValues: Record<string, string | number> = {};
      const phase = (card.currentPhaseId ? phaseById.get(card.currentPhaseId) : undefined) ?? firstPhase;
      const requester = card.createdByUser?.fullName ?? card.submission?.responderName ?? '';
      const requesterEmail = card.createdByUser?.email ?? card.submission?.responderEmail ?? '';
      const phaseEnteredAt = card.phaseEnteredAt ?? card.createdAt;

      values['sys:code'] = shortCode(card.id);
      values['sys:title'] = card.title;
      values['sys:phase'] = phase?.label ?? '';
      if (phase) sortValues['sys:phase'] = phase.order;
      values['sys:status'] = STATUS_LABELS[card.status] ?? card.status;
      values['sys:priority'] = PRIORITY_LABELS[card.priority] ?? card.priority;
      sortValues['sys:priority'] = ['low', 'medium', 'high', 'urgent'].indexOf(card.priority);
      values['sys:assignee'] = card.assignee?.fullName ?? '';
      values['sys:requester'] = requester;
      values['sys:requesterEmail'] = requesterEmail;
      values['sys:origin'] = ORIGIN_LABELS[card.originType] ?? card.originType;
      values['sys:sla'] = card.slaStatus ? (SLA_LABELS[card.slaStatus] ?? card.slaStatus) : '';
      values['sys:createdAt'] = formatDateTime(card.createdAt);
      sortValues['sys:createdAt'] = toTime(card.createdAt);
      values['sys:updatedAt'] = formatDateTime(card.updatedAt);
      sortValues['sys:updatedAt'] = toTime(card.updatedAt);
      values['sys:phaseEnteredAt'] = formatDateTime(phaseEnteredAt);
      sortValues['sys:phaseEnteredAt'] = toTime(phaseEnteredAt);

      for (const item of itemsBySubmission.get(card.submissionId ?? '') ?? []) {
        const field = ctx.formFields.get(item.fieldCode);
        if (!field) continue;
        const key = `form:${item.fieldCode}`;
        const masked = ctx.columnByKey.get(key)?.masked;
        values[key] = masked ? '***' : formatRecordValue(item, field);
        if (!masked && typeof item.valueNumber === 'number') sortValues[key] = item.valueNumber;
        if (!masked && field.fieldType === 'date' && item.valueText) sortValues[key] = item.valueText;
      }
      for (const stored of valuesByCard.get(card.id) ?? []) {
        const field = ctx.phaseFields.get(stored.fieldCode);
        if (!field) continue;
        const key = `phase:${stored.fieldCode}`;
        values[key] = formatRecordValue(stored, field);
        if (typeof stored.valueNumber === 'number') sortValues[key] = stored.valueNumber;
        if (field.fieldType === 'date' && stored.valueText) sortValues[key] = stored.valueText;
      }

      return { row: { id: card.id, submissionId: card.submissionId, values }, sortValues };
    });
  }

  /** Os filtros em texto para o cabeçalho do PDF. */
  private describeFilters(ctx: RecordsContext, filters: RecordFiltersDto): string[] {
    const parts: string[] = [];
    if (filters.from || filters.to) {
      const basis = filters.dateField === 'updatedAt' ? 'Atualizado' : 'Aberto';
      const day = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      if (filters.from && filters.to) parts.push(`${basis} de ${day(filters.from)} a ${day(filters.to)}`);
      else if (filters.from) parts.push(`${basis} a partir de ${day(filters.from)}`);
      else if (filters.to) parts.push(`${basis} até ${day(filters.to)}`);
    }
    if (filters.search?.trim()) parts.push(`Busca: "${filters.search.trim()}"`);
    for (const filter of filters.filters ?? []) {
      const column = ctx.columnByKey.get(filter.key);
      if (!column) continue;
      if (column.filter === 'text' && filter.text?.trim()) {
        parts.push(`${column.label} contém "${filter.text.trim()}"`);
        continue;
      }
      const values = (filter.values ?? []).filter(Boolean);
      if (!values.length) continue;
      const labelOf = (value: string): string =>
        column.filter === 'boolean'
          ? value === 'true'
            ? 'Sim'
            : 'Não'
          : (column.options?.find((option) => option.value === value)?.label ?? value);
      parts.push(`${column.label}: ${values.map(labelOf).join(', ')}`);
    }
    return parts;
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────

function splitKey(key: string): ['sys' | 'form' | 'phase', string] {
  const index = key.indexOf(':');
  return [key.slice(0, index) as 'sys' | 'form' | 'phase', key.slice(index + 1)];
}

function groupBy<T>(list: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const key = keyOf(item);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

function toTime(value: Date | string | null | undefined): number | string {
  if (!value) return '';
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(time) ? '' : time;
}

/**
 * O texto digitado no formato em que o banco guarda, quando é data ou número brasileiro:
 * "03/11/2026" → "2026-11-03", "03/11" → "-11-03", "1.234,5" → "1234.5". Nada a trocar → null.
 */
export function storedVariant(text: string): string | null {
  const full = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (full) return `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
  const dayMonth = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (dayMonth) return `-${dayMonth[2].padStart(2, '0')}-${dayMonth[1].padStart(2, '0')}`;
  if (/^-?\d{1,3}(\.\d{3})*(,\d*)?$/.test(text) && (text.includes(',') || text.includes('.'))) {
    return text.replace(/\./g, '').replace(',', '.');
  }
  if (/^-?\d+,\d*$/.test(text)) return text.replace(',', '.');
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string): boolean => UUID.test(value);

/** Status na ordem do fluxo do Kanban; os que não estão na lista vão para o fim. */
function orderStatuses(statuses: string[]): string[] {
  const order = Object.keys(STATUS_LABELS);
  const rank = (status: string): number => {
    const position = ['new', 'in_analysis', 'waiting_approval', 'in_progress', 'waiting_integration', 'approved', 'rejected', 'completed', 'cancelled'].indexOf(status);
    return position === -1 ? 100 + order.indexOf(status) : position;
  };
  return [...new Set(statuses.filter(Boolean))].sort((a, b) => rank(a) - rank(b));
}

function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'processo'
  );
}

/**
 * Célula de CSV separado por ";": aspas quando há separador, aspas ou quebra de linha, e o mesmo
 * neutralizador de fórmula do export de Respostas (=, +, -, @ no início viram texto na planilha).
 */
export function csvCell(value: string): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
