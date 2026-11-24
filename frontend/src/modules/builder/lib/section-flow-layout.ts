import {
  fieldTypeChoiceOf,
  isDecorativeFieldType,
  type DraftSection,
  type DraftSectionBranch,
  type FieldTypeChoice,
} from '../types';

export const TERMINAL_NODE_ID = '__submit__';

/** Quantos campos o nó mostra antes do "+N campos". */
export const SECTION_NODE_PREVIEW_LIMIT = 4;

export type SectionFlowPreviewField = {
  label: string;
  /** Opção do seletor (inclui a "Lista suspensa"), para escolher o ícone. */
  fieldType: FieldTypeChoice;
  required: boolean;
};

export type SectionFlowNodeData = {
  index: number;
  title: string;
  description: string;
  /** Todos os campos da seção, decorativos inclusive. */
  fieldCount: number;
  /** Os primeiros campos que recebem resposta (título, descrição e divisor ficam de fora). */
  previewFields: SectionFlowPreviewField[];
  /** Campos que recebem resposta além dos da prévia. */
  remainingFieldCount: number;
  /** É a seção aberta no modal. */
  selected: boolean;
  ruleCount: number;
  automationCount: number;
  orphaned: boolean;
  [key: string]: unknown;
};

/** Cor da aresta: caminho padrão em cinza, regra de ramificação em âmbar. */
export const SECTION_EDGE_COLORS = {
  default: '#94a3b8',
  rule: '#F0A500',
} as const;

export type SectionFlowEdgeData = {
  kind: 'default' | 'rule';
  label?: string;
  [key: string]: unknown;
};

export type SectionFlowNode = {
  id: string;
  type: 'section' | 'terminal';
  position: { x: number; y: number };
  data: SectionFlowNodeData | Record<string, never>;
};

export type SectionFlowEdge = {
  id: string;
  source: string;
  target: string;
  type: 'sectionEdge';
  data: SectionFlowEdgeData;
};

// Nó de 260px; 350px de uma coluna para a outra.
const NODE_WIDTH = 260;
const NODE_GAP_X = 90;
const NODE_Y = 120;
/**
 * Distância entre as linhas da disposição por caminho. O nó mais alto (prévia cheia + "+N campos" +
 * rodapé) tem 245px; com 200 a linha de baixo tapava o rodapé da de cima.
 */
const ROW_GAP_Y = 300;

/** O que a disposição por caminho precisa saber de uma seção: para onde ela leva. */
export type SectionFlowLinks = {
  id: string;
  nextSectionId: string | null;
  nextIsSubmit: boolean;
  branches: Array<{ targetSectionId: string | null; targetIsSubmit: boolean }>;
};

/**
 * Disposição "por caminho" do mapa de seções (botão Organizar e formulário da fase):
 * - coluna = o caminho mais longo até a seção, só pelas setas que vão para frente na ordem —
 *   os dois lados de uma ramificação ficam na mesma coluna, um embaixo do outro;
 * - o caminho padrão a partir da primeira seção fica na linha de cima; o que só é alcançado por
 *   ramificação desce uma linha por coluna, para a seta do caminho padrão não passar por trás.
 */
export function organizeSectionFlow(sections: SectionFlowLinks[]): Map<string, { x: number; y: number }> {
  const indexOf = new Map(sections.map((section, index) => [section.id, index]));
  const targetsOf = (section: SectionFlowLinks): string[] =>
    [
      section.nextIsSubmit ? null : section.nextSectionId,
      ...section.branches.map((branch) => (branch.targetIsSubmit ? null : branch.targetSectionId)),
    ].filter((target): target is string => target !== null);

  const levels = sections.map(() => 0);
  sections.forEach((section, index) => {
    for (const target of targetsOf(section)) {
      const targetIndex = indexOf.get(target);
      if (targetIndex !== undefined && targetIndex > index) {
        levels[targetIndex] = Math.max(levels[targetIndex], levels[index] + 1);
      }
    }
  });

  const mainPath = new Set<string>();
  let current: SectionFlowLinks | undefined = sections[0];
  while (current && !mainPath.has(current.id)) {
    mainPath.add(current.id);
    const nextIndex: number | undefined =
      current.nextIsSubmit || !current.nextSectionId ? undefined : indexOf.get(current.nextSectionId);
    current = nextIndex === undefined ? undefined : sections[nextIndex];
  }

  const rowsUsed = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  sections.forEach((section, index) => {
    let row = 0;
    if (!mainPath.has(section.id)) {
      row = (rowsUsed.get(levels[index]) ?? 0) + 1;
      rowsUsed.set(levels[index], row);
    }
    positions.set(section.id, {
      x: levels[index] * (NODE_WIDTH + NODE_GAP_X),
      y: NODE_Y + row * ROW_GAP_Y,
    });
  });
  return positions;
}

/** Posição salva, quando existe; senão a linha reta padrão pela ordem das seções. */
function sectionFlowPosition(section: DraftSection, index: number): { x: number; y: number } {
  const { flowPositionX: x, flowPositionY: y } = section;
  if (typeof x === 'number' && typeof y === 'number') return { x, y };
  return { x: index * (NODE_WIDTH + NODE_GAP_X), y: NODE_Y };
}

/** O que a regra precisa saber do campo: o tipo e os valores das opções que existem hoje. */
export type BranchFieldInfo = { fieldType: string; optionValues: Set<string> };

/**
 * Campos pelo código, para conferir as regras de `ownSection`: os da própria seção valem primeiro
 * (é onde a Lógica de fluxo cria a regra); os das outras seções, depois — o backend procura o
 * código no formulário inteiro ao gravar.
 */
export function branchFieldsByCode(
  sections: DraftSection[],
  ownSection?: DraftSection,
): Map<string, BranchFieldInfo> {
  const fields = new Map<string, BranchFieldInfo>();
  const add = (field: DraftSection['fields'][number]) =>
    fields.set(field.code, {
      fieldType: field.fieldType,
      optionValues: new Set(field.options.map((option) => option.internalValue)),
    });
  for (const section of sections) {
    if (section !== ownSection) section.fields.forEach(add);
  }
  ownSection?.fields.forEach(add);
  return fields;
}

export type BranchOrphanReason =
  | 'missing_field'
  | 'not_branchable'
  | 'missing_value'
  | 'missing_option'
  | 'missing_target';

/** Explicação curta, para quem vai decidir remover a regra na Lógica de fluxo. */
export const BRANCH_ORPHAN_REASON_TEXT: Record<BranchOrphanReason, string> = {
  missing_field: 'o campo desta regra foi removido',
  not_branchable: 'o campo não é mais lista nem caixa de seleção',
  missing_value: 'a regra não diz para qual resposta vale',
  missing_option: 'a opção desta regra não existe mais no campo',
  missing_target: 'a seção de destino foi removida',
};

/**
 * Por que a regra não vale mais (null = vale). Com `fields`, confere também o campo e a opção, como o
 * backend: regra numa opção apagada ou num campo que trocou de tipo sai do save sem valor
 * (optionId/checkboxValue nulos) e vira órfã — melhor avisar ainda no rascunho.
 */
export function branchOrphanReason(
  branch: DraftSectionBranch,
  sectionIds: Set<string>,
  fields?: Map<string, BranchFieldInfo>,
): BranchOrphanReason | null {
  if (!branch.fieldCode) return 'missing_field';
  const field = fields?.get(branch.fieldCode);
  if (fields && !field) return 'missing_field';
  if (field) {
    if (field.fieldType === 'checkbox') {
      if (branch.checkboxValue === null) return 'missing_value';
    } else if (field.fieldType === 'single_select' || field.fieldType === 'multi_select') {
      if (branch.optionValue === null) return 'missing_value';
      if (!field.optionValues.has(branch.optionValue)) return 'missing_option';
    } else {
      return 'not_branchable';
    }
  } else if (branch.optionValue === null && branch.checkboxValue === null) {
    return 'missing_value';
  }
  if (!branch.targetIsSubmit && (!branch.targetSectionId || !sectionIds.has(branch.targetSectionId))) {
    return 'missing_target';
  }
  return null;
}

export function isBranchOrphaned(
  branch: DraftSectionBranch,
  sectionIds: Set<string>,
  fields?: Map<string, BranchFieldInfo>,
): boolean {
  return branchOrphanReason(branch, sectionIds, fields) !== null;
}

export function isNextSectionOrphaned(section: DraftSection, sectionIds: Set<string>): boolean {
  return !section.nextIsSubmit && (!section.nextSectionId || !sectionIds.has(section.nextSectionId));
}

export function isSectionOrphaned(
  section: DraftSection,
  sectionIds: Set<string>,
  fields?: Map<string, BranchFieldInfo>,
): boolean {
  return (
    isNextSectionOrphaned(section, sectionIds) ||
    section.branches.some((branch) => isBranchOrphaned(branch, sectionIds, fields))
  );
}

export function countOrphanedRules(sections: DraftSection[]): number {
  const sectionIds = new Set(sections.map((s) => s.id));
  let count = 0;
  for (const section of sections) {
    const fields = branchFieldsByCode(sections, section);
    if (isNextSectionOrphaned(section, sectionIds)) count += 1;
    count += section.branches.filter((branch) => isBranchOrphaned(branch, sectionIds, fields)).length;
  }
  return count;
}

function branchLabel(branch: DraftSectionBranch, section: DraftSection): string {
  if (branch.optionValue !== null) {
    const field = section.fields.find((f) => f.code === branch.fieldCode);
    const option = field?.options.find((o) => o.internalValue === branch.optionValue);
    return option?.displayLabel ?? branch.optionValue;
  }
  if (branch.checkboxValue !== null) return branch.checkboxValue ? 'Sim' : 'Não';
  return '';
}

export function buildSectionFlowGraph(
  sections: DraftSection[],
  automationCountBySectionId: Record<string, number> = {},
  selectedSectionId: string | null = null,
): { nodes: SectionFlowNode[]; edges: SectionFlowEdge[] } {
  const sectionIds = new Set(sections.map((s) => s.id));

  const nodes: SectionFlowNode[] = sections.map((section, index) => {
    const answerFields = section.fields.filter((field) => !isDecorativeFieldType(field.fieldType));
    const fields = branchFieldsByCode(sections, section);
    return {
      id: section.id,
      type: 'section',
      // Usa a posição salva quando existe; a linha reta é só o padrão para
      // seção que nunca foi arrastada. `typeof === 'number'` (não `!== null`)
      // de propósito: também cobre um section vindo de fixture de teste sem o
      // campo, em vez de tentar desenhar em x/y undefined.
      position: sectionFlowPosition(section, index),
      data: {
        index,
        title: section.title || `Seção ${index + 1}`,
        description: (section.description ?? '').trim(),
        fieldCount: section.fields.length,
        previewFields: answerFields.slice(0, SECTION_NODE_PREVIEW_LIMIT).map((field) => ({
          label: field.label || 'Campo sem rótulo',
          fieldType: fieldTypeChoiceOf(field.fieldType, field.settingsJson),
          required: field.required,
        })),
        remainingFieldCount: Math.max(answerFields.length - SECTION_NODE_PREVIEW_LIMIT, 0),
        selected: section.id === selectedSectionId,
        ruleCount: section.branches.filter((branch) => !isBranchOrphaned(branch, sectionIds, fields)).length,
        automationCount: automationCountBySectionId[section.id] ?? 0,
        orphaned: isSectionOrphaned(section, sectionIds, fields),
      },
    };
  });

  // "Enviar resposta" uma coluna depois da seção mais à direita (na linha reta padrão, é o mesmo
  // lugar de sempre; organizado por caminho, não fica longe das últimas seções).
  const lastX = Math.max(...nodes.map((node) => node.position.x), -(NODE_WIDTH + NODE_GAP_X));
  nodes.push({
    id: TERMINAL_NODE_ID,
    type: 'terminal',
    position: { x: lastX + NODE_WIDTH + NODE_GAP_X, y: NODE_Y },
    data: {},
  });

  const edges: SectionFlowEdge[] = [];

  for (const section of sections) {
    const fields = branchFieldsByCode(sections, section);
    const hasValidRules = section.branches.some((branch) => !isBranchOrphaned(branch, sectionIds, fields));

    for (const branch of section.branches) {
      if (isBranchOrphaned(branch, sectionIds, fields)) continue;
      const targetId = branch.targetIsSubmit ? TERMINAL_NODE_ID : (branch.targetSectionId as string);
      edges.push({
        id: `branch_${branch.id}`,
        source: section.id,
        target: targetId,
        type: 'sectionEdge',
        data: { kind: 'rule', label: branchLabel(branch, section) },
      });
    }

    if (!isNextSectionOrphaned(section, sectionIds)) {
      const targetId = section.nextIsSubmit ? TERMINAL_NODE_ID : (section.nextSectionId as string);
      edges.push({
        id: `next_${section.id}`,
        source: section.id,
        target: targetId,
        type: 'sectionEdge',
        data: { kind: 'default', label: hasValidRules ? 'padrão' : undefined },
      });
    }
  }

  return { nodes, edges };
}
