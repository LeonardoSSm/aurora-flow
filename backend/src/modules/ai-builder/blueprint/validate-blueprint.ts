import { tryCompileFormula } from '../../../common/formula/formula.engine';
import {
  CONDITION_NODE_TYPES,
  FIELD_CODE_PATTERN,
  FIELD_TYPE_GUIDE,
  FLOW_NODE_GUIDE,
  PHASE_COLORS,
  PHASE_CONTEXT_TRIGGERS,
  type FieldTypeGuide,
} from './blueprint-catalog';
import {
  BLUEPRINT_SCHEMA_VERSION,
  FORM_SETTING_FLAGS,
  FORM_SUBMIT,
  PHASE_FORM_END,
  type BlueprintCheck,
  type BlueprintIssue,
} from './process-blueprint.types';

/** O que existe no sistema para conferir as referências do processo. */
export type BlueprintContext = {
  roleCodes: Set<string>;
  /** Pessoas ativas citadas no processo, por e-mail (minúsculo). */
  userIdByEmail: Map<string, string>;
  areaIds: Set<string>;
  itemListIds: Set<string>;
};

export const BLUEPRINT_LIMITS = {
  sections: 30,
  fieldsPerSection: 60,
  phases: 20,
  flows: 30,
  nodesPerFlow: 50,
  options: 200,
};

const VISIBILITY_OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
]);
const FIELD_OPERATORS = VISIBILITY_OPERATORS;
const PRIORITY_OPERATORS = new Set(['equals', 'not_equals', 'greater_than', 'less_than']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const CHANNELS = new Set(['in_app', 'email', 'whatsapp']);
const RULES = new Set(['any', 'all', 'sequential']);
/** O que a fase faz sozinha com a aprovação (approval.request / onApproved / onRejected). */
const APPROVAL_CHOICES: ReadonlyArray<[string, string[]]> = [
  ['request', ['manual', 'on_enter', 'on_complete']],
  ['onApproved', ['stay', 'next']],
  ['onRejected', ['stay', 'previous', 'close']],
];

type Obj = Record<string, unknown>;
type CodeInfo = { type: string; path: string; inForm: boolean };
/** O que a conferência entre fluxos precisa de cada fluxo já conferido. */
type FlowShape = {
  path: string;
  typeByKey: Map<string, string>;
  dataByKey: Map<string, Obj>;
  pathByKey: Map<string, string>;
  next: Map<string, Array<{ to: string; when?: string }>>;
};
/** Gatilhos que reagem a um evento de fase: dois fluxos no mesmo evento brigam pelo card. */
const PHASE_EVENT_TRIGGERS = new Set([
  'trigger_approval_completed',
  'trigger_phase_entered',
  'trigger_phase_field_saved',
  'trigger_sla_warning',
  'trigger_sla_breached',
]);

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const lower = (value: string): string => value.trim().toLowerCase();

/**
 * Confere o processo inteiro sem gravar nada e devolve TODOS os problemas, cada um com o caminho
 * (ex.: `phases[2].approval.approvers.roles[0]`) e a mensagem em português — a LOPS IA corrige e
 * confere de novo. Referência que não existe é erro: nada vira vazio em silêncio.
 */
export function validateBlueprint(input: unknown, ctx: BlueprintContext): BlueprintCheck {
  const errors: BlueprintIssue[] = [];
  const warnings: BlueprintIssue[] = [];
  const error = (path: string, message: string): void => {
    errors.push({ path, message });
  };
  const warn = (path: string, message: string): void => {
    warnings.push({ path, message });
  };

  if (!isObj(input)) {
    error('', 'O corpo precisa ser um objeto com o processo.');
    return { valid: false, errors, warnings };
  }
  const bp = input;
  const allowedTop = new Set([
    'schemaVersion',
    'name',
    'description',
    'category',
    'areaId',
    'form',
    'phases',
    'kanban',
    'flows',
    'pending',
    'sourceDocuments',
  ]);
  unknownKeys(bp, allowedTop, '', error);

  if (bp.schemaVersion !== undefined && bp.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    error('schemaVersion', `Versão do formato não suportada (use ${BLUEPRINT_SCHEMA_VERSION}).`);
  }
  if (!isText(bp.name)) error('name', 'Dê um nome ao processo.');
  else if (bp.name.length > 180) error('name', 'Nome com mais de 180 caracteres.');
  if (bp.description !== undefined && typeof bp.description !== 'string') error('description', 'Descrição em texto.');
  if (bp.category !== undefined && typeof bp.category !== 'string') error('category', 'Categoria em texto.');
  if (bp.areaId !== undefined && bp.areaId !== null && !(isText(bp.areaId) && ctx.areaIds.has(bp.areaId))) {
    error('areaId', 'Área não encontrada no catálogo de áreas.');
  }

  const codes = new Map<string, CodeInfo>();
  const registerCode = (code: unknown, type: string, path: string, inForm: boolean): void => {
    if (!isText(code)) {
      error(path, 'Informe o código.');
      return;
    }
    if (!FIELD_CODE_PATTERN.test(code)) {
      error(path, `Código "${code}" inválido: letras minúsculas sem acento, números e "_", começando por letra.`);
    }
    const previous = codes.get(code);
    if (previous) {
      error(path, `Código "${code}" repetido (já usado em ${previous.path}). Códigos são únicos no processo inteiro.`);
      return;
    }
    codes.set(code, { type, path, inForm });
  };

  // ── Formulário de abertura ───────────────────────────────────────────────
  const form = bp.form;
  const formSections: Obj[] = [];
  if (!isObj(form)) {
    error('form', 'Inclua o formulário de abertura: form: { mode: "single" | "stepper", sections: [{ key, title, fields: [...] }] }.');
  } else {
    unknownKeys(form, new Set(['mode', ...FORM_SETTING_FLAGS, 'sections']), 'form', error);
    if (form.mode !== undefined && form.mode !== 'single' && form.mode !== 'stepper') {
      error('form.mode', 'Use "single" ou "stepper".');
    }
    for (const flag of FORM_SETTING_FLAGS) {
      if (form[flag] !== undefined && typeof form[flag] !== 'boolean') error(`form.${flag}`, 'Use true ou false.');
    }
    const sections = list(form.sections);
    if (sections.length === 0) error('form.sections', 'O formulário de abertura precisa de ao menos uma seção.');
    if (sections.length > BLUEPRINT_LIMITS.sections) {
      error('form.sections', `No máximo ${BLUEPRINT_LIMITS.sections} seções.`);
    }
    sections.forEach((section, index) => {
      if (isObj(section)) formSections.push(section);
      else error(`form.sections[${index}]`, 'Seção precisa ser um objeto.');
    });
  }

  const formKeys = sectionKeys(formSections, 'form.sections', error);
  formSections.forEach((section, si) => {
    const path = `form.sections[${si}]`;
    unknownKeys(section, new Set(['key', 'title', 'description', 'fields', 'next', 'visibility']), path, error);
    if (section.visibility !== undefined) {
      error(
        `${path}.visibility`,
        'Seção não tem regra de exibição. Para abrir esta seção só quando um campo tem um valor, ramifique na seção onde o campo está: next.branches: [{ field, option, goTo: "<chave desta seção>" }]. Para um ou dois campos, use visibility em cada campo.',
      );
    }
    if (!isText(section.title)) error(`${path}.title`, 'Dê um título à seção.');
    const fields = list(section.fields);
    if (fields.length === 0) warn(`${path}.fields`, 'Seção sem campos.');
    if (fields.length > BLUEPRINT_LIMITS.fieldsPerSection) {
      error(`${path}.fields`, `No máximo ${BLUEPRINT_LIMITS.fieldsPerSection} campos por seção.`);
    }
    fields.forEach((field, fi) => validateField(field, `${path}.fields[${fi}]`, 'form'));
  });

  // ── Fases ────────────────────────────────────────────────────────────────
  const phases = list(bp.phases).filter(isObj);
  if (list(bp.phases).length === 0) error('phases', 'O processo precisa de ao menos uma fase: phases: [{ key, label, actors: { roles, users }, approval, terminal }].');
  if (list(bp.phases).length > BLUEPRINT_LIMITS.phases) error('phases', `No máximo ${BLUEPRINT_LIMITS.phases} fases.`);
  const phaseKeys = new Map<string, Obj>();
  phases.forEach((phase, pi) => {
    const path = `phases[${pi}]`;
    if (!isText(phase.key) || !FIELD_CODE_PATTERN.test(phase.key)) {
      error(`${path}.key`, 'Chave da fase inválida: minúsculas sem acento, números e "_", começando por letra (ex.: "aprovacao_gerente").');
    } else if (phaseKeys.has(phase.key)) {
      error(`${path}.key`, `Chave de fase "${phase.key}" repetida.`);
    } else {
      phaseKeys.set(phase.key, phase);
    }
  });
  if (phases.length > 0 && !phases.some((phase) => phase.terminal === true)) {
    error('phases', 'Marque ao menos uma fase como terminal (o fim do processo).');
  }
  if (phases.length > 1 && phases[0]?.terminal === true) {
    error('phases[0].terminal', 'A primeira fase recebe as solicitações novas: não pode ser terminal.');
  }

  phases.forEach((phase, pi) => {
    const path = `phases[${pi}]`;
    unknownKeys(
      phase,
      new Set(['key', 'label', 'description', 'color', 'terminal', 'actors', 'approval', 'visibleTo', 'sla', 'sections']),
      path,
      error,
    );
    if (!isText(phase.label)) error(`${path}.label`, 'Dê um nome à fase.');
    if (phase.color !== undefined && !PHASE_COLORS.includes(String(phase.color))) {
      error(`${path}.color`, `Cor inválida. Use: ${PHASE_COLORS.join(', ')}.`);
    }
    if (phase.actors !== undefined) checkPeople(phase.actors, `${path}.actors`);
    if (phase.approval !== undefined) {
      const approval = phase.approval;
      if (!isObj(approval)) {
        error(`${path}.approval`, 'Aprovação precisa ser um objeto.');
      } else {
        unknownKeys(
          approval,
          new Set(['approvers', 'rule', 'order', 'request', 'onApproved', 'onRejected']),
          `${path}.approval`,
          error,
        );
        for (const [key, allowed] of APPROVAL_CHOICES) {
          if (approval[key] !== undefined && !allowed.includes(String(approval[key]))) {
            error(`${path}.approval.${key}`, `Use ${allowed.join(', ')}.`);
          }
        }
        if (phase.terminal === true) error(`${path}.approval`, 'Fase terminal não tem aprovação.');
        const count = checkPeople(approval.approvers, `${path}.approval.approvers`);
        if (count === 0) error(`${path}.approval.approvers`, 'Diga quem aprova (perfil ou pessoa).');
        if (approval.rule !== undefined && !RULES.has(String(approval.rule))) {
          error(`${path}.approval.rule`, 'Use any, all ou sequential.');
        }
        if (approval.order !== undefined) {
          if (approval.rule !== 'sequential') warn(`${path}.approval.order`, 'Ordem só vale com rule "sequential".');
          const approvers = isObj(approval.approvers) ? approval.approvers : {};
          const valid = new Set([
            ...list(approvers.roles).map((role) => `role:${String(role)}`),
            ...list(approvers.users).map((user) => `user:${lower(String(user))}`),
          ]);
          list(approval.order).forEach((entry, oi) => {
            const key = String(entry).startsWith('user:') ? `user:${lower(String(entry).slice(5))}` : String(entry);
            if (!valid.has(key)) {
              error(`${path}.approval.order[${oi}]`, 'Use role:<código> ou user:<e-mail> de quem está em approvers.');
            }
          });
        }
      }
    }
    if (phase.visibleTo !== undefined) {
      const visible = phase.visibleTo;
      if (!isObj(visible)) {
        error(`${path}.visibleTo`, 'Visibilidade precisa ser um objeto.');
      } else {
        unknownKeys(visible, new Set(['roles', 'users', 'areas']), `${path}.visibleTo`, error);
        checkPeople({ roles: visible.roles, users: visible.users }, `${path}.visibleTo`);
        list(visible.areas).forEach((area, ai) => {
          if (!isText(area) || !ctx.areaIds.has(area)) error(`${path}.visibleTo.areas[${ai}]`, 'Área não encontrada.');
        });
      }
    }
    if (phase.sla !== undefined) {
      const sla = phase.sla;
      if (!isObj(sla)) {
        error(`${path}.sla`, 'Prazo precisa ser um objeto.');
      } else {
        unknownKeys(sla, new Set(['hours', 'businessHours', 'warningPercent']), `${path}.sla`, error);
        const hours = Number(sla.hours);
        if (!Number.isInteger(hours) || hours < 1 || hours > 8760) error(`${path}.sla.hours`, 'Informe hours: horas inteiras de 1 a 8760 (ex.: { hours: 24, businessHours: true } para 24 horas úteis).');
        if (sla.warningPercent !== undefined) {
          const percent = Number(sla.warningPercent);
          if (!Number.isInteger(percent) || percent < 1 || percent > 99) error(`${path}.sla.warningPercent`, 'De 1 a 99.');
        }
        if (phase.terminal === true) warn(`${path}.sla`, 'Fase terminal não tem prazo: será ignorado.');
      }
    }

    const sections = list(phase.sections).filter(isObj);
    if (list(phase.sections).length > BLUEPRINT_LIMITS.sections) {
      error(`${path}.sections`, `No máximo ${BLUEPRINT_LIMITS.sections} seções.`);
    }
    const keys = sectionKeys(sections, `${path}.sections`, error);
    sections.forEach((section, si) => {
      const spath = `${path}.sections[${si}]`;
      unknownKeys(section, new Set(['key', 'title', 'description', 'fields', 'next']), spath, error);
      if (!isText(section.title)) error(`${spath}.title`, 'Dê um título à seção.');
      if (section.description !== undefined) warn(`${spath}.description`, 'Seção de fase não tem descrição: use um campo "description".');
      // O título da seção vira um campo "Título" com o código = chave da seção.
      if (isText(section.key)) registerCode(section.key, 'title', `${spath}.key`, false);
      list(section.fields).forEach((field, fi) => validateField(field, `${spath}.fields[${fi}]`, 'phase'));
    });
    checkSectionPaths(sections, keys, `${path}.sections`, PHASE_FORM_END);
  });

  checkSectionPaths(formSections, formKeys, 'form.sections', FORM_SUBMIT);
  checkVisibilityAndFormulas();

  // ── Kanban ───────────────────────────────────────────────────────────────
  if (bp.kanban !== undefined) {
    if (!isObj(bp.kanban)) {
      error('kanban', 'Kanban precisa ser um objeto.');
    } else {
      unknownKeys(bp.kanban, new Set(['cardValueField']), 'kanban', error);
      const code = bp.kanban.cardValueField;
      if (code !== undefined && code !== null) {
        const info = isText(code) ? codes.get(code) : undefined;
        if (!info) error('kanban.cardValueField', `Campo "${String(code)}" não existe.`);
        else if (!FIELD_TYPE_GUIDE[info.type as keyof typeof FIELD_TYPE_GUIDE]?.numeric) {
          error('kanban.cardValueField', 'O valor do card precisa ser um campo de valor, número ou cálculo.');
        }
      }
    }
  }

  // ── Fluxos ───────────────────────────────────────────────────────────────
  const flows = list(bp.flows);
  if (flows.length > BLUEPRINT_LIMITS.flows) error('flows', `No máximo ${BLUEPRINT_LIMITS.flows} fluxos.`);
  const shapes = flows
    .map((flow, fi) => validateFlow(flow, `flows[${fi}]`))
    .filter((shape): shape is FlowShape => shape !== undefined);
  checkFlowLogic(shapes);

  list(bp.pending).forEach((item, i) => {
    if (typeof item !== 'string') error(`pending[${i}]`, 'Pendência em texto.');
  });
  list(bp.sourceDocuments).forEach((doc, i) => {
    if (!isObj(doc) || !isText(doc.name)) error(`sourceDocuments[${i}]`, 'Informe o nome do documento.');
  });

  return { valid: errors.length === 0, errors, warnings };

  // ── Funções internas (usam errors/ctx/codes deste processo) ──────────────

  function checkPeople(value: unknown, path: string): number {
    if (value === undefined) return 0;
    if (!isObj(value)) {
      error(path, 'Use { roles: [...], users: [...] }.');
      return 0;
    }
    unknownKeys(value, new Set(['roles', 'users']), path, error);
    const roles = list(value.roles);
    const users = list(value.users);
    roles.forEach((role, ri) => {
      if (!isText(role) || !ctx.roleCodes.has(role)) {
        error(`${path}.roles[${ri}]`, `O perfil "${String(role)}" não existe. Use um código do catálogo de perfis.`);
      }
    });
    users.forEach((user, ui) => {
      if (!isText(user) || !ctx.userIdByEmail.has(lower(user))) {
        error(`${path}.users[${ui}]`, `Não há pessoa ativa com o e-mail "${String(user)}".`);
      }
    });
    return roles.length + users.length;
  }

  function validateField(raw: unknown, path: string, where: 'form' | 'phase'): void {
    if (!isObj(raw)) {
      error(path, 'Campo precisa ser um objeto: { code, label, type, required, options, settings }.');
      return;
    }
    unknownKeys(
      raw,
      new Set(['code', 'label', 'type', 'required', 'sensitive', 'options', 'settings', 'visibility']),
      path,
      error,
    );
    const type = String(raw.type ?? '');
    const guide: FieldTypeGuide | undefined = FIELD_TYPE_GUIDE[type as keyof typeof FIELD_TYPE_GUIDE];
    registerCode(raw.code, type, `${path}.code`, where === 'form');
    if (!guide) {
      error(`${path}.type`, `Tipo "${type}" não existe ou não é aceito na criação pela IA. Aceitos: ${Object.keys(FIELD_TYPE_GUIDE).join(', ')}.`);
      return;
    }
    if (where === 'phase' && !guide.phase) {
      error(
        `${path}.type`,
        type === 'title'
          ? 'No formulário da fase, abra uma nova seção em vez de usar um campo "Título".'
          : `"${guide.label}" não existe no formulário de uma fase.`,
      );
    }
    if (!isText(raw.label) && type !== 'divider') error(`${path}.label`, 'Dê um nome ao campo.');
    if (raw.required !== undefined && typeof raw.required !== 'boolean') error(`${path}.required`, 'Use true ou false.');
    if (guide.layout && raw.required === true) warn(`${path}.required`, 'Campo visual não é obrigatório.');
    if (where === 'phase' && raw.sensitive !== undefined) warn(`${path}.sensitive`, 'Campo de fase não tem a marca de sensível.');
    if (where === 'phase' && raw.visibility !== undefined) {
      error(`${path}.visibility`, 'Campo de fase não tem regra de exibição: use a ramificação entre seções.');
    }

    const settings = raw.settings;
    if (settings !== undefined) {
      if (!isObj(settings)) {
        error(`${path}.settings`, 'Configurações precisam ser um objeto.');
      } else {
        for (const key of Object.keys(settings)) {
          if (!(key in guide.settings)) {
            const allowed = Object.keys(guide.settings);
            error(
              `${path}.settings.${key}`,
              allowed.length
                ? `"${key}" não é configuração de "${guide.label}". Aceitas: ${allowed.join(', ')}.`
                : `"${guide.label}" não tem configurações.`,
            );
          }
        }
        if (isText(settings.itemListId) && !ctx.itemListIds.has(settings.itemListId)) {
          error(`${path}.settings.itemListId`, 'Lista de itens não encontrada no catálogo.');
        }
        if (settings.displayAs !== undefined && settings.displayAs !== 'dropdown') {
          error(`${path}.settings.displayAs`, 'Use "dropdown" ou omita.');
        }
      }
    }
    if (type === 'erp_lookup') {
      const s = isObj(settings) ? settings : {};
      if (!isText(s.erpConnectorId) || !isText(s.fonte)) {
        error(`${path}.settings`, 'Lista do ERP precisa de erpConnectorId e fonte (catálogo ERP).');
      }
    }
    if (type === 'calculated') {
      const formula = isObj(settings) ? settings.formula : undefined;
      if (!isText(formula)) error(`${path}.settings.formula`, 'Cálculo precisa de fórmula.');
    }

    const options = raw.options;
    const linkedToList = isObj(settings) && isText(settings.itemListId);
    if (guide.options) {
      const items = list(options);
      if (items.length === 0 && !linkedToList) error(`${path}.options`, 'Inclua as opções, ex.: options: [{ value: "sim", label: "Sim" }] (ou settings.itemListId).');
      if (items.length > BLUEPRINT_LIMITS.options) error(`${path}.options`, `No máximo ${BLUEPRINT_LIMITS.options} opções.`);
      const values = new Set<string>();
      items.forEach((option, oi) => {
        if (!isObj(option) || !isText(option.value) || !isText(option.label)) {
          error(`${path}.options[${oi}]`, 'Opção precisa de value e label, ex.: { value: "urgente", label: "Urgente" }.');
          return;
        }
        unknownKeys(option, new Set(['value', 'label']), `${path}.options[${oi}]`, error);
        if (values.has(option.value)) error(`${path}.options[${oi}].value`, `Opção "${option.value}" repetida.`);
        values.add(option.value);
      });
    } else if (options !== undefined && list(options).length > 0) {
      error(`${path}.options`, `"${guide.label}" não tem opções.`);
    }
  }

  function sectionKeysOf(sections: Obj[]): string[] {
    return sections.map((section) => String(section.key ?? ''));
  }

  function checkSectionPaths(sections: Obj[], keys: Set<string>, base: string, end: string): void {
    const ordered = sectionKeysOf(sections);
    const targetOk = (target: unknown, current: string): boolean =>
      target === end || (isText(target) && keys.has(target) && target !== current);
    const adjacency = new Map<string, string[]>();

    sections.forEach((section, si) => {
      const path = `${base}[${si}]`;
      const key = ordered[si];
      const targets: string[] = [];
      const next = section.next;
      if (next === undefined) {
        if (ordered[si + 1]) targets.push(ordered[si + 1]);
      } else if (!isObj(next)) {
        error(`${path}.next`, 'Use { default, branches }.');
      } else {
        unknownKeys(next, new Set(['default', 'branches']), `${path}.next`, error);
        if (next.default === undefined) {
          if (ordered[si + 1]) targets.push(ordered[si + 1]);
        } else if (!targetOk(next.default, key)) {
          error(`${path}.next.default`, `Destino "${String(next.default)}" não existe (use a chave de outra seção ou "${end}").`);
        } else if (next.default !== end) {
          targets.push(String(next.default));
        }
        const fields = list(section.fields).filter(isObj);
        list(next.branches).forEach((branch, bi) => {
          const bpath = `${path}.next.branches[${bi}]`;
          if (!isObj(branch)) {
            error(bpath, 'Ramificação precisa ser um objeto.');
            return;
          }
          unknownKeys(branch, new Set(['field', 'option', 'checked', 'goTo']), bpath, error);
          const field = fields.find((candidate) => candidate.code === branch.field);
          if (!field) {
            error(`${bpath}.field`, `O campo "${String(branch.field)}" não está nesta seção.`);
          } else if (!FIELD_TYPE_GUIDE[String(field.type) as keyof typeof FIELD_TYPE_GUIDE]?.branch) {
            error(`${bpath}.field`, 'Ramifique por uma lista ou caixa de seleção (para valor numérico, use faixas numa lista).');
          } else if (field.type === 'checkbox') {
            if (typeof branch.checked !== 'boolean') error(`${bpath}.checked`, 'Diga se a caixa está marcada (true) ou não (false).');
          } else if (!list(field.options).some((option) => isObj(option) && option.value === branch.option)) {
            error(`${bpath}.option`, `A opção "${String(branch.option)}" não existe no campo.`);
          }
          if (!targetOk(branch.goTo, key)) {
            error(`${bpath}.goTo`, `Destino "${String(branch.goTo)}" não existe (use a chave de outra seção ou "${end}").`);
          } else if (branch.goTo !== end) {
            targets.push(String(branch.goTo));
          }
        });
      }
      adjacency.set(key, targets);
    });

    // Toda seção precisa ser alcançável a partir da primeira.
    if (ordered.length === 0) return;
    const reached = new Set<string>([ordered[0]]);
    const queue = [ordered[0]];
    while (queue.length) {
      const current = queue.shift() as string;
      for (const target of adjacency.get(current) ?? []) {
        if (!reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    ordered.forEach((key, si) => {
      if (key && !reached.has(key)) error(`${base}[${si}]`, `Nenhum caminho chega à seção "${key}".`);
    });
  }

  function checkVisibilityAndFormulas(): void {
    const formFieldList: Array<{ field: Obj; path: string }> = [];
    formSections.forEach((section, si) =>
      list(section.fields).forEach((field, fi) => {
        if (isObj(field)) formFieldList.push({ field, path: `form.sections[${si}].fields[${fi}]` });
      }),
    );
    const phaseFieldList: Array<{ field: Obj; path: string }> = [];
    phases.forEach((phase, pi) =>
      list(phase.sections).filter(isObj).forEach((section, si) =>
        list(section.fields).forEach((field, fi) => {
          if (isObj(field)) phaseFieldList.push({ field, path: `phases[${pi}].sections[${si}].fields[${fi}]` });
        }),
      ),
    );

    for (const { field, path } of formFieldList) {
      const visibility = field.visibility;
      if (visibility === undefined) continue;
      if (!isObj(visibility)) {
        error(`${path}.visibility`, 'Use { action, operator, conditions }.');
        continue;
      }
      unknownKeys(visibility, new Set(['action', 'operator', 'conditions']), `${path}.visibility`, error);
      if (visibility.action !== 'show' && visibility.action !== 'hide') error(`${path}.visibility.action`, 'Use "show" ou "hide".');
      if (visibility.operator !== undefined && visibility.operator !== 'and' && visibility.operator !== 'or') {
        error(`${path}.visibility.operator`, 'Use "and" ou "or".');
      }
      const conditions = list(visibility.conditions);
      if (conditions.length === 0) error(`${path}.visibility.conditions`, 'Inclua ao menos uma condição.');
      conditions.forEach((condition, ci) => {
        const cpath = `${path}.visibility.conditions[${ci}]`;
        if (!isObj(condition)) {
          error(cpath, 'Condição precisa ser um objeto.');
          return;
        }
        unknownKeys(condition, new Set(['field', 'op', 'value']), cpath, error);
        const info = isText(condition.field) ? codes.get(condition.field) : undefined;
        if (!info?.inForm) error(`${cpath}.field`, `O campo "${String(condition.field)}" não existe no formulário de abertura.`);
        else if (condition.field === field.code) error(`${cpath}.field`, 'O campo não pode depender dele mesmo.');
        if (!VISIBILITY_OPERATORS.has(String(condition.op))) error(`${cpath}.op`, `Operador inválido: ${[...VISIBILITY_OPERATORS].join(', ')}.`);
      });
    }

    for (const { field, path } of [...formFieldList, ...phaseFieldList]) {
      if (field.type !== 'calculated' || !isObj(field.settings) || !isText(field.settings.formula)) continue;
      const compiled = tryCompileFormula(field.settings.formula);
      if (!compiled.ok) {
        error(`${path}.settings.formula`, `Fórmula com erro: ${compiled.error}`);
        continue;
      }
      const inForm = path.startsWith('form.');
      for (const ref of compiled.formula.refs) {
        const info = codes.get(ref);
        if (!info || (inForm && !info.inForm)) {
          error(`${path}.settings.formula`, `A fórmula usa {${ref}}, que não existe${inForm ? ' no formulário de abertura' : ''}.`);
        } else if (!FIELD_TYPE_GUIDE[info.type as keyof typeof FIELD_TYPE_GUIDE]?.numeric && info.type !== 'product_table') {
          error(`${path}.settings.formula`, `A fórmula usa {${ref}}, que não é numérico.`);
        } else if (ref === field.code) {
          error(`${path}.settings.formula`, 'A fórmula não pode usar o próprio campo.');
        }
      }
    }
  }

  function validateFlow(raw: unknown, path: string): FlowShape | undefined {
    if (!isObj(raw)) {
      error(path, 'Fluxo precisa ser um objeto.');
      return undefined;
    }
    unknownKeys(raw, new Set(['name', 'active', 'nodes', 'edges', 'editableByAi']), path, error);
    if (!isText(raw.name)) error(`${path}.name`, 'Dê um nome ao fluxo (diga a regra, ex.: "Acima de R$ 10 mil vai para a diretoria").');
    if (raw.editableByAi === false) error(path, 'Este fluxo tem nós que a IA não cria: monte-o no editor de fluxos.');
    const nodes = list(raw.nodes);
    if (nodes.length === 0) error(`${path}.nodes`, 'Fluxo sem nós.');
    if (nodes.length > BLUEPRINT_LIMITS.nodesPerFlow) error(`${path}.nodes`, `No máximo ${BLUEPRINT_LIMITS.nodesPerFlow} nós.`);

    const typeByKey = new Map<string, string>();
    const dataByKey = new Map<string, Obj>();
    const pathByKey = new Map<string, string>();
    const next = new Map<string, Array<{ to: string; when?: string }>>();
    nodes.forEach((node, ni) => {
      const npath = `${path}.nodes[${ni}]`;
      if (!isObj(node)) {
        error(npath, 'Nó precisa ser um objeto.');
        return;
      }
      unknownKeys(node, new Set(['key', 'type', 'data']), npath, error);
      if (!isText(node.key)) error(`${npath}.key`, 'Dê uma chave ao nó.');
      else if (typeByKey.has(node.key)) error(`${npath}.key`, `Chave de nó "${node.key}" repetida.`);
      const type = String(node.type ?? '');
      const guide = FLOW_NODE_GUIDE[type];
      if (!guide) {
        error(`${npath}.type`, `Tipo de nó "${type}" não é criado pela IA. Aceitos: ${Object.keys(FLOW_NODE_GUIDE).join(', ')}.`);
        return;
      }
      if (isText(node.key)) {
        typeByKey.set(node.key, type);
        pathByKey.set(node.key, npath);
        if (isObj(node.data)) dataByKey.set(node.key, node.data);
      }
      const data = node.data === undefined ? {} : node.data;
      if (!isObj(data)) {
        error(`${npath}.data`, 'data precisa ser um objeto.');
        return;
      }
      unknownKeys(data, new Set([...Object.keys(guide.data), 'label']), `${npath}.data`, error);
      validateNodeData(type, data, `${npath}.data`);
    });

    const triggers = [...typeByKey.entries()].filter(([, type]) => type.startsWith('trigger_'));
    if (nodes.length > 0 && triggers.length === 0) error(`${path}.nodes`, 'O fluxo precisa de um gatilho.');

    const edges = list(raw.edges);
    const outgoing = new Map<string, string[]>();
    edges.forEach((edge, ei) => {
      const epath = `${path}.edges[${ei}]`;
      if (!isObj(edge)) {
        error(epath, 'Ligação precisa ser um objeto.');
        return;
      }
      unknownKeys(edge, new Set(['from', 'to', 'when']), epath, error);
      const fromType = isText(edge.from) ? typeByKey.get(edge.from) : undefined;
      const toType = isText(edge.to) ? typeByKey.get(edge.to) : undefined;
      if (!fromType) error(`${epath}.from`, `Nó "${String(edge.from)}" não existe.`);
      if (!toType) error(`${epath}.to`, `Nó "${String(edge.to)}" não existe.`);
      else if (toType.startsWith('trigger_')) error(`${epath}.to`, 'Gatilho não recebe ligação.');
      if (fromType && CONDITION_NODE_TYPES.has(fromType)) {
        if (edge.when !== 'yes' && edge.when !== 'no') error(`${epath}.when`, 'Saída de condição precisa de when: "yes" ou "no".');
      } else if (edge.when !== undefined) {
        error(`${epath}.when`, 'when só vale na saída de uma condição.');
      }
      if (fromType && toType) {
        outgoing.set(String(edge.from), [...(outgoing.get(String(edge.from)) ?? []), String(edge.to)]);
        next.set(String(edge.from), [
          ...(next.get(String(edge.from)) ?? []),
          { to: String(edge.to), ...(typeof edge.when === 'string' ? { when: edge.when } : {}) },
        ]);
      }
    });

    // Sem ciclo (o motor recusaria).
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (key: string): boolean => {
      if (state.get(key) === 'visiting') return true;
      if (state.get(key) === 'done') return false;
      state.set(key, 'visiting');
      const cyclic = (outgoing.get(key) ?? []).some(visit);
      state.set(key, 'done');
      return cyclic;
    };
    if ([...typeByKey.keys()].some(visit)) error(`${path}.edges`, 'As ligações formam um ciclo.');

    // Aprovação precisa de uma fase no contexto: gatilho de fase ou "Mover para fase" antes.
    const hasPhaseTrigger = triggers.some(([, type]) => PHASE_CONTEXT_TRIGGERS.has(type));
    const hasMove = [...typeByKey.values()].includes('action_move_phase');
    if ([...typeByKey.values()].includes('action_create_approval') && !hasPhaseTrigger && !hasMove) {
      warn(path, 'A aprovação é da fase atual: use um gatilho de fase ou um "Mover para fase" antes dela.');
    }
    return { path, typeByKey, dataByKey, pathByKey, next };
  }

  /**
   * Regras sobre o desenho dos fluxos (não só a forma): aprovação que move o card sem conferir o
   * resultado, resultado de aprovação que não leva a nada e duas entradas no mesmo evento movendo
   * o card (dois fluxos brigando, quando cabia um fluxo só com várias entradas).
   */
  function checkFlowLogic(shapes: FlowShape[]): void {
    const seen: Array<{ type: string; phase?: string; from: string; where: string }> = [];
    for (const shape of shapes) {
      for (const [key, type] of shape.typeByKey) {
        if (!type.startsWith('trigger_')) continue;
        const tpath = shape.pathByKey.get(key) ?? shape.path;
        const reached = walk(shape, key);
        if (type === 'trigger_approval_completed') {
          if (reached.movesWithoutResult) {
            error(
              tpath,
              'Esta "Aprovação concluída" move o card sem conferir o resultado: ligue antes um "Resultado da aprovação" (condition_approval_result). Sem isso, a reprovação também move o card.',
            );
          }
          // Conta o conjunto: duas condições em paralelo (aprovada / reprovada) cobrem os dois lados.
          for (const missing of ['aprovada', 'reprovada']) {
            if (!reached.checksResult || reached.outcomes.has(missing)) continue;
            const hint = missing === 'aprovada' ? 'mover para a próxima fase' : 'devolver para a fase anterior';
            warn(
              tpath,
              `Quando a aprovação for ${missing}, nada acontece: o card fica parado na fase até alguém mover. Ligue esse resultado (ex.: ${hint}).`,
            );
          }
        }
        if (!PHASE_EVENT_TRIGGERS.has(type) || !reached.moves) continue;
        const data = shape.dataByKey.get(key) ?? {};
        const phase = isText(data.phase) ? data.phase : undefined;
        const from = isText(data.fromPhase) ? data.fromPhase : '';
        const clash = seen.find(
          (other) =>
            other.type === type &&
            other.from === from &&
            (phase === undefined || other.phase === undefined || other.phase === phase),
        );
        if (clash) {
          error(
            tpath,
            `Outra entrada já reage ao mesmo evento${phase ? ` na fase "${phase}"` : ''} e move o card (${clash.where}). Junte num fluxo só, com uma entrada por fase compartilhando as ações; senão os dois movem o card ao mesmo tempo.`,
          );
        }
        seen.push({ type, phase, from, where: tpath });
      }
    }
  }

  /** A partir de um gatilho: move o card? move sem passar pelo resultado da aprovação? */
  function walk(
    shape: FlowShape,
    start: string,
  ): { moves: boolean; movesWithoutResult: boolean; checksResult: boolean; outcomes: Set<string> } {
    let moves = false;
    let movesWithoutResult = false;
    let checksResult = false;
    /** Resultados da aprovação que levam a alguma ação. */
    const outcomes = new Set<string>();
    const visited = new Set<string>();
    const stack: Array<{ key: string; checked: boolean }> = [{ key: start, checked: false }];
    while (stack.length) {
      const { key, checked } = stack.pop() as { key: string; checked: boolean };
      if (visited.has(`${key}|${checked}`)) continue;
      visited.add(`${key}|${checked}`);
      const type = shape.typeByKey.get(key);
      const isResult = type === 'condition_approval_result';
      if (type === 'action_move_phase') {
        moves = true;
        if (!checked) movesWithoutResult = true;
      }
      const outs = shape.next.get(key) ?? [];
      if (isResult) {
        checksResult = true;
        const yesMeans = shape.dataByKey.get(key)?.result === 'rejected' ? 'reprovada' : 'aprovada';
        const noMeans = yesMeans === 'aprovada' ? 'reprovada' : 'aprovada';
        if (outs.some((out) => out.when === 'yes')) outcomes.add(yesMeans);
        if (outs.some((out) => out.when === 'no')) outcomes.add(noMeans);
      }
      for (const out of outs) stack.push({ key: out.to, checked: checked || isResult });
    }
    return { moves, movesWithoutResult, checksResult, outcomes };
  }

  function phaseRef(value: unknown, path: string, required: boolean): void {
    if (value === undefined || value === null || value === '') {
      if (required) error(path, 'Informe a chave da fase.');
      return;
    }
    if (!isText(value) || !phaseKeys.has(value)) error(path, `A fase "${String(value)}" não existe neste processo.`);
  }

  function validateNodeData(type: string, data: Obj, path: string): void {
    switch (type) {
      case 'trigger_phase_entered':
        phaseRef(data.phase, `${path}.phase`, false);
        phaseRef(data.fromPhase, `${path}.fromPhase`, false);
        if (isText(data.phase) && data.phase === data.fromPhase) error(`${path}.fromPhase`, 'Origem igual ao destino.');
        return;
      case 'trigger_approval_completed':
      case 'trigger_phase_field_saved':
      case 'trigger_sla_warning':
      case 'trigger_sla_breached':
        phaseRef(data.phase, `${path}.phase`, false);
        if (type === 'trigger_approval_completed' && data.phase === undefined) {
          warn(`${path}.phase`, 'Sem fase, qualquer aprovação do processo dispara o fluxo.');
        }
        return;
      case 'condition_field_value':
        if (!isText(data.fieldCode) || !codes.has(data.fieldCode)) error(`${path}.fieldCode`, `O campo "${String(data.fieldCode)}" não existe.`);
        if (!FIELD_OPERATORS.has(String(data.operator))) error(`${path}.operator`, `Operador inválido: ${[...FIELD_OPERATORS].join(', ')}.`);
        if (data.value !== undefined && typeof data.value !== 'string' && typeof data.value !== 'number') {
          error(`${path}.value`, 'Valor em texto ou número.');
        }
        return;
      case 'condition_approval_result':
        if (data.result !== 'approved' && data.result !== 'rejected') error(`${path}.result`, 'Use "approved" ou "rejected".');
        return;
      case 'condition_solicitation_priority':
        if (!PRIORITY_OPERATORS.has(String(data.operator))) error(`${path}.operator`, 'Operador inválido.');
        if (!PRIORITIES.has(String(data.value))) error(`${path}.value`, 'Use low, medium, high ou urgent.');
        return;
      case 'action_move_phase':
      case 'action_wait_for_phase_fields':
        phaseRef(data.phase, `${path}.phase`, true);
        return;
      case 'action_create_approval': {
        if (!isText(data.title)) error(`${path}.title`, 'Dê um título à aprovação.');
        const count = checkPeople({ roles: data.approverRoles, users: data.approverUsers }, path);
        if (data.useApproversOfPhase === true) {
          if (count > 0) warn(path, 'Com useApproversOfPhase, approverRoles/approverUsers são ignorados.');
        } else if (count === 0) {
          error(path, 'Diga quem aprova: approverRoles, approverUsers ou useApproversOfPhase.');
        }
        if (data.rule !== undefined && !RULES.has(String(data.rule))) error(`${path}.rule`, 'Use any, all ou sequential.');
        return;
      }
      case 'action_notification': {
        if (!CHANNELS.has(String(data.channel))) error(`${path}.channel`, 'Use in_app, email ou whatsapp.');
        if (!isText(data.message)) error(`${path}.message`, 'Escreva a mensagem.');
        if (data.channel === 'email' && !isText(data.title)) error(`${path}.title`, 'E-mail precisa de assunto (title).');
        const to = list(data.to);
        if (to.length === 0) error(`${path}.to`, 'Diga quem recebe, numa lista: to: ["requester"], ["responsible"], [{ "role": "<código>" }], [{ "users": ["e-mail"] }] ou [{ "field": "<código>" }].');
        to.forEach((entry, ti) => {
          const tpath = `${path}.to[${ti}]`;
          if (entry === 'requester' || entry === 'responsible') return;
          if (!isObj(entry)) {
            error(tpath, 'Use "requester", "responsible", { role }, { users } ou { field }.');
            return;
          }
          if (entry.role !== undefined) {
            if (!isText(entry.role) || !ctx.roleCodes.has(entry.role)) error(`${tpath}.role`, `O perfil "${String(entry.role)}" não existe.`);
          } else if (entry.users !== undefined) {
            checkPeople({ users: entry.users }, tpath);
          } else if (entry.field !== undefined) {
            if (!isText(entry.field) || !codes.has(entry.field)) error(`${tpath}.field`, `O campo "${String(entry.field)}" não existe.`);
          } else {
            error(tpath, 'Use "requester", "responsible", { role }, { users } ou { field }.');
          }
        });
        return;
      }
      case 'action_assign_responsible':
        if (!isText(data.user) || !ctx.userIdByEmail.has(lower(data.user))) {
          error(`${path}.user`, `Não há pessoa ativa com o e-mail "${String(data.user)}".`);
        }
        return;
      default:
        return;
    }
  }
}

function unknownKeys(value: Obj, allowed: Set<string>, path: string, error: (path: string, message: string) => void): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      error(path ? `${path}.${key}` : key, `Chave "${key}" não existe aqui. Aceitas: ${[...allowed].join(', ')}.`);
    }
  }
}

function sectionKeys(sections: Obj[], base: string, error: (path: string, message: string) => void): Set<string> {
  const keys = new Set<string>();
  sections.forEach((section, si) => {
    const key = section.key;
    if (!isText(key) || !FIELD_CODE_PATTERN.test(key)) {
      error(`${base}[${si}].key`, 'Chave da seção inválida: minúsculas sem acento, números e "_", começando por letra (ex.: "dados_pedido").');
    } else if (key === FORM_SUBMIT || key === PHASE_FORM_END) {
      error(`${base}[${si}].key`, `"${key}" é reservado.`);
    } else if (keys.has(key)) {
      error(`${base}[${si}].key`, `Chave de seção "${key}" repetida.`);
    } else {
      keys.add(key);
    }
  });
  return keys;
}

/** E-mails citados no processo (para buscar só essas pessoas no banco). */
export function collectBlueprintEmails(input: unknown): string[] {
  const emails = new Set<string>();
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if ((key === 'users' || key === 'approverUsers') && typeof item === 'string') emails.add(lower(item));
        else walk(item);
      });
      return;
    }
    if (isObj(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'user' && typeof v === 'string') emails.add(lower(v));
        else if (k === 'order' && Array.isArray(v)) {
          v.forEach((entry) => {
            if (typeof entry === 'string' && entry.startsWith('user:')) emails.add(lower(entry.slice(5)));
          });
        } else walk(v, k);
      }
    }
  };
  walk(input);
  return [...emails];
}
