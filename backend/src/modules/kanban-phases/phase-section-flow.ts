import { FormFieldType } from '../../common/enums/form-field-type.enum';
import type {
  KanbanPhaseSectionBranch,
  KanbanPhaseSectionRoute,
} from '../../database/entities/kanban-phase.entity';

/**
 * Seções e ramificação do formulário de uma fase. Os campos de fase continuam uma lista em ordem;
 * cada campo "Título" abre uma seção, e o que vem antes do primeiro título é a seção de início
 * (`__inicio__`). O caminho (`kanban_phases.section_flow`) diz para onde cada seção leva — mesma
 * regra do formulário de abertura (responses/form-submission.validator.ts): a primeira ramificação
 * que casar decide; sem nenhuma, vale o caminho padrão.
 *
 * O front tem a mesma conta em frontend/src/modules/kanban-phases/lib/phase-section-flow.ts.
 */

export const PHASE_START_SECTION = '__inicio__';

/** Tipos de campo que podem decidir uma ramificação. */
const BRANCH_FIELD_TYPES: ReadonlySet<string> = new Set([
  FormFieldType.SINGLE_SELECT,
  FormFieldType.MULTI_SELECT,
  FormFieldType.CHECKBOX,
]);

type SectionFieldLike = {
  code: string;
  fieldType: string;
  order?: number;
};

type OptionFieldLike = SectionFieldLike & {
  options?: Array<{ value: string }> | null;
  optionsJson?: Array<{ value: string }> | null;
};

/** O caminho como chega do cliente (DTO) ou do banco. */
export type PhaseSectionRouteInput = {
  section?: string;
  next?: string | null;
  branches?: ReadonlyArray<{
    fieldCode: string;
    optionValue?: string | null;
    checkboxValue?: boolean | null;
    target?: string | null;
  }>;
};

export type PhaseFormSection<F extends SectionFieldLike> = {
  /** Código do campo "Título" que abre a seção, ou `__inicio__`. */
  key: string;
  /** O campo "Título" da seção (ausente na seção de início). */
  title: F | null;
  /** Campos da seção, sem o título. */
  fields: F[];
};

function inOrder<F extends SectionFieldLike>(fields: F[]): F[] {
  if (!fields.every((field) => typeof field.order === 'number')) return fields;
  return [...fields].sort((a, b) => (a.order as number) - (b.order as number));
}

export function groupPhaseSections<F extends SectionFieldLike>(fields: F[]): PhaseFormSection<F>[] {
  const sections: PhaseFormSection<F>[] = [];
  let current: PhaseFormSection<F> | null = null;
  for (const field of inOrder(fields)) {
    if (field.fieldType === FormFieldType.TITLE) {
      current = { key: field.code, title: field, fields: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { key: PHASE_START_SECTION, title: null, fields: [] };
      sections.push(current);
    }
    current.fields.push(field);
  }
  return sections;
}

function optionValuesOf(field: OptionFieldLike): string[] {
  return (field.options ?? field.optionsJson ?? []).map((option) => option.value);
}

function sectionName(section: PhaseFormSection<SectionFieldLike>): string {
  const label = (section.title as { label?: string } | null)?.label?.trim();
  return label ? `"${label}"` : section.key === PHASE_START_SECTION ? 'de início' : `"${section.key}"`;
}

/**
 * Confere o caminho contra os campos da fase e o deixa enxuto: seção sem ramificação e com o
 * caminho padrão some da lista; sem nada, volta `null`. Referência que não existe é erro (com a
 * mensagem para a pessoa), nunca vira vazio em silêncio.
 */
export function normalizePhaseSectionFlow(
  raw: ReadonlyArray<PhaseSectionRouteInput> | null | undefined,
  fields: OptionFieldLike[],
): KanbanPhaseSectionRoute[] | null {
  if (!raw || raw.length === 0) return null;
  const sections = groupPhaseSections(fields);
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const titleCodes = sections.flatMap((section) => (section.title ? [section.key] : []));
  const repeated = titleCodes.find((code, index) => titleCodes.indexOf(code) !== index);
  if (repeated) throw new Error(`duas seções usam o código "${repeated}".`);

  const seen = new Set<string>();
  const routes: KanbanPhaseSectionRoute[] = [];
  for (const input of raw) {
    const key = typeof input.section === 'string' ? input.section : '';
    const section = byKey.get(key);
    if (!section) throw new Error(`o caminho cita uma seção que não existe ("${key}").`);
    if (seen.has(key)) throw new Error(`a seção ${sectionName(section)} aparece duas vezes no caminho.`);
    seen.add(key);

    const assertTarget = (target: string | null, what: string): void => {
      if (target === null) return;
      if (!byKey.has(target)) {
        throw new Error(`${what} da seção ${sectionName(section)} leva a uma seção que não existe.`);
      }
      if (target === key) throw new Error(`${what} da seção ${sectionName(section)} leva a ela mesma.`);
    };

    const hasNext = input.next !== undefined;
    const next = hasNext ? (input.next ?? null) : undefined;
    if (next !== undefined) assertTarget(next, 'O caminho padrão');

    const branches: KanbanPhaseSectionBranch[] = [];
    for (const branch of input.branches ?? []) {
      const field = section.fields.find((candidate) => candidate.code === branch.fieldCode);
      if (!field) {
        throw new Error(
          `uma ramificação da seção ${sectionName(section)} usa um campo que não está nela ("${branch.fieldCode}").`,
        );
      }
      if (!BRANCH_FIELD_TYPES.has(field.fieldType)) {
        throw new Error(
          `o campo "${field.code}" não decide ramificação: use uma lista ou uma caixa de seleção.`,
        );
      }
      const target = branch.target ?? null;
      assertTarget(target, 'Uma ramificação');
      if (field.fieldType === FormFieldType.CHECKBOX) {
        if (typeof branch.checkboxValue !== 'boolean') {
          throw new Error(`a ramificação pelo campo "${field.code}" precisa dizer Sim ou Não.`);
        }
        branches.push({ fieldCode: field.code, optionValue: null, checkboxValue: branch.checkboxValue, target });
        continue;
      }
      const optionValue = branch.optionValue ?? '';
      if (!optionValuesOf(field).includes(optionValue)) {
        throw new Error(`a ramificação pelo campo "${field.code}" usa uma opção que não existe.`);
      }
      branches.push({ fieldCode: field.code, optionValue, checkboxValue: null, target });
    }

    if (next === undefined && branches.length === 0) continue;
    routes.push({ section: key, ...(next !== undefined ? { next } : {}), branches });
  }
  return routes.length > 0 ? routes : null;
}

function branchMatches(
  branch: KanbanPhaseSectionBranch,
  field: SectionFieldLike,
  value: unknown,
): boolean {
  if (branch.checkboxValue !== null) return Boolean(value) === branch.checkboxValue;
  if (branch.optionValue === null) return false;
  if (field.fieldType === FormFieldType.MULTI_SELECT) {
    return Array.isArray(value) && value.includes(branch.optionValue);
  }
  return String(value ?? '') === branch.optionValue;
}

/**
 * Seções do caminho com as respostas atuais, em ordem. Sem caminho configurado, todas. Campo da
 * ramificação ainda sem resposta segue o caminho padrão (como no formulário de abertura).
 */
export function reachablePhaseSections<F extends SectionFieldLike>(
  fields: F[],
  flow: ReadonlyArray<KanbanPhaseSectionRoute> | null | undefined,
  valueOf: (field: F) => unknown,
): PhaseFormSection<F>[] {
  const sections = groupPhaseSections(fields);
  if (!flow || flow.length === 0) return sections;
  const indexOf = new Map(sections.map((section, index) => [section.key, index]));
  const routes = new Map(flow.map((route) => [route.section, route]));
  const reachable: PhaseFormSection<F>[] = [];
  const visited = new Set<string>();

  let index: number | undefined = sections.length > 0 ? 0 : undefined;
  while (index !== undefined && !visited.has(sections[index].key)) {
    const section = sections[index];
    visited.add(section.key);
    reachable.push(section);

    const route = routes.get(section.key);
    let next: string | null | undefined;
    for (const branch of route?.branches ?? []) {
      const field = section.fields.find((candidate) => candidate.code === branch.fieldCode);
      if (field && branchMatches(branch, field, valueOf(field))) {
        next = branch.target;
        break;
      }
    }
    if (next === undefined) {
      next = route?.next !== undefined ? route.next : (sections[index + 1]?.key ?? null);
    }
    index = next === null ? undefined : indexOf.get(next);
  }
  return reachable;
}

/** Campos (títulos inclusive) das seções do caminho. */
export function reachablePhaseFields<F extends SectionFieldLike>(
  fields: F[],
  flow: ReadonlyArray<KanbanPhaseSectionRoute> | null | undefined,
  valueOf: (field: F) => unknown,
): Set<F> {
  const reachable = new Set<F>();
  for (const section of reachablePhaseSections(fields, flow, valueOf)) {
    if (section.title) reachable.add(section.title);
    section.fields.forEach((field) => reachable.add(field));
  }
  return reachable;
}
