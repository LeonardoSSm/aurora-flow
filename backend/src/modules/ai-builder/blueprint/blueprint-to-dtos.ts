import type { CreateFlowDto } from '../../flows/dto/create-flow.dto';
import type { CreateFormDto, CreateFormFieldDto, CreateFormSectionDto } from '../../forms/dto/create-form.dto';
import type {
  KanbanPhaseFieldInputDto,
  KanbanPhaseInputDto,
  KanbanPhaseSectionRouteDto,
  SaveKanbanPhasesDto,
} from '../../kanban-phases/dto/save-kanban-phases.dto';
import { CONDITION_NODE_TYPES, PHASE_COLORS } from './blueprint-catalog';
import {
  FORM_SETTING_FLAGS,
  FORM_SUBMIT,
  PHASE_FORM_END,
  type BlueprintField,
  type BlueprintFlow,
  type BlueprintIssue,
  type BlueprintPeople,
  type BlueprintSection,
  type ProcessBlueprint,
} from './process-blueprint.types';

/**
 * Do processo (já conferido por validateBlueprint) para o que os serviços gravam: CreateFormDto,
 * SaveKanbanPhasesDto e CreateFlowDto. Pessoas por e-mail viram ids; fases por chave viram ids
 * (só depois de gravar as fases — por isso os fluxos convertem por último).
 */

const lower = (value: string): string => value.trim().toLowerCase();

function peopleIds(
  people: BlueprintPeople | undefined,
  userIdByEmail: Map<string, string>,
): { roleCodes: string[]; userIds: string[] } {
  return {
    roleCodes: [...new Set(people?.roles ?? [])],
    userIds: [...new Set((people?.users ?? []).map((email) => userIdByEmail.get(lower(email))).filter(Boolean) as string[])],
  };
}

function toFormField(field: BlueprintField): CreateFormFieldDto {
  return {
    code: field.code,
    label: field.label ?? '',
    fieldType: field.type as CreateFormFieldDto['fieldType'],
    required: field.required ?? false,
    isSensitive: field.sensitive ?? false,
    settingsJson: field.settings ?? {},
    ...(field.visibility
      ? {
          visibilityRules: [
            {
              operator: field.visibility.operator ?? 'and',
              action: field.visibility.action,
              conditions: field.visibility.conditions.map((condition) => ({
                fieldCode: condition.field,
                operator: condition.op,
                ...(condition.value !== undefined ? { value: condition.value } : {}),
              })),
            },
          ],
        }
      : {}),
    ...(field.options?.length
      ? { options: field.options.map((option) => ({ internalValue: option.value, displayLabel: option.label })) }
      : {}),
  };
}

export function blueprintToFormDto(bp: ProcessBlueprint, actorId: string): CreateFormDto {
  const sections = bp.form.sections;
  const indexOf = new Map(sections.map((section, index) => [section.key, index]));
  const target = (goTo: string): number | null => (goTo === FORM_SUBMIT ? null : (indexOf.get(goTo) ?? null));

  return {
    name: bp.name.trim(),
    ...(bp.description ? { description: bp.description } : {}),
    ...(bp.category ? { category: bp.category } : {}),
    areaId: bp.areaId ?? null,
    // Quem criou entra como responsável: vê e edita o processo mesmo fora da área.
    assignedUserIds: [actorId],
    settingsJson: {
      mode: bp.form.mode ?? (sections.length > 3 ? 'stepper' : 'single'),
      // Opções do processo só entram quando vieram nele (ausente = padrão do sistema).
      ...Object.fromEntries(
        FORM_SETTING_FLAGS.flatMap((flag) => (typeof bp.form[flag] === 'boolean' ? [[flag, bp.form[flag]]] : [])),
      ),
    },
    sections: sections.map((section, index): CreateFormSectionDto => {
      const next = section.next?.default;
      return {
        title: section.title,
        ...(section.description ? { description: section.description } : {}),
        nextSectionIndex: next === undefined ? (index + 1 < sections.length ? index + 1 : null) : target(next),
        branches: (section.next?.branches ?? []).map((branch) => ({
          fieldCode: branch.field,
          ...(branch.option !== undefined ? { optionValue: branch.option } : {}),
          ...(branch.checked !== undefined ? { checkboxValue: branch.checked } : {}),
          targetSectionIndex: target(branch.goTo),
        })),
        fields: section.fields.map(toFormField),
      };
    }),
  };
}

function toPhaseFields(sections: BlueprintSection[]): KanbanPhaseFieldInputDto[] {
  const fields: KanbanPhaseFieldInputDto[] = [];
  for (const section of sections) {
    // A seção da fase é aberta por um campo "Título" com o código = chave da seção.
    fields.push({ code: section.key, label: section.title, fieldType: 'title' as KanbanPhaseFieldInputDto['fieldType'], order: fields.length });
    for (const field of section.fields) {
      fields.push({
        code: field.code,
        label: field.label ?? '',
        fieldType: field.type as KanbanPhaseFieldInputDto['fieldType'],
        required: field.required ?? false,
        order: fields.length,
        settingsJson: field.settings ?? null,
        ...(field.options?.length ? { options: field.options.map((option) => ({ value: option.value, label: option.label })) } : {}),
      });
    }
  }
  return fields;
}

function toPhaseSectionFlow(sections: BlueprintSection[]): KanbanPhaseSectionRouteDto[] | null {
  const routes: KanbanPhaseSectionRouteDto[] = [];
  for (const section of sections) {
    const next = section.next;
    if (!next || (next.default === undefined && !next.branches?.length)) continue;
    routes.push({
      section: section.key,
      ...(next.default !== undefined ? { next: next.default === PHASE_FORM_END ? null : next.default } : {}),
      branches: (next.branches ?? []).map((branch) => ({
        fieldCode: branch.field,
        optionValue: branch.option ?? null,
        checkboxValue: branch.checked ?? null,
        target: branch.goTo === PHASE_FORM_END ? null : branch.goTo,
      })),
    });
  }
  return routes.length ? routes : null;
}

export function blueprintToPhasesDto(bp: ProcessBlueprint, userIdByEmail: Map<string, string>): SaveKanbanPhasesDto {
  return {
    phases: bp.phases.map((phase, index): KanbanPhaseInputDto => {
      const approvers = phase.approval ? peopleIds(phase.approval.approvers, userIdByEmail) : null;
      const order = phase.approval?.order?.map((entry) =>
        entry.startsWith('user:') ? `user:${userIdByEmail.get(lower(entry.slice(5))) ?? ''}` : entry,
      );
      const actors = peopleIds(phase.actors, userIdByEmail);
      const visible = phase.visibleTo;
      const sections = phase.sections ?? [];
      return {
        key: phase.key,
        label: phase.label,
        color: phase.color ?? PHASE_COLORS[index % PHASE_COLORS.length],
        description: phase.description ?? null,
        order: index,
        isTerminal: phase.terminal ?? false,
        actors: actors.roleCodes.length + actors.userIds.length > 0 ? actors : null,
        requiresApproval: Boolean(phase.approval),
        approvers: approvers ? { ...approvers, ...(order?.length ? { order } : {}) } : null,
        approvalMode: phase.approval?.rule ?? 'any',
        approvalRequest: phase.approval?.request ?? 'manual',
        approvalOnApproved: phase.approval?.onApproved ?? 'stay',
        approvalOnRejected: phase.approval?.onRejected ?? 'stay',
        requireFieldsToExit: phase.requireFieldsToExit ?? false,
        requireAssigneeToExit: phase.requireAssigneeToExit ?? false,
        blockMoveBack: phase.blockMoveBack ?? false,
        visibleTo: visible
          ? {
              roleCodes: visible.roles ?? [],
              areaIds: visible.areas ?? [],
              userIds: peopleIds({ users: visible.users }, userIdByEmail).userIds,
            }
          : null,
        slaHours: phase.terminal ? null : (phase.sla?.hours ?? null),
        slaBusinessHours: phase.sla?.businessHours ?? false,
        slaWarningPercent: phase.sla?.warningPercent ?? null,
        fields: toPhaseFields(sections),
        sectionFlow: toPhaseSectionFlow(sections),
      };
    }),
  };
}

export type FlowConversionContext = {
  formId: string;
  phaseIdByKey: Map<string, string>;
  phaseLabelByKey: Map<string, string>;
  userIdByEmail: Map<string, string>;
  /** Pessoas ativas de cada perfil (aviso "para o perfil" vira a lista de pessoas). */
  userIdsByRole: Map<string, string[]>;
};

const NODE_X = 300;
const NODE_Y = 150;

/** Coluna = distância do gatilho; linha = ordem dentro da coluna. */
function layout(flow: BlueprintFlow): Map<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const node of flow.nodes) {
    if (node.type.startsWith('trigger_')) {
      level.set(node.key, 0);
      queue.push(node.key);
    }
  }
  while (queue.length) {
    const current = queue.shift() as string;
    for (const edge of flow.edges.filter((candidate) => candidate.from === current)) {
      if (!level.has(edge.to)) {
        level.set(edge.to, (level.get(current) ?? 0) + 1);
        queue.push(edge.to);
      }
    }
  }
  const rows = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of flow.nodes) {
    const column = level.get(node.key) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    positions.set(node.key, { x: column * NODE_X, y: row * NODE_Y });
  }
  return positions;
}

export function blueprintFlowToDto(
  flow: BlueprintFlow,
  ctx: FlowConversionContext,
): { dto: CreateFlowDto; warnings: BlueprintIssue[] } {
  const warnings: BlueprintIssue[] = [];
  const positions = layout(flow);
  const phase = (key: unknown): Record<string, unknown> =>
    typeof key === 'string' && key ? { phaseId: ctx.phaseIdByKey.get(key) ?? key, phaseLabel: ctx.phaseLabelByKey.get(key) } : {};
  const userId = (email: unknown): string | undefined => (typeof email === 'string' ? ctx.userIdByEmail.get(lower(email)) : undefined);

  const nodes = flow.nodes.map((node) => {
    const d = node.data ?? {};
    const label = typeof d.label === 'string' ? { label: d.label } : {};
    let data: Record<string, unknown>;
    switch (node.type) {
      case 'trigger_solicitation_created':
        data = { formId: ctx.formId };
        break;
      case 'trigger_phase_entered':
        data = {
          formId: ctx.formId,
          ...(d.phase ? { phaseId: ctx.phaseIdByKey.get(String(d.phase)) } : {}),
          ...(d.fromPhase ? { fromPhaseId: ctx.phaseIdByKey.get(String(d.fromPhase)) } : {}),
        };
        break;
      case 'trigger_approval_completed':
      case 'trigger_phase_field_saved':
        data = { formId: ctx.formId, ...(d.phase ? { phaseId: ctx.phaseIdByKey.get(String(d.phase)) } : {}) };
        break;
      case 'trigger_sla_warning':
      case 'trigger_sla_breached':
        data = {
          formId: ctx.formId,
          slaScope: 'phase',
          ...(d.phase ? { phaseId: ctx.phaseIdByKey.get(String(d.phase)) } : {}),
        };
        break;
      case 'condition_field_value':
        data = { fieldCode: d.fieldCode, operator: d.operator, ...(d.value !== undefined ? { value: String(d.value) } : {}) };
        break;
      case 'condition_approval_result':
        data = { operator: 'equals', value: d.result };
        break;
      case 'condition_solicitation_priority':
        data = { operator: d.operator, value: d.value };
        break;
      case 'action_move_phase':
      case 'action_wait_for_phase_fields':
        data = phase(d.phase);
        break;
      case 'action_create_approval': {
        const fromPhase = d.useApproversOfPhase === true;
        const users = (Array.isArray(d.approverUsers) ? d.approverUsers : []).map(userId).filter(Boolean);
        data = {
          title: d.title,
          ...(d.description ? { description: d.description } : {}),
          // A aprovação é da fase em que o card está: é ela que segura o card até a decisão.
          scope: 'phase',
          approverSourceMode: fromPhase ? 'phase_role' : 'fixed',
          ...(!fromPhase && Array.isArray(d.approverRoles) && d.approverRoles.length ? { approverRoleCodes: d.approverRoles } : {}),
          ...(!fromPhase && users.length ? { assignedUserIds: users } : {}),
          ...(!fromPhase && d.rule ? { approvalRule: d.rule } : {}),
          ...(d.notifyByEmail === true ? { emailApprovers: { enabled: true } } : {}),
        };
        break;
      }
      case 'action_notification': {
        const recipients: Array<Record<string, unknown>> = [];
        for (const entry of Array.isArray(d.to) ? d.to : []) {
          if (entry === 'requester' || entry === 'responsible') {
            recipients.push({ type: entry });
          } else if (entry && typeof entry === 'object') {
            const item = entry as Record<string, unknown>;
            if (typeof item.role === 'string') {
              const ids = ctx.userIdsByRole.get(item.role) ?? [];
              warnings.push({
                path: `${flow.name} › ${node.key}`,
                message: `Aviso para o perfil "${item.role}" virou a lista das ${ids.length} pessoas dele hoje; quem entrar no perfil depois precisa ser incluído no fluxo.`,
              });
              if (ids.length) recipients.push({ type: 'users', userIds: ids });
            } else if (Array.isArray(item.users)) {
              const ids = item.users.map(userId).filter(Boolean);
              if (ids.length) recipients.push({ type: 'users', userIds: ids });
            } else if (typeof item.field === 'string') {
              recipients.push({ type: 'field', fieldCode: item.field });
            }
          }
        }
        data = {
          channel: d.channel,
          recipients,
          ...(d.title ? { title: d.title } : {}),
          content: d.message,
          skipUnresolvedRecipients: true,
        };
        break;
      }
      case 'action_assign_responsible':
        data = { userId: userId(d.user) };
        break;
      default:
        data = {};
    }
    return { id: node.key, type: node.type, position: positions.get(node.key) ?? { x: 0, y: 0 }, data: { ...data, ...label } };
  });

  const typeByKey = new Map(flow.nodes.map((node) => [node.key, node.type]));
  const edges = flow.edges.map((edge, index) => ({
    id: `e${index + 1}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    ...(CONDITION_NODE_TYPES.has(typeByKey.get(edge.from) ?? '') && edge.when ? { sourceHandle: edge.when } : {}),
  }));

  return {
    dto: { formId: ctx.formId, name: flow.name.trim(), isActive: flow.active ?? true, nodes, edges },
    warnings,
  };
}

