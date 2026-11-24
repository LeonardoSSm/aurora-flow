import {
  fieldTypePickerGroups,
  isDecorativeFieldType,
  normalizeSearchText,
  type DraftField,
} from '../types';

export type IndexedField = {
  field: DraftField;
  /** Posição do campo na seção, a partir de 0 — continua a mesma com a busca ativa. */
  index: number;
};

/** Campos cujo rótulo contém a busca (sem diferenciar maiúsculas nem acentos). */
export function filterFieldsByQuery(fields: DraftField[], query: string): IndexedField[] {
  const indexed = fields.map((field, index) => ({ field, index }));
  const needle = normalizeSearchText(query);
  if (!needle) return indexed;
  return indexed.filter(({ field }) => normalizeSearchText(field.label).includes(needle));
}

/** "19 campos · 9 obrigatórios" — só os campos que recebem resposta. */
export function summarizeFields(fields: DraftField[]): string {
  const answerFields = fields.filter((field) => !isDecorativeFieldType(field.fieldType));
  const required = answerFields.filter((field) => field.required).length;
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return `${plural(answerFields.length, 'campo', 'campos')} · ${plural(required, 'obrigatório', 'obrigatórios')}`;
}

export type FieldTypePickerGroup = (typeof fieldTypePickerGroups)[number];

/**
 * Grupos do seletor de tipos filtrados pela busca (nome do tipo ou do grupo, sem acento).
 * Grupo sem resultado some. "Tabela dinâmica do ERP" só entra com o ERP_TABLE_ENABLED.
 */
export function filterFieldTypeGroups(
  query: string,
  { erpTableEnabled }: { erpTableEnabled: boolean },
): FieldTypePickerGroup[] {
  const needle = normalizeSearchText(query);
  return fieldTypePickerGroups
    .map((group) => {
      const options = group.options.filter((option) => option.value !== 'erp_table' || erpTableEnabled);
      if (!needle || normalizeSearchText(group.group).includes(needle)) return { ...group, options };
      return {
        ...group,
        options: options.filter((option) => normalizeSearchText(option.label).includes(needle)),
      };
    })
    .filter((group) => group.options.length > 0);
}
