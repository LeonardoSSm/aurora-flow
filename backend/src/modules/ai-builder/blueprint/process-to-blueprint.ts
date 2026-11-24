import type {
  FlowEntity,
  FormEntity,
  FormFieldEntity,
  FormSectionEntity,
  FormVersionEntity,
  KanbanPhaseEntity,
} from '../../../database/entities';
import type { VisibilityRule } from '../../forms/form-definition.utils';
import { groupPhaseSections, PHASE_START_SECTION } from '../../kanban-phases/phase-section-flow';
import { FLOW_NODE_GUIDE } from './blueprint-catalog';
import {
  BLUEPRINT_SCHEMA_VERSION,
  FORM_SUBMIT,
  PHASE_FORM_END,
  type BlueprintField,
  type BlueprintFlow,
  type BlueprintForm,
  type BlueprintPhase,
  type BlueprintSection,
  type ProcessBlueprint,
} from './process-blueprint.types';

/**
 * Um processo que já existe no formato da criação (GET /ai/processes/:id): serve de exemplo
 * ("faça parecido com o de Cancelamento") e de base para a IA propor uma versão nova. Ids viram
 * chaves; pessoas viram e-mails. Fluxo com nó que a IA não cria sai com `editableByAi: false`.
 */

export type ProcessExportInput = {
  form: FormEntity;
  version: FormVersionEntity;
  phases: KanbanPhaseEntity[];
  flows: FlowEntity[];
  emailByUserId: Map<string, string>;
};

function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 's_$1')
      .slice(0, 50) || 'secao'
  );
}

function uniqueKeys(titles: string[], taken: Set<string>): string[] {
  return titles.map((title) => {
    const base = slug(title);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return key;
  });
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && !(Array.isArray(item) && item.length === 0)),
  ) as T;
}

function formField(field: FormFieldEntity): BlueprintField {
  const rule = (field.visibilityRules as VisibilityRule[] | null)?.[0];
  const settings = { ...(field.settingsJson ?? {}) };
  delete settings.hiddenOptionValues;
  // Faixas de pontuação apontam para ids de fase deste processo, que não existem num processo
  // montado a partir do blueprint — os pontos das opções seguem, as faixas não.
  delete settings.scoreRanges;
  // Aviso de pontuação aponta para usuários deste ambiente: não vai no blueprint.
  delete settings.scoreAlert;
  return compact({
    code: field.code,
    label: field.label,
    type: field.fieldType,
    required: field.required || undefined,
    sensitive: field.isSensitive || undefined,
    options: [...(field.options ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((option) => ({ value: option.internalValue, label: option.displayLabel })),
    settings: Object.keys(settings).length ? settings : undefined,
    visibility: rule
      ? {
          action: rule.action,
          operator: rule.operator,
          conditions: rule.conditions.map((condition) => compact({ field: condition.fieldCode, op: condition.operator, value: condition.value })),
        }
      : undefined,
  });
}

function formSections(version: FormVersionEntity, taken: Set<string>): BlueprintSection[] {
  const sections = [...(version.sections ?? [])].sort((a, b) => a.order - b.order);
  const keys = uniqueKeys(sections.map((section) => section.title), taken);
  const keyById = new Map(sections.map((section, index) => [section.id, keys[index]]));
  const target = (submit: boolean, sectionId: string | null): string =>
    submit || !sectionId ? FORM_SUBMIT : (keyById.get(sectionId) ?? FORM_SUBMIT);

  return sections.map((section: FormSectionEntity, index) => {
    const fields = [...(section.fields ?? [])].sort((a, b) => a.order - b.order);
    const codeById = new Map(fields.map((field) => [field.id, field.code]));
    const following = sections[index + 1]?.id ?? null;
    const defaultTarget = target(section.nextIsSubmit, section.nextSectionId);
    const isAutomatic = following ? section.nextSectionId === following && !section.nextIsSubmit : section.nextIsSubmit;
    const branches = [...(section.branches ?? [])]
      .sort((a, b) => a.order - b.order)
      .flatMap((branch) => {
        const code = branch.fieldId ? codeById.get(branch.fieldId) : undefined;
        if (!code) return [];
        const field = fields.find((candidate) => candidate.id === branch.fieldId);
        const option = field?.options?.find((candidate) => candidate.id === branch.optionId)?.internalValue;
        return [
          compact({
            field: code,
            option,
            checked: branch.checkboxValue ?? undefined,
            goTo: target(branch.targetIsSubmit, branch.targetSectionId),
          }),
        ];
      });
    return compact({
      key: keys[index],
      title: section.title,
      description: section.description ?? undefined,
      fields: fields.map(formField),
      next: isAutomatic && branches.length === 0 ? undefined : compact({ default: isAutomatic ? undefined : defaultTarget, branches }),
    }) as BlueprintSection;
  });
}

function phaseSections(phase: KanbanPhaseEntity): BlueprintSection[] {
  const sections = groupPhaseSections([...(phase.fields ?? [])]);
  const routes = new Map((phase.sectionFlow ?? []).map((route) => [route.section, route]));
  return sections.map((section) => {
    const route = routes.get(section.key);
    const key = section.key === PHASE_START_SECTION ? 'inicio' : section.key;
    const toKey = (target: string | null): string => (target === null ? PHASE_FORM_END : target === PHASE_START_SECTION ? 'inicio' : target);
    return compact({
      key,
      title: section.title?.label ?? 'Início',
      fields: section.fields.map((field) =>
        compact({
          code: field.code,
          label: field.label,
          type: field.fieldType,
          required: field.required || undefined,
          options: (field.optionsJson ?? []).map((option) => ({ value: option.value, label: option.label })),
          settings: field.settingsJson && Object.keys(field.settingsJson).length ? field.settingsJson : undefined,
        }) as BlueprintField,
      ),
      next: route
        ? compact({
            default: route.next === undefined ? undefined : toKey(route.next),
            branches: route.branches.map((branch) =>
              compact({ field: branch.fieldCode, option: branch.optionValue ?? undefined, checked: branch.checkboxValue ?? undefined, goTo: toKey(branch.target) }),
            ),
          })
        : undefined,
    }) as BlueprintSection;
  });
}

function people(
  roleCodes: string[] | undefined,
  userIds: string[] | undefined,
  emails: Map<string, string>,
): { roles?: string[]; users?: string[] } {
  const users = (userIds ?? []).map((id) => emails.get(id)).filter(Boolean) as string[];
  return compact({ roles: roleCodes ?? [], users });
}

function flowToBlueprint(
  flow: FlowEntity,
  keyByPhaseId: Map<string, string>,
  emails: Map<string, string>,
): BlueprintFlow {
  let editable = true;
  const phaseKey = (id: unknown): string | undefined => (typeof id === 'string' ? keyByPhaseId.get(id) : undefined);
  const nodes = (flow.nodes ?? []).map((node) => {
    const d = (node.data ?? {}) as Record<string, unknown>;
    if (!FLOW_NODE_GUIDE[node.type]) {
      editable = false;
      return { key: node.id, type: node.type, data: d };
    }
    let data: Record<string, unknown>;
    switch (node.type) {
      case 'trigger_phase_entered':
        data = { phase: phaseKey(d.phaseId), fromPhase: phaseKey(d.fromPhaseId) };
        break;
      case 'trigger_approval_completed':
      case 'trigger_phase_field_saved':
      case 'trigger_sla_warning':
      case 'trigger_sla_breached':
        data = { phase: phaseKey(d.phaseId) };
        break;
      case 'condition_field_value':
        data = { fieldCode: d.fieldCode, operator: d.operator, value: d.value };
        break;
      case 'condition_approval_result':
        data = { result: d.operator === 'not_equals' ? (d.value === 'approved' ? 'rejected' : 'approved') : d.value };
        break;
      case 'condition_solicitation_priority':
        data = { operator: d.operator, value: d.value };
        break;
      case 'action_move_phase':
      case 'action_wait_for_phase_fields':
        data = { phase: phaseKey(d.phaseId) };
        break;
      case 'action_create_approval':
        data = {
          title: d.title,
          description: d.description,
          useApproversOfPhase: d.approverSourceMode === 'phase_role' || undefined,
          approverRoles: d.approverRoleCodes,
          approverUsers: Array.isArray(d.assignedUserIds) ? d.assignedUserIds.map((id) => emails.get(String(id))).filter(Boolean) : undefined,
          rule: d.approvalRule,
          notifyByEmail: (d.emailApprovers as { enabled?: boolean } | undefined)?.enabled === true ? true : undefined,
        };
        if (d.approverSourceMode === 'dynamic' || d.approverSourceMode === 'field' || Array.isArray(d.approverEmails)) editable = false;
        break;
      case 'action_notification':
        data = {
          channel: d.channel,
          title: d.title,
          message: d.content,
          to: (Array.isArray(d.recipients) ? d.recipients : []).map((recipient) => {
            const r = recipient as Record<string, unknown>;
            if (r.type === 'requester' || r.type === 'responsible') return r.type;
            if (r.type === 'users') return { users: (Array.isArray(r.userIds) ? r.userIds : []).map((id) => emails.get(String(id))).filter(Boolean) };
            if (r.type === 'field') return { field: r.fieldCode };
            editable = false;
            return r;
          }),
        };
        break;
      case 'action_assign_responsible':
        data = { user: emails.get(String(d.userId)) };
        break;
      default:
        data = {};
    }
    if (typeof d.label === 'string') data.label = d.label;
    return { key: node.id, type: node.type, data: compact(data) };
  });
  return compact({
    name: flow.name,
    active: flow.isActive,
    nodes,
    edges: (flow.edges ?? []).map((edge) =>
      compact({ from: edge.source, to: edge.target, when: edge.sourceHandle === 'yes' || edge.sourceHandle === 'no' ? edge.sourceHandle : undefined }),
    ),
    editableByAi: editable ? undefined : false,
  }) as BlueprintFlow;
}

/**
 * Opções do processo no settingsJson da versão. Só sai o que foge do padrão: ausente no
 * processo e o padrão do sistema dão no mesmo, e o processo exportado fica enxuto.
 */
function formSettingFlags(settings: Record<string, unknown> | null | undefined): Partial<BlueprintForm> {
  const flags: Partial<BlueprintForm> = {};
  if (settings?.showResponderIdentification === false) flags.showResponderIdentification = false;
  if (settings?.requireResponderIdentification === true) flags.requireResponderIdentification = true;
  if (settings?.requiresResponseApproval === true) flags.requiresResponseApproval = true;
  return flags;
}

export function processToBlueprint(input: ProcessExportInput): ProcessBlueprint {
  const { form, version, phases, flows, emailByUserId } = input;
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  // Chaves de seção do formulário não podem bater com códigos de campo (seções de fase viram campo).
  const taken = new Set<string>([
    ...ordered.flatMap((phase) => (phase.fields ?? []).map((field) => field.code)),
  ]);
  const keyByPhaseId = new Map(ordered.map((phase) => [phase.id, phase.key]));

  const blueprintPhases: BlueprintPhase[] = ordered.map((phase) => {
    const approvers = phase.approvers;
    return compact({
      key: phase.key,
      label: phase.label,
      description: phase.description ?? undefined,
      color: phase.color,
      terminal: phase.isTerminal || undefined,
      actors: phase.actors ? people(phase.actors.roleCodes, phase.actors.userIds, emailByUserId) : undefined,
      approval:
        phase.requiresApproval && approvers
          ? compact({
              approvers: people(approvers.roleCodes, approvers.userIds, emailByUserId),
              rule: phase.approvalMode,
              order: approvers.order?.map((entry) =>
                entry.startsWith('user:') ? `user:${emailByUserId.get(entry.slice(5)) ?? entry.slice(5)}` : entry,
              ),
              request: phase.approvalRequest !== 'manual' ? phase.approvalRequest : undefined,
              onApproved: phase.approvalOnApproved !== 'stay' ? phase.approvalOnApproved : undefined,
              onRejected: phase.approvalOnRejected !== 'stay' ? phase.approvalOnRejected : undefined,
            })
          : undefined,
      visibleTo: phase.visibleTo
        ? compact({ ...people(phase.visibleTo.roleCodes, phase.visibleTo.userIds, emailByUserId), areas: phase.visibleTo.areaIds })
        : undefined,
      requireFieldsToExit: phase.requireFieldsToExit || undefined,
      requireAssigneeToExit: phase.requireAssigneeToExit || undefined,
      blockMoveBack: phase.blockMoveBack || undefined,
      sla: phase.slaHours
        ? compact({ hours: phase.slaHours, businessHours: phase.slaBusinessHours || undefined, warningPercent: phase.slaWarningPercent ?? undefined })
        : undefined,
      sections: (phase.fields ?? []).length ? phaseSections(phase) : undefined,
    }) as BlueprintPhase;
  });

  return compact({
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    name: form.name,
    description: form.description ?? undefined,
    category: form.category ?? undefined,
    areaId: form.areaId ?? undefined,
    form: compact({
      mode: (version.settingsJson?.mode as 'single' | 'stepper' | undefined) ?? undefined,
      ...formSettingFlags(version.settingsJson),
      sections: formSections(version, taken),
    }),
    phases: blueprintPhases,
    kanban: form.kanbanSettings?.cardValueField ? { cardValueField: form.kanbanSettings.cardValueField } : undefined,
    flows: flows.map((flow) => flowToBlueprint(flow, keyByPhaseId, emailByUserId)),
  }) as ProcessBlueprint;
}
