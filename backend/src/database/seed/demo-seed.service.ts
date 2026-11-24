import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { BCRYPT_COST_FACTOR } from '../../common/constants/security.constants';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../common/enums/approval-step-status.enum';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationSlaStatus } from '../../common/enums/solicitation-sla-status.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import {
  createDefaultKanbanPhases,
  defaultStageForStatus,
} from '../../modules/kanban-phases/default-kanban-phases';
import type {
  ActionCreateApprovalData,
  ActionNotifyUsersData,
  ConditionFieldValueData,
  FlowEdge,
  FlowNode,
  TriggerFormSubmitData,
} from '../../modules/flows/types/flow.types';

export type DemoSeedResult = {
  success: boolean;
  created: {
    areas: number;
    users: number;
    forms: number;
    solicitations: number;
    flows: number;
  };
};

const DEMO_PASSWORD = 'FormHub@Demo123';
const DEMO_TAG = 'demo';

@Injectable()
export class DemoSeedService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async seedAll(): Promise<DemoSeedResult> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Seed de demonstração não disponível em produção.');
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST_FACTOR);

    return this.dataSource.transaction(async (manager) => {
      const adminId = await this.resolveAdminId(manager);
      const { ids: areaIds, created: areasCreated } = await this.seedAreas(manager);
      const { ids: userIds, created: usersCreated } = await this.seedUsers(
        manager,
        areaIds,
        passwordHash,
      );
      await this.upsertSettings(manager);
      const { ids: formIds, created: formsCreated } = await this.seedForms(
        manager,
        areaIds,
        adminId,
      );
      const { created: solicitationsCreated } = await this.seedSolicitations(
        manager,
        formIds,
        areaIds,
        userIds,
        adminId,
      );
      const { created: flowsCreated } = await this.seedFlows(manager, formIds, userIds, adminId);

      return {
        success: true,
        created: {
          areas: areasCreated,
          users: usersCreated,
          forms: formsCreated,
          solicitations: solicitationsCreated,
          flows: flowsCreated,
        },
      };
    });
  }

  // ─── Admin user resolution ────────────────────────────────────────────────

  private async resolveAdminId(manager: EntityManager): Promise<string> {
    const rows = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM users WHERE email = 'admin@tijucaalimentos.com' LIMIT 1`,
    );
    if (rows[0]) return rows[0].id;

    const fallback = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM users WHERE role = $1 ORDER BY created_at LIMIT 1`,
      ['admin'],
    );
    if (!fallback[0]) throw new Error('Nenhum usuário admin encontrado. Execute o seed principal antes.');
    return fallback[0].id;
  }

  // ─── Areas ───────────────────────────────────────────────────────────────

  private async seedAreas(
    manager: EntityManager,
  ): Promise<{ ids: Record<string, string>; created: number }> {
    const defs = [
      { name: 'Recursos Humanos', code: 'RH' },
      { name: 'Tecnologia da Informação', code: 'TI' },
      { name: 'Financeiro', code: 'FIN' },
      { name: 'Logística', code: 'LOG' },
    ];

    let created = 0;
    const ids: Record<string, string> = {};

    for (const def of defs) {
      const rows = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM areas WHERE name = $1 LIMIT 1`,
        [def.name],
      );
      if (rows[0]) {
        ids[def.code] = rows[0].id;
      } else {
        const id = randomUUID();
        await manager.query(
          `INSERT INTO areas (id, name, code, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, true, NOW(), NOW())`,
          [id, def.name, def.code],
        );
        ids[def.code] = id;
        created++;
      }
    }

    return { ids, created };
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  private async seedUsers(
    manager: EntityManager,
    areaIds: Record<string, string>,
    passwordHash: string,
  ): Promise<{ ids: Record<string, string>; created: number }> {
    const defs = [
      { key: 'gerente.rh', email: 'gerente.rh@formhub.local', fullName: 'Carla Mendes', role: 'manager', areaCode: 'RH' },
      { key: 'gerente.ti', email: 'gerente.ti@formhub.local', fullName: 'Rafael Souza', role: 'manager', areaCode: 'TI' },
      { key: 'editor.rh', email: 'editor.rh@formhub.local', fullName: 'Beatriz Lima', role: 'editor', areaCode: 'RH' },
      { key: 'editor.ti', email: 'editor.ti@formhub.local', fullName: 'Lucas Ferreira', role: 'editor', areaCode: 'TI' },
      { key: 'editor.fin', email: 'editor.fin@formhub.local', fullName: 'Mariana Costa', role: 'editor', areaCode: 'FIN' },
      { key: 'viewer.log', email: 'viewer.log@formhub.local', fullName: 'Pedro Alves', role: 'viewer', areaCode: 'LOG' },
    ];

    let created = 0;
    const ids: Record<string, string> = {};

    for (const def of defs) {
      const rows = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [def.email],
      );
      if (rows[0]) {
        ids[def.key] = rows[0].id;
      } else {
        const id = randomUUID();
        await manager.query(
          `INSERT INTO users
             (id, full_name, email, password_hash, password_defined_at, role, is_active,
              token_version, area_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), $5, true, 0, $6, NOW(), NOW())`,
          [id, def.fullName, def.email, passwordHash, def.role, areaIds[def.areaCode]],
        );
        ids[def.key] = id;
        created++;
      }
    }

    return { ids, created };
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  private async upsertSettings(manager: EntityManager): Promise<void> {
    const updates = [
      { key: 'org.name', value: 'Grupo Tijuca Alimentos' },
      { key: 'sla.default_hours', value: '48' },
      { key: 'security.password_min_length', value: '8' },
    ];
    for (const { key, value } of updates) {
      await manager.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, value],
      );
    }
  }

  // ─── Forms ───────────────────────────────────────────────────────────────

  private async seedForms(
    manager: EntityManager,
    areaIds: Record<string, string>,
    createdBy: string,
  ): Promise<{ ids: Record<string, string>; created: number }> {
    let created = 0;
    const ids: Record<string, string> = {};

    const formDefs = [
      {
        key: 'compra',
        name: 'Solicitação de Compra',
        areaCode: 'FIN',
        fields: [
          { code: 'item_descricao', label: 'Descrição do item', type: FormFieldType.SHORT_TEXT, required: true },
          { code: 'valor_total', label: 'Valor total (R$)', type: FormFieldType.CURRENCY, required: true },
          { code: 'justificativa', label: 'Justificativa', type: FormFieldType.LONG_TEXT, required: true },
          { code: 'fornecedor', label: 'Fornecedor sugerido', type: FormFieldType.SHORT_TEXT, required: false },
          { code: 'urgente', label: 'É urgente?', type: FormFieldType.CHECKBOX, required: false },
        ],
      },
      {
        key: 'suporte_ti',
        name: 'Solicitação de Suporte TI',
        areaCode: 'TI',
        fields: [
          {
            code: 'tipo_problema', label: 'Tipo de problema', type: FormFieldType.SINGLE_SELECT, required: true,
            options: ['Hardware', 'Software', 'Rede', 'Acesso'],
          },
          { code: 'descricao', label: 'Descrição do problema', type: FormFieldType.LONG_TEXT, required: true },
          { code: 'equipamento', label: 'Equipamento afetado', type: FormFieldType.SHORT_TEXT, required: false },
          {
            code: 'prioridade_solicitante', label: 'Prioridade', type: FormFieldType.SINGLE_SELECT, required: false,
            options: ['Baixa', 'Média', 'Alta', 'Crítica'],
          },
        ],
      },
      {
        key: 'cadastro_colaborador',
        name: 'Cadastro de Colaborador',
        areaCode: 'RH',
        fields: [
          { code: 'nome_completo', label: 'Nome completo', type: FormFieldType.SHORT_TEXT, required: true },
          { code: 'cpf', label: 'CPF', type: FormFieldType.CPF, required: true, isSensitive: true },
          { code: 'data_admissao', label: 'Data de admissão', type: FormFieldType.DATE, required: true },
          { code: 'cargo', label: 'Cargo', type: FormFieldType.SHORT_TEXT, required: true },
          {
            code: 'departamento', label: 'Departamento', type: FormFieldType.SINGLE_SELECT, required: false,
            options: ['RH', 'TI', 'Financeiro', 'Logística', 'Comercial'],
          },
          { code: 'salario', label: 'Salário', type: FormFieldType.CURRENCY, required: false, isSensitive: true },
        ],
      },
    ];

    for (const def of formDefs) {
      const rows = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM forms WHERE name = $1 LIMIT 1`,
        [def.name],
      );
      if (rows[0]) {
        ids[def.key] = rows[0].id;
        continue;
      }

      const formId = randomUUID();
      await manager.query(
        `INSERT INTO forms
           (id, name, status, area_id, created_by, google_sheets_enabled,
            google_sheets_auto_create, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, false, false, NOW(), NOW())`,
        [formId, def.name, FormStatus.PUBLISHED, areaIds[def.areaCode], createdBy],
      );

      await createDefaultKanbanPhases(manager, formId);

      const versionId = randomUUID();
      await manager.query(
        `INSERT INTO form_versions
           (id, form_id, version_number, title_display, is_published, published_at,
            settings_json, created_at)
         VALUES ($1, $2, 1, $3, true, NOW(), '{}', NOW())`,
        [versionId, formId, def.name],
      );

      const sectionId = randomUUID();
      await manager.query(
        `INSERT INTO form_sections (id, form_version_id, title, "order")
         VALUES ($1, $2, 'Dados', 1)`,
        [sectionId, versionId],
      );

      let fieldOrder = 1;
      for (const field of def.fields) {
        const fieldId = randomUUID();
        await manager.query(
          `INSERT INTO form_fields
             (id, form_version_id, section_id, code, label, field_type, "order",
              required, settings_json, conditions_json, is_sensitive)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{}', '{}', $9)`,
          [
            fieldId,
            versionId,
            sectionId,
            field.code,
            field.label,
            field.type,
            fieldOrder++,
            field.required,
            (field as { isSensitive?: boolean }).isSensitive ?? false,
          ],
        );

        const opts = (field as { options?: string[] }).options ?? [];
        let optOrder = 1;
        for (const opt of opts) {
          await manager.query(
            `INSERT INTO form_field_options
               (id, field_id, internal_value, display_label, "order")
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), fieldId, opt.toLowerCase().replace(/\s+/g, '_'), opt, optOrder++],
          );
        }
      }

      ids[def.key] = formId;
      created++;
    }

    return { ids, created };
  }

  // ─── Solicitations ───────────────────────────────────────────────────────

  private async seedSolicitations(
    manager: EntityManager,
    formIds: Record<string, string>,
    areaIds: Record<string, string>,
    userIds: Record<string, string>,
    adminId: string,
  ): Promise<{ created: number }> {
    const existing = await manager.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM solicitations WHERE metadata->>'seed' = $1`,
      [DEMO_TAG],
    );
    if (parseInt(existing[0]?.count ?? '0', 10) > 0) return { created: 0 };

    const now = new Date();
    const h = (hours: number): Date => new Date(now.getTime() + hours * 3_600_000);
    const meta = (extra?: Record<string, unknown>): string =>
      JSON.stringify({ seed: DEMO_TAG, ...extra });

    type SolDef = {
      title: string;
      status: SolicitationStatus;
      priority: SolicitationPriority;
      formKey: string;
      areaCode: string;
      requesterName: string;
      requesterEmail: string;
      slaStartedAt?: Date;
      slaDueAt?: Date;
      slaStatus?: SolicitationSlaStatus;
      slaBreachedAt?: Date;
      slaDurationHours?: number;
    };

    const defs: SolDef[] = [
      // 2 × NEW
      {
        title: 'Compra de cadeiras ergonômicas',
        status: SolicitationStatus.NEW,
        priority: SolicitationPriority.MEDIUM,
        formKey: 'compra',
        areaCode: 'FIN',
        requesterName: 'João Ribeiro',
        requesterEmail: 'joao.ribeiro@empresa.com',
        slaStartedAt: h(-1),
        slaDueAt: h(47),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaDurationHours: 48,
      },
      {
        title: 'Aquisição de licenças Microsoft 365',
        status: SolicitationStatus.NEW,
        priority: SolicitationPriority.HIGH,
        formKey: 'suporte_ti',
        areaCode: 'TI',
        requesterName: 'Fernanda Gomes',
        requesterEmail: 'fernanda.gomes@empresa.com',
        slaStartedAt: h(-2),
        slaDueAt: h(46),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaDurationHours: 48,
      },
      // 2 × IN_ANALYSIS (1 near SLA breach)
      {
        title: 'Suporte para impressora do 3º andar',
        status: SolicitationStatus.IN_ANALYSIS,
        priority: SolicitationPriority.LOW,
        formKey: 'suporte_ti',
        areaCode: 'TI',
        requesterName: 'Carlos Nunes',
        requesterEmail: 'carlos.nunes@empresa.com',
        slaStartedAt: h(-40),
        slaDueAt: h(8),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaDurationHours: 48,
      },
      {
        title: 'Upgrade de memória RAM servidores',
        status: SolicitationStatus.IN_ANALYSIS,
        priority: SolicitationPriority.URGENT,
        formKey: 'suporte_ti',
        areaCode: 'TI',
        requesterName: 'Ana Paula',
        requesterEmail: 'ana.paula@empresa.com',
        slaStartedAt: h(-46),
        slaDueAt: h(2),
        slaStatus: SolicitationSlaStatus.WARNING,
        slaDurationHours: 48,
      },
      // 1 × WAITING_APPROVAL
      {
        title: 'Compra de servidor de backup',
        status: SolicitationStatus.WAITING_APPROVAL,
        priority: SolicitationPriority.HIGH,
        formKey: 'compra',
        areaCode: 'FIN',
        requesterName: 'Mariana Costa',
        requesterEmail: 'editor.fin@formhub.local',
        slaStartedAt: h(-10),
        slaDueAt: h(38),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaDurationHours: 48,
      },
      // 1 × APPROVED
      {
        title: 'Compra de notebook para design',
        status: SolicitationStatus.APPROVED,
        priority: SolicitationPriority.MEDIUM,
        formKey: 'compra',
        areaCode: 'FIN',
        requesterName: 'Beatriz Lima',
        requesterEmail: 'editor.rh@formhub.local',
        slaStartedAt: h(-20),
        slaDueAt: h(28),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaDurationHours: 48,
      },
      // 2 × IN_PROGRESS (1 com SLA vencido)
      {
        title: 'Cadastro de estagiário Financeiro',
        status: SolicitationStatus.IN_PROGRESS,
        priority: SolicitationPriority.LOW,
        formKey: 'cadastro_colaborador',
        areaCode: 'RH',
        requesterName: 'Carla Mendes',
        requesterEmail: 'gerente.rh@formhub.local',
        slaStartedAt: h(-30),
        slaDueAt: h(18),
        slaStatus: SolicitationSlaStatus.ON_TRACK,
        slaDurationHours: 48,
      },
      {
        title: 'Contratação analista de dados',
        status: SolicitationStatus.IN_PROGRESS,
        priority: SolicitationPriority.HIGH,
        formKey: 'cadastro_colaborador',
        areaCode: 'RH',
        requesterName: 'Rafael Souza',
        requesterEmail: 'gerente.ti@formhub.local',
        slaStartedAt: h(-72),
        slaDueAt: h(-24),
        slaStatus: SolicitationSlaStatus.BREACHED,
        slaBreachedAt: h(-24),
        slaDurationHours: 48,
      },
      // 1 × COMPLETED
      {
        title: 'Compra de papel A4 (5 resmas)',
        status: SolicitationStatus.COMPLETED,
        priority: SolicitationPriority.LOW,
        formKey: 'compra',
        areaCode: 'FIN',
        requesterName: 'Pedro Alves',
        requesterEmail: 'viewer.log@formhub.local',
        slaStartedAt: h(-96),
        slaDueAt: h(-48),
        slaStatus: SolicitationSlaStatus.COMPLETED,
        slaDurationHours: 48,
      },
    ];

    let waitingApprovalId: string | null = null;

    for (const def of defs) {
      const id = randomUUID();
      await manager.query(
        `INSERT INTO solicitations
           (id, title, status, priority, origin_type, form_id, area_id, created_by,
            sla_started_at, sla_due_at, sla_status, sla_breached_at, sla_duration_hours,
            sla_warning_threshold_percent, metadata, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            80, $14, NOW(), NOW())`,
        [
          id,
          def.title,
          def.status,
          def.priority,
          SolicitationOriginType.MANUAL,
          formIds[def.formKey],
          areaIds[def.areaCode],
          adminId,
          def.slaStartedAt ?? null,
          def.slaDueAt ?? null,
          def.slaStatus ?? null,
          def.slaBreachedAt ?? null,
          def.slaDurationHours ?? null,
          meta({ requesterName: def.requesterName, requesterEmail: def.requesterEmail }),
        ],
      );

      // Posiciona o card na fase padrão equivalente ao status (o board é sempre por fase).
      await manager.query(
        `UPDATE solicitations
         SET current_phase_id = (SELECT id FROM kanban_phases WHERE form_id = $2 AND key = $3)
         WHERE id = $1`,
        [id, formIds[def.formKey], defaultStageForStatus(def.status)],
      );

      if (def.status === SolicitationStatus.WAITING_APPROVAL) {
        waitingApprovalId = id;
      }
    }

    if (waitingApprovalId) {
      await this.createPendingApproval(manager, waitingApprovalId, userIds, adminId);
    }

    return { created: defs.length };
  }

  private async createPendingApproval(
    manager: EntityManager,
    solicitationId: string,
    userIds: Record<string, string>,
    createdBy: string,
  ): Promise<void> {
    const approvalId = randomUUID();
    await manager.query(
      `INSERT INTO approvals
         (id, solicitation_id, status, title, required_decisions, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, $5, NOW(), NOW())`,
      [
        approvalId,
        solicitationId,
        ApprovalStatus.PENDING,
        'Aprovação gerencial necessária',
        createdBy,
      ],
    );

    const assigneeId = userIds['editor.fin'];
    await manager.query(
      `INSERT INTO approval_steps
         (id, approval_id, assigned_user_id, status, "order")
       VALUES ($1, $2, $3, $4, 1)`,
      [randomUUID(), approvalId, assigneeId, ApprovalStepStatus.PENDING],
    );
  }

  // ─── Flows ───────────────────────────────────────────────────────────────

  private async seedFlows(
    manager: EntityManager,
    formIds: Record<string, string>,
    userIds: Record<string, string>,
    createdBy: string,
  ): Promise<{ created: number }> {
    const flowName = 'Aprovação automática de compras';
    const rows = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM flows WHERE name = $1 LIMIT 1`,
      [flowName],
    );
    if (rows[0]) return { created: 0 };

    const nodes: FlowNode[] = [
      {
        id: 'n-trigger',
        type: 'trigger_form_submit',
        position: { x: 250, y: 50 },
        data: {} satisfies TriggerFormSubmitData,
      },
      {
        id: 'n-condition',
        type: 'condition_field_value',
        position: { x: 250, y: 180 },
        data: {
          fieldCode: 'valor_total',
          operator: 'greater_than',
          value: '5000',
          label: 'Valor > R$ 5.000?',
        } satisfies ConditionFieldValueData,
      },
      {
        id: 'n-approval',
        type: 'action_create_approval',
        position: { x: 50, y: 340 },
        data: {
          title: 'Aprovação gerencial necessária',
          assignedUserIds: [userIds['gerente.ti']],
          label: 'Criar aprovação gerencial',
        } satisfies ActionCreateApprovalData,
      },
      {
        id: 'n-notify',
        type: 'action_notify_users',
        position: { x: 450, y: 340 },
        data: {
          userIds: [userIds['editor.fin']],
          message: 'Compra de baixo valor aprovada automaticamente: {{solicitation_title}}',
          label: 'Notificar financeiro',
        } satisfies ActionNotifyUsersData,
      },
    ];

    const edges: FlowEdge[] = [
      { id: 'e-trigger-condition', source: 'n-trigger', target: 'n-condition' },
      { id: 'e-condition-yes', source: 'n-condition', sourceHandle: 'yes', target: 'n-approval' },
      { id: 'e-condition-no', source: 'n-condition', sourceHandle: 'no', target: 'n-notify' },
    ];

    await manager.query(
      `INSERT INTO flows (id, form_id, name, is_active, nodes, edges, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, $6, NOW(), NOW())`,
      [
        randomUUID(),
        formIds['compra'],
        flowName,
        JSON.stringify(nodes),
        JSON.stringify(edges),
        createdBy,
      ],
    );

    return { created: 1 };
  }
}
