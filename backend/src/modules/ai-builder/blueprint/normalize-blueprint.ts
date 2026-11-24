import { CONDITION_NODE_TYPES } from './blueprint-catalog';
import type { BlueprintIssue } from './process-blueprint.types';

/**
 * Antes de conferir: aceita os jeitos mais comuns de a IA escrever o processo "quase certo" e
 * converte para o formato do manual — `type: "stepper"` no formulário, `is_required`, opções como
 * lista de textos, `config` no lugar de `settings`, fase com `name`, aprovadores numa lista solta,
 * processo embrulhado em `{ blueprint: ... }` ou mandado como texto JSON. Só troca o que não tem
 * duas leituras; o resto fica para a conferência apontar. Cada troca volta em `adjusted`, com o
 * caminho, para a IA escrever direito da próxima vez.
 */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const WRAPPERS = ['blueprint', 'processo', 'process', 'body', 'data'];

const FIELD_TYPE_ALIASES: Record<string, string> = {
  text: 'short_text',
  texto: 'short_text',
  string: 'short_text',
  input: 'short_text',
  shorttext: 'short_text',
  texto_curto: 'short_text',
  textarea: 'long_text',
  longtext: 'long_text',
  paragraph: 'long_text',
  texto_longo: 'long_text',
  numero: 'number',
  numeric: 'number',
  integer: 'number',
  int: 'number',
  decimal: 'number',
  money: 'currency',
  moeda: 'currency',
  valor: 'currency',
  select: 'single_select',
  dropdown: 'single_select',
  radio: 'single_select',
  singleselect: 'single_select',
  lista: 'single_select',
  multiselect: 'multi_select',
  multiple_select: 'multi_select',
  multi: 'multi_select',
  checkboxes: 'multi_select',
  boolean: 'checkbox',
  bool: 'checkbox',
  sim_nao: 'checkbox',
  file: 'file_upload',
  upload: 'file_upload',
  attachment: 'file_upload',
  anexo: 'file_upload',
  data: 'date',
  hora: 'time',
  date_time: 'datetime',
  telefone: 'phone',
  escala: 'scale',
  avaliacao: 'rating',
  stars: 'rating',
  calculo: 'calculated',
  formula: 'calculated',
  titulo: 'title',
  heading: 'title',
  descricao: 'description',
  separator: 'divider',
};

const MODE_ALIASES: Record<string, 'single' | 'stepper'> = {
  stepper: 'stepper',
  steps: 'stepper',
  step: 'stepper',
  wizard: 'stepper',
  etapas: 'stepper',
  multi_step: 'stepper',
  single: 'single',
  single_page: 'single',
  page: 'single',
  pagina_unica: 'single',
};

const RULE_ALIASES: Record<string, 'any' | 'all' | 'sequential'> = {
  any: 'any',
  one: 'any',
  anyone: 'any',
  qualquer: 'any',
  qualquer_um: 'any',
  all: 'all',
  every: 'all',
  todos: 'all',
  sequential: 'sequential',
  sequence: 'sequential',
  sequencial: 'sequential',
  ordem: 'sequential',
};

const NODE_TYPE_ALIASES: Record<string, string> = {
  action_move_card: 'action_move_phase',
  action_move: 'action_move_phase',
  action_move_to_phase: 'action_move_phase',
  action_change_phase: 'action_move_phase',
  move_phase: 'action_move_phase',
  action_notify: 'action_notification',
  action_notify_users: 'action_notification',
  action_notify_roles: 'action_notification',
  action_notify_requester: 'action_notification',
  action_send_notification: 'action_notification',
  action_notificacao: 'action_notification',
  notification: 'action_notification',
  condition_field: 'condition_field_value',
  condition_approval: 'condition_approval_result',
  condition_approval_status: 'condition_approval_result',
  trigger_approval: 'trigger_approval_completed',
  trigger_approval_decided: 'trigger_approval_completed',
  trigger_phase_enter: 'trigger_phase_entered',
  trigger_enter_phase: 'trigger_phase_entered',
  trigger_phase_fields_saved: 'trigger_phase_field_saved',
  trigger_form_submitted: 'trigger_solicitation_created',
  trigger_solicitation_submitted: 'trigger_solicitation_created',
};

const OPERATOR_ALIASES: Record<string, string> = {
  '=': 'equals',
  '==': 'equals',
  eq: 'equals',
  igual: 'equals',
  '!=': 'not_equals',
  '<>': 'not_equals',
  neq: 'not_equals',
  diferente: 'not_equals',
  '>': 'greater_than',
  gt: 'greater_than',
  maior_que: 'greater_than',
  '<': 'less_than',
  lt: 'less_than',
  menor_que: 'less_than',
  contem: 'contains',
  vazio: 'is_empty',
  preenchido: 'is_not_empty',
};

const RESULT_ALIASES: Record<string, 'approved' | 'rejected'> = {
  approved: 'approved',
  approve: 'approved',
  aprovado: 'approved',
  aprovada: 'approved',
  aprovou: 'approved',
  rejected: 'rejected',
  reject: 'rejected',
  reprovado: 'rejected',
  reprovada: 'rejected',
  reprovou: 'rejected',
  rejeitado: 'rejected',
  rejeitada: 'rejected',
};

const CHANNEL_ALIASES: Record<string, string> = {
  in_app: 'in_app',
  inapp: 'in_app',
  app: 'in_app',
  sistema: 'in_app',
  system: 'in_app',
  notificacao: 'in_app',
  email: 'email',
  e_mail: 'email',
  whatsapp: 'whatsapp',
  wpp: 'whatsapp',
};

const WHEN_ALIASES: Record<string, 'yes' | 'no'> = {
  yes: 'yes',
  sim: 'yes',
  true: 'yes',
  verdadeiro: 'yes',
  no: 'no',
  nao: 'no',
  não: 'no',
  false: 'no',
  falso: 'no',
};

/** "Valor Total (R$)" → "valor_total_r". */
export function toCode(text: string, fallback: string): string {
  const code = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  if (!code) return fallback;
  return /^[a-z]/.test(code) ? code : `${fallback}_${code}`.slice(0, 60);
}

const aliasKey = (value: string): string => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function normalizeBlueprint(input: unknown): { blueprint: unknown; adjusted: BlueprintIssue[] } {
  const adjusted: BlueprintIssue[] = [];
  const note = (path: string, message: string): void => {
    adjusted.push({ path, message });
  };

  let value: unknown = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
      note('', 'O processo veio como texto JSON; li como objeto. Envie o objeto direto.');
    } catch {
      return { blueprint: input, adjusted };
    }
  }
  if (!isObj(value)) return { blueprint: value, adjusted };
  let bp: Obj = structuredClone(value);

  const keys = Object.keys(bp);
  if (keys.length === 1 && WRAPPERS.includes(keys[0]) && isObj(bp[keys[0]])) {
    note(keys[0], `O processo veio dentro de "${keys[0]}"; envie o processo direto no corpo.`);
    bp = bp[keys[0]] as Obj;
  }

  /** Troca `from` por `to`; se `to` já existe, vale ele e o apelido some. */
  const rename = (obj: Obj, from: string[], to: string, path: string): void => {
    for (const key of from) {
      if (!(key in obj) || key === to) continue;
      if (obj[to] === undefined) {
        obj[to] = obj[key];
        note(path ? `${path}.${key}` : key, `Use "${to}" em vez de "${key}".`);
      }
      delete obj[key];
    }
  };

  rename(bp, ['nome', 'title', 'titulo'], 'name', '');
  rename(bp, ['descricao'], 'description', '');
  rename(bp, ['categoria'], 'category', '');
  rename(bp, ['formulario', 'openingForm', 'opening_form'], 'form', '');
  rename(bp, ['fases', 'stages', 'steps'], 'phases', '');
  rename(bp, ['fluxos', 'rules', 'regras'], 'flows', '');
  rename(bp, ['pendencias'], 'pending', '');
  if (isObj(bp.kanban)) rename(bp.kanban, ['cardValueFieldId', 'cardValueFieldCode', 'cardValue', 'valueField'], 'cardValueField', 'kanban');
  if (typeof bp.schemaVersion === 'string' && /^\d+$/.test(bp.schemaVersion)) bp.schemaVersion = Number(bp.schemaVersion);
  if (typeof bp.pending === 'string') bp.pending = [bp.pending];

  if (Array.isArray(bp.form)) {
    bp.form = { sections: bp.form };
    note('form', 'form é um objeto: { mode, sections: [...] }.');
  }
  if (bp.form === undefined && Array.isArray(bp.sections)) {
    bp.form = { sections: bp.sections };
    note('sections', 'As seções da abertura ficam em form.sections.');
  }
  delete bp.sections;
  if (isObj(bp.form)) {
    const form = bp.form;
    if (bp.mode !== undefined && form.mode === undefined) {
      form.mode = bp.mode;
      note('mode', 'O modo fica em form.mode.');
    }
    delete bp.mode;
    rename(form, ['type', 'layout', 'modo', 'formType'], 'mode', 'form');
    rename(form, ['secoes'], 'sections', 'form');
    if (form.sections === undefined && Array.isArray(form.fields)) {
      form.sections = [{ title: 'Dados da solicitação', fields: form.fields }];
      note('form.fields', 'Campos ficam dentro de seções: form.sections[].fields.');
    }
    delete form.fields;
    if (typeof form.mode === 'string') {
      const mode = MODE_ALIASES[aliasKey(form.mode)];
      if (mode && mode !== form.mode) {
        note('form.mode', `Use "${mode}" (era "${form.mode}").`);
        form.mode = mode;
      }
    }
  }

  // Códigos já escolhidos pela IA: os que geramos não podem bater com eles.
  const usedCodes = new Set<string>();
  const collectCodes = (sections: unknown, withKeys: boolean): void => {
    for (const section of Array.isArray(sections) ? sections : []) {
      if (!isObj(section)) continue;
      if (withKeys && isText(section.key)) usedCodes.add(section.key);
      for (const field of Array.isArray(section.fields) ? section.fields : []) {
        if (isObj(field) && isText(field.code)) usedCodes.add(field.code);
      }
    }
  };
  collectCodes(isObj(bp.form) ? bp.form.sections : undefined, false);
  for (const phase of Array.isArray(bp.phases) ? bp.phases : []) {
    if (isObj(phase)) collectCodes(phase.sections ?? (isObj(phase.form) ? phase.form.sections : undefined), true);
  }
  const uniqueCode = (base: string, used: Set<string>): string => {
    let code = base;
    for (let n = 2; used.has(code); n += 1) code = `${base.slice(0, 55)}_${n}`;
    used.add(code);
    return code;
  };

  const normalizeSections = (sections: unknown, base: string, sectionKeysAreCodes: boolean): void => {
    if (!Array.isArray(sections)) return;
    const keys = new Set(sections.filter(isObj).map((s) => s.key).filter(isText));
    sections.forEach((section, si) => {
      if (!isObj(section)) return;
      const path = `${base}[${si}]`;
      rename(section, ['name', 'nome', 'titulo', 'label'], 'title', path);
      rename(section, ['campos'], 'fields', path);
      rename(section, ['descricao'], 'description', path);
      if (!isText(section.key) && isText(section.title)) {
        const used = sectionKeysAreCodes ? usedCodes : keys;
        section.key = uniqueCode(toCode(section.title, 'secao'), used);
        if (!sectionKeysAreCodes) keys.add(section.key as string);
        note(`${path}.key`, `Seção sem chave: usei "${String(section.key)}".`);
      }
      if (typeof section.next === 'string') {
        section.next = { default: section.next };
        note(`${path}.next`, 'next é um objeto: { default, branches }.');
      }
      const fields = Array.isArray(section.fields) ? section.fields : [];
      fields.forEach((field, fi) => normalizeField(field, `${path}.fields[${fi}]`));
      if (isObj(section.next)) normalizeBranches(section.next, fields, `${path}.next`);
    });
  };

  const normalizeField = (field: unknown, path: string): void => {
    if (!isObj(field)) return;
    if (!isText(field.code) && isText(field.key)) {
      field.code = field.key;
      delete field.key;
      note(`${path}.key`, 'Use "code" em vez de "key" no campo.');
    }
    rename(field, ['name', 'nome', 'rotulo', 'title', 'titulo'], 'label', path);
    rename(field, ['tipo', 'fieldType', 'field_type'], 'type', path);
    rename(field, ['is_required', 'isRequired', 'obrigatorio', 'mandatory'], 'required', path);
    rename(field, ['is_sensitive', 'isSensitive', 'sensivel'], 'sensitive', path);
    rename(field, ['opcoes', 'choices', 'items'], 'options', path);
    rename(field, ['visibilityRules', 'visibility_rules', 'regraExibicao'], 'visibility', path);
    for (const key of ['config', 'configuracoes', 'props', 'properties']) {
      if (!isObj(field[key])) continue;
      field.settings = { ...(field[key] as Obj), ...(isObj(field.settings) ? field.settings : {}) };
      delete field[key];
      note(`${path}.${key}`, `Use "settings" em vez de "${key}".`);
    }
    if (isObj(field.settings) && field.settings.options !== undefined) {
      if (field.options === undefined) field.options = field.settings.options;
      delete field.settings.options;
      note(`${path}.settings.options`, 'As opções ficam em options, fora de settings.');
    }
    if (field.placeholder !== undefined) {
      field.settings = { placeholder: field.placeholder, ...(isObj(field.settings) ? field.settings : {}) };
      delete field.placeholder;
      note(`${path}.placeholder`, 'placeholder fica em settings.');
    }
    for (const flag of ['required', 'sensitive']) {
      if (field[flag] === 'true' || field[flag] === 'false') field[flag] = field[flag] === 'true';
    }
    if (typeof field.type === 'string') {
      const type = aliasKey(field.type);
      const mapped = FIELD_TYPE_ALIASES[type] ?? type;
      if (mapped !== field.type) {
        note(`${path}.type`, `Use "${mapped}" (era "${field.type}").`);
        field.type = mapped;
      }
    }
    if (!isText(field.code) && isText(field.label)) {
      field.code = uniqueCode(toCode(field.label, 'campo'), usedCodes);
      note(`${path}.code`, `Campo sem código: usei "${String(field.code)}".`);
    }
    if (Array.isArray(field.options)) {
      let changed = false;
      field.options = field.options.map((option) => {
        if (typeof option === 'string' || typeof option === 'number') {
          changed = true;
          const text = String(option).slice(0, 120);
          return { value: text, label: text };
        }
        if (!isObj(option)) return option;
        const copy = { ...option };
        for (const key of ['name', 'nome', 'text', 'texto', 'rotulo', 'title']) {
          if (copy.label === undefined && copy[key] !== undefined) {
            copy.label = copy[key];
            changed = true;
          }
          if (key in copy) delete copy[key];
        }
        if (copy.value === undefined && isText(copy.label)) {
          copy.value = String(copy.label).slice(0, 120);
          changed = true;
        }
        if (copy.label === undefined && copy.value !== undefined) {
          copy.label = String(copy.value);
          changed = true;
        }
        if (typeof copy.value === 'number') copy.value = String(copy.value);
        return copy;
      });
      if (changed) note(`${path}.options`, 'Opção é { value, label }.');
    }
  };

  /** Ramificação que cita a opção pelo nome em vez do valor. */
  const normalizeBranches = (next: Obj, fields: unknown[], path: string): void => {
    rename(next, ['ramificacoes', 'rules', 'conditions'], 'branches', path);
    if (!Array.isArray(next.branches)) return;
    next.branches.forEach((branch, bi) => {
      if (!isObj(branch)) return;
      rename(branch, ['to', 'target', 'next', 'destino'], 'goTo', `${path}.branches[${bi}]`);
      if (typeof branch.value === 'boolean' && branch.checked === undefined) {
        branch.checked = branch.value;
        delete branch.value;
        note(`${path}.branches[${bi}].value`, 'Caixa de seleção ramifica por checked: true/false.');
      }
      rename(branch, ['value', 'equals'], 'option', `${path}.branches[${bi}]`);
      const field = fields.find((f) => isObj(f) && f.code === branch.field);
      if (!isObj(field) || !Array.isArray(field.options) || typeof branch.option !== 'string') return;
      const options = field.options.filter(isObj);
      if (options.some((option) => option.value === branch.option)) return;
      const byLabel = options.find(
        (option) => typeof option.label === 'string' && option.label.trim().toLowerCase() === String(branch.option).trim().toLowerCase(),
      );
      if (byLabel) {
        note(`${path}.branches[${bi}].option`, `Use o value da opção ("${String(byLabel.value)}").`);
        branch.option = byLabel.value;
      }
    });
  };

  /** Lista solta de perfis e e-mails → { roles, users } (quem tem "@" é pessoa). */
  const people = (raw: unknown, path: string): unknown => {
    const items = typeof raw === 'string' ? [raw] : raw;
    if (!Array.isArray(items) || !items.every((item) => typeof item === 'string')) return raw;
    const roles = items.filter((item) => !item.includes('@'));
    const users = items.filter((item) => item.includes('@'));
    note(path, 'Use { roles: [códigos], users: [e-mails] }.');
    return { ...(roles.length ? { roles } : {}), ...(users.length ? { users } : {}) };
  };

  if (isObj(bp.form)) normalizeSections(bp.form.sections, 'form.sections', false);

  const phaseKeys = new Set(
    (Array.isArray(bp.phases) ? bp.phases : []).filter(isObj).map((phase) => phase.key).filter(isText),
  );
  (Array.isArray(bp.phases) ? bp.phases : []).forEach((phase, pi) => {
    if (!isObj(phase)) return;
    const path = `phases[${pi}]`;
    rename(phase, ['name', 'nome', 'title', 'titulo'], 'label', path);
    rename(phase, ['descricao'], 'description', path);
    rename(phase, ['isTerminal', 'is_terminal', 'final', 'isFinal', 'terminal_phase'], 'terminal', path);
    rename(phase, ['responsaveis', 'assignees', 'actor', 'atuadores', 'responsible'], 'actors', path);
    rename(phase, ['aprovacao'], 'approval', path);
    rename(phase, ['prazo'], 'sla', path);
    rename(phase, ['visibility', 'visivelPara'], 'visibleTo', path);
    rename(phase, ['secoes'], 'sections', path);
    if (phase.sections === undefined && isObj(phase.form) && Array.isArray(phase.form.sections)) {
      phase.sections = phase.form.sections;
      delete phase.form;
      note(`${path}.form`, 'O formulário da fase fica em sections.');
    }
    if (phase.terminal === 'true' || phase.terminal === 'false') phase.terminal = phase.terminal === 'true';
    if (!isText(phase.key) && isText(phase.label)) {
      phase.key = uniqueCode(toCode(phase.label, 'fase'), phaseKeys);
      note(`${path}.key`, `Fase sem chave: usei "${String(phase.key)}".`);
    }
    if (phase.actors !== undefined) phase.actors = people(phase.actors, `${path}.actors`);
    if (phase.visibleTo !== undefined && !isObj(phase.visibleTo)) phase.visibleTo = people(phase.visibleTo, `${path}.visibleTo`);

    // Aprovação: "sem aprovação" em vários formatos; aprovadores soltos na fase.
    const requires = phase.requiresApproval ?? phase.requires_approval ?? phase.needsApproval;
    for (const key of ['requiresApproval', 'requires_approval', 'needsApproval']) delete phase[key];
    if (phase.approvers !== undefined && phase.approval === undefined) {
      phase.approval = { approvers: phase.approvers, ...(phase.approvalRule !== undefined ? { rule: phase.approvalRule } : {}) };
      note(`${path}.approvers`, 'Quem aprova fica em approval.approvers.');
    }
    delete phase.approvers;
    delete phase.approvalRule;
    if (phase.approval === null || phase.approval === false || requires === false) {
      if (phase.approval !== undefined) note(`${path}.approval`, 'Sem aprovação: omita approval.');
      delete phase.approval;
    }
    if (Array.isArray(phase.approval)) {
      phase.approval = { approvers: phase.approval };
      note(`${path}.approval`, 'approval é um objeto: { approvers, rule }.');
    }
    if (isObj(phase.approval)) {
      const approval = phase.approval;
      rename(approval, ['aprovadores', 'by'], 'approvers', `${path}.approval`);
      rename(approval, ['type', 'mode', 'regra'], 'rule', `${path}.approval`);
      if (approval.approvers !== undefined && !isObj(approval.approvers)) {
        approval.approvers = people(approval.approvers, `${path}.approval.approvers`);
      }
      if (typeof approval.rule === 'string') {
        const rule = RULE_ALIASES[aliasKey(approval.rule)];
        if (rule && rule !== approval.rule) {
          note(`${path}.approval.rule`, `Use "${rule}" (era "${approval.rule}").`);
          approval.rule = rule;
        }
      }
    }
    if (typeof phase.sla === 'number') {
      phase.sla = { hours: phase.sla };
      note(`${path}.sla`, 'sla é um objeto: { hours, businessHours }.');
    } else if (isObj(phase.sla)) {
      const sla = phase.sla;
      rename(sla, ['horas'], 'hours', `${path}.sla`);
      rename(sla, ['alertPercentage', 'alertPercent', 'alert_percentage', 'warning', 'alerta'], 'warningPercent', `${path}.sla`);
      rename(sla, ['business', 'horasUteis', 'uteis', 'business_hours'], 'businessHours', `${path}.sla`);
      // { duration: 24, unit: "business_hours" } / { amount: 2, unit: "dias_uteis" }
      const amount = sla.duration ?? sla.amount ?? sla.value ?? sla.prazo;
      if (sla.hours === undefined && amount !== undefined && Number.isFinite(Number(amount))) {
        const unit = aliasKey(String(sla.unit ?? sla.unidade ?? 'hours'));
        const business = /business|util|uteis|working/.test(unit);
        const days = /day|dia/.test(unit);
        // Horário útil do sistema: seg–sex, 08h–18h = 10 h por dia.
        sla.hours = Number(amount) * (days ? (business ? 10 : 24) : 1);
        if (business && sla.businessHours === undefined) sla.businessHours = true;
        note(`${path}.sla`, 'Prazo é { hours, businessHours, warningPercent } (horas inteiras).');
      }
      for (const key of ['duration', 'amount', 'value', 'prazo', 'unit', 'unidade']) delete sla[key];
      if (typeof sla.hours === 'string' && /^\d+$/.test(sla.hours)) sla.hours = Number(sla.hours);
    }
    normalizeSections(phase.sections, `${path}.sections`, true);
  });

  // Fluxos: tipos de nó, fase, condição, resultado e saídas com os nomes do manual.
  (Array.isArray(bp.flows) ? bp.flows : []).forEach((flow, fi) => {
    if (!isObj(flow)) return;
    const fpath = `flows[${fi}]`;
    rename(flow, ['nome', 'title'], 'name', fpath);
    rename(flow, ['nos', 'nós', 'steps'], 'nodes', fpath);
    rename(flow, ['ligacoes', 'ligações', 'connections', 'links'], 'edges', fpath);
    const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
    const typeByKey = new Map<string, string>();
    nodes.forEach((node, ni) => {
      if (!isObj(node)) return;
      const npath = `${fpath}.nodes[${ni}]`;
      if (!isText(node.key) && isText(node.id)) {
        node.key = node.id;
        delete node.id;
        note(`${npath}.id`, 'Use "key" em vez de "id" no nó.');
      }
      rename(node, ['config', 'params', 'settings'], 'data', npath);
      if (typeof node.type === 'string') {
        const original = node.type;
        const mapped = NODE_TYPE_ALIASES[aliasKey(original)];
        if (mapped) {
          node.type = mapped;
          note(`${npath}.type`, `Use "${mapped}" (era "${original}").`);
          if (/requester/.test(original) && isObj(node.data) && node.data.to === undefined) node.data.to = ['requester'];
          if (/roles/.test(original) && isObj(node.data) && node.data.to === undefined) node.data.to = 'roles';
          if (/users/.test(original) && isObj(node.data) && node.data.to === undefined) node.data.to = 'users';
        }
      }
      if (isText(node.key) && typeof node.type === 'string') typeByKey.set(node.key, node.type);
      if (node.data === undefined && (node.type === 'condition_approval_result' || node.type === 'action_notification')) node.data = {};
      if (!isObj(node.data)) return;
      const data = node.data;
      const dpath = `${npath}.data`;
      rename(data, ['toPhase', 'phaseKey', 'targetPhase', 'phase_key', 'to_phase', 'fase', 'faseDestino'], 'phase', dpath);
      rename(data, ['fromPhaseKey', 'from_phase', 'faseOrigem'], 'fromPhase', dpath);
      switch (node.type) {
        case 'condition_field_value':
          rename(data, ['field', 'campo', 'field_code', 'code'], 'fieldCode', dpath);
          rename(data, ['op', 'operador', 'comparison', 'comparator'], 'operator', dpath);
          if (typeof data.operator === 'string') {
            const op = OPERATOR_ALIASES[aliasKey(data.operator)] ?? OPERATOR_ALIASES[data.operator.trim()];
            if (op && op !== data.operator) {
              note(`${dpath}.operator`, `Use "${op}" (era "${data.operator}").`);
              data.operator = op;
            }
          }
          // Caixa de seleção salva como "true"/"false": a condição compara texto.
          if (typeof data.value === 'boolean') {
            data.value = String(data.value);
            note(`${dpath}.value`, `Valor em texto: "${data.value}".`);
          }
          break;
        case 'condition_approval_result': {
          rename(data, ['value', 'resultado', 'outcome', 'status', 'equals'], 'result', dpath);
          const result = typeof data.result === 'string' ? RESULT_ALIASES[aliasKey(data.result)] : undefined;
          if (result && result !== data.result) {
            note(`${dpath}.result`, `Use "${result}" (era "${String(data.result)}").`);
            data.result = result;
          } else if (data.result === undefined) {
            // Sem resultado: lê como "foi aprovada?" (yes = aprovada, no = reprovada).
            const rejectedName = /reprov|rejeit|recus|reject/.test(`${String(node.key)} ${String(data.label ?? '')}`);
            data.result = rejectedName ? 'rejected' : 'approved';
            note(`${dpath}.result`, `Resultado da aprovação sem "result": usei "${String(data.result)}". Informe sempre.`);
          }
          break;
        }
        case 'trigger_phase_field_saved':
        case 'trigger_phase_entered':
        case 'trigger_approval_completed':
          for (const key of ['fieldCode', 'field', 'campo']) {
            if (key in data) {
              delete data[key];
              note(`${dpath}.${key}`, 'O gatilho não filtra por campo: ligue uma condição "Valor do campo" depois dele.');
            }
          }
          break;
        case 'action_notification':
          rename(data, ['mensagem', 'text', 'texto', 'body', 'content'], 'message', dpath);
          rename(data, ['titulo', 'subject', 'assunto'], 'title', dpath);
          rename(data, ['canal'], 'channel', dpath);
          if (data.channel === undefined) {
            data.channel = 'in_app';
            note(`${dpath}.channel`, 'Aviso sem canal: usei "in_app". Informe channel (in_app, email ou whatsapp).');
          } else if (typeof data.channel === 'string') {
            const channel = CHANNEL_ALIASES[aliasKey(data.channel).replace(/-/g, '_')];
            if (channel && channel !== data.channel) {
              note(`${dpath}.channel`, `Use "${channel}" (era "${data.channel}").`);
              data.channel = channel;
            }
          }
          rename(data, ['recipients', 'destinatarios', 'para'], 'to', dpath);
          break;
        default:
          break;
      }
    });

    // Saídas: when só na saída de uma condição; condição com uma saída só sem when = "yes".
    const edges = Array.isArray(flow.edges) ? flow.edges : [];
    edges.forEach((edge, ei) => {
      if (!isObj(edge)) return;
      const epath = `${fpath}.edges[${ei}]`;
      rename(edge, ['source', 'origem', 'de'], 'from', epath);
      rename(edge, ['target', 'destino'], 'to', epath);
      rename(edge, ['condition', 'branch', 'sourceHandle', 'handle', 'saida', 'result'], 'when', epath);
      if (edge.when !== undefined) {
        const when = WHEN_ALIASES[aliasKey(String(edge.when))];
        if (when && when !== edge.when) {
          note(`${epath}.when`, `Use "${when}" (era "${String(edge.when)}").`);
          edge.when = when;
        }
      }
      const fromType = isText(edge.from) ? typeByKey.get(edge.from) : undefined;
      if (edge.when !== undefined && fromType && !CONDITION_NODE_TYPES.has(fromType)) {
        delete edge.when;
        note(`${epath}.when`, 'when só vale na saída de uma condição; tirei desta ligação.');
      }
    });
    const byFrom = new Map<string, Obj[]>();
    for (const edge of edges) {
      if (isObj(edge) && isText(edge.from)) byFrom.set(edge.from, [...(byFrom.get(edge.from) ?? []), edge]);
    }
    for (const [from, outs] of byFrom) {
      if (!CONDITION_NODE_TYPES.has(typeByKey.get(from) ?? '')) continue;
      if (outs.length === 1 && outs[0].when === undefined) {
        outs[0].when = 'yes';
        note(`${fpath}.edges[${edges.indexOf(outs[0])}].when`, 'Saída única da condição sem when: usei "yes".');
      }
    }
  });

  // Aviso: quem recebe é sempre uma lista (`to: ["requester", { role }, { users }]`).
  (Array.isArray(bp.flows) ? bp.flows : []).forEach((flow, fi) => {
    if (!isObj(flow) || !Array.isArray(flow.nodes)) return;
    flow.nodes.forEach((node, ni) => {
      if (!isObj(node) || node.type !== 'action_notification' || !isObj(node.data)) return;
      const data = node.data;
      const path = `flows[${fi}].nodes[${ni}].data.to`;
      const list = (value: unknown): string[] =>
        (Array.isArray(value) ? value : [value]).filter((item): item is string => isText(item));
      const isTemplate = (value: string): boolean => value.includes('{{');
      const roles = list(data.roles ?? data.role);
      const allUsers = list(data.users);
      // E-mail de variável ({{responder_email}}...) é o solicitante.
      const users = allUsers.filter((user) => !isTemplate(user));
      const requesterByTemplate = allUsers.length > users.length;
      if (isObj(data.to)) {
        const target = data.to;
        data.to = [
          ...list(target.roles ?? target.role).map((role) => ({ role })),
          ...(list(target.users).length ? [{ users: list(target.users) }] : []),
        ];
        note(path, 'Quem recebe é uma lista: to: [{ "role": "<código>" }, { "users": ["e-mail"] }].');
      }
      const before = JSON.stringify(data.to);
      let to: unknown = data.to;
      if (typeof to === 'string') {
        const kind = aliasKey(to);
        if (kind === 'requester' || kind === 'responsible') to = [kind];
        else if (['roles', 'role', 'perfil', 'perfis'].includes(kind)) to = roles.map((role) => ({ role }));
        else if (['users', 'user', 'pessoas'].includes(kind)) {
          to = [...(requesterByTemplate ? ['requester'] : []), ...(users.length ? [{ users }] : [])];
        } else if (isTemplate(to)) to = ['requester'];
        else if (to.includes('@')) to = [{ users: [to] }];
        else to = [to];
      } else if (to === undefined && (roles.length || users.length)) {
        to = [...roles.map((role) => ({ role })), ...(users.length ? [{ users }] : [])];
      }
      if (Array.isArray(to)) {
        to = to.flatMap((entry) => {
          if (typeof entry === 'string') {
            if (isTemplate(entry)) return ['requester'];
            return entry.includes('@') ? [{ users: [entry] }] : [entry];
          }
          if (!isObj(entry)) return [entry];
          // { type: "role", value: "admin" } / { type: "requester" } / { roles: [...] }
          const kind = typeof entry.type === 'string' ? aliasKey(entry.type) : '';
          const value = entry.value ?? entry.code ?? entry.id;
          if (kind === 'requester' || kind === 'solicitante') return ['requester'];
          if (kind === 'responsible' || kind === 'responsavel') return ['responsible'];
          if (['role', 'perfil', 'roles'].includes(kind) && isText(value)) return [{ role: value }];
          if (['user', 'users', 'pessoa', 'email'].includes(kind) && (isText(value) || Array.isArray(value))) {
            return [{ users: list(value) }];
          }
          if (Array.isArray(entry.roles)) return list(entry.roles).map((role) => ({ role }));
          if (Array.isArray(entry.users) && entry.users.some((user) => typeof user === 'string' && isTemplate(user))) {
            const real = list(entry.users).filter((user) => !isTemplate(user));
            return ['requester', ...(real.length ? [{ users: real }] : [])];
          }
          return [entry];
        });
      }
      if (JSON.stringify(to) !== before) {
        data.to = to;
        delete data.roles;
        delete data.role;
        delete data.users;
        note(path, 'Quem recebe é uma lista: to: ["requester"], [{ "role": "<código>" }] ou [{ "users": ["e-mail"] }].');
      }
    });
  });

  return { blueprint: bp, adjusted };
}
