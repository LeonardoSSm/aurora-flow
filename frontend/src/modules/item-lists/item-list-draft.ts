import {
  columnsIssue,
  columnsToSave,
  pastedCell,
  valuesIssue,
  valuesToSave,
  valueToCell,
  type DraftValues,
} from './item-list-columns';
import type { ItemListColumn, ItemListDetail, SaveItemListInput } from './item-lists-api';

export type DraftListItem = {
  /** Chave local da linha na tela. */
  key: string;
  /** Item já salvo — manter o id mantém as respostas apontando para ele. */
  id?: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Célula de cada coluna própria, pelo id da coluna. */
  values: DraftValues;
};

export type ListDraft = {
  name: string;
  description: string;
  columns: ItemListColumn[];
  items: DraftListItem[];
};

let localSeq = 0;
export function localKey(): string {
  localSeq += 1;
  return `local-${Date.now().toString(36)}-${localSeq}`;
}

export function emptyListDraft(): ListDraft {
  return { name: '', description: '', columns: [], items: [] };
}

export function listToDraft(list: ItemListDetail): ListDraft {
  const columns = list.columns ?? [];
  return {
    name: list.name,
    description: list.description ?? '',
    columns,
    items: list.items.map((item) => ({
      key: item.id,
      id: item.id,
      code: item.code ?? '',
      name: item.name,
      isActive: item.isActive !== false,
      values: Object.fromEntries(
        columns.map((column) => [column.id, valueToCell(column, item.values?.[column.id])]),
      ),
    })),
  };
}

const sameName = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

/** Primeiro problema que impede salvar; null quando dá para salvar. */
export function listDraftIssue(draft: ListDraft): string | null {
  if (!draft.name.trim()) return 'Dê um nome à lista.';
  const filled = draft.items.filter((item) => item.name.trim() || item.code.trim());
  if (filled.some((item) => !item.name.trim())) return 'Todo item precisa de nome.';
  const names = filled.map((item) => sameName(item.name));
  const repeatedName = filled.find((_, index) => names.indexOf(names[index]) !== index);
  if (repeatedName) return `Dois itens com o nome "${repeatedName.name.trim()}".`;
  const codes = filled.map((item) => item.code.trim()).filter(Boolean);
  const repeatedCode = codes.find((code, index) => codes.indexOf(code) !== index);
  if (repeatedCode) return `Dois itens com o código "${repeatedCode}".`;
  const columnIssue = columnsIssue(draft.columns);
  if (columnIssue) return columnIssue;
  for (const item of filled) {
    const valueIssue = valuesIssue(draft.columns, item.values, item.name);
    if (valueIssue) return valueIssue;
  }
  return null;
}

export function draftToSave(draft: ListDraft): SaveItemListInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    columns: columnsToSave(draft.columns),
    items: draft.items
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        code: item.code.trim() || null,
        name: item.name.trim(),
        isActive: item.isActive,
        values: valuesToSave(draft.columns, item.values),
      })),
  };
}

/**
 * "Colar da planilha": um item por linha. Com duas colunas (tabulação, que é o que o Excel copia,
 * ou ponto e vírgula), a primeira é o código e a segunda o nome; com uma só, a linha é o nome. Da
 * terceira em diante, as células vão para as colunas próprias da lista, na ordem delas.
 * Nomes que já estão na lista (ou repetidos no que foi colado) são ignorados.
 */
export function parsePastedItems(
  text: string,
  existing: readonly DraftListItem[],
  columns: readonly ItemListColumn[] = [],
): DraftListItem[] {
  const taken = new Set(existing.map((item) => sameName(item.name)));
  const out: DraftListItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.split(';')).map((cell) =>
      cell.trim(),
    );
    const [code, name] = cells.length > 1 ? [cells[0], cells[1]] : ['', cells[0]];
    if (!name || taken.has(sameName(name))) continue;
    taken.add(sameName(name));
    const values: DraftValues = {};
    columns.forEach((column, index) => {
      const cell = cells[index + 2];
      if (cell !== undefined) values[column.id] = pastedCell(column, cell);
    });
    out.push({ key: localKey(), code, name, isActive: true, values });
  }
  return out;
}
