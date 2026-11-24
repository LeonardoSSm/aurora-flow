import {
  type ErpTableInputColumn,
  type ErpTableSourceColumn,
  type ErpTableSourceColumnType,
  listInputColumnProblems,
  parseInputColumns,
} from '../integrations/erp/lookup/erp-table.settings';
import {
  buildErpTableSummary,
  type ErpCellValue,
  formatErpCell,
  validateCell,
} from '../integrations/erp/lookup/erp-table.snapshot';
import type { ItemListColumn, ItemListValues } from './item-list-columns';

/*
 * Campo "Pedido de itens" (`item_order`): quem preenche pesquisa itens de uma lista de itens, adiciona
 * os que quer e preenche as colunas do formulário em cada um (ex.: Quantidade) — como um pedido de
 * venda. Quem monta escolhe quais colunas da lista aparecem, como na "Tabela dinâmica do ERP", e o
 * que fica gravado tem o mesmo formato do retrato dela (`columns` + `rows`), então a tela de
 * respostas, a exportação e os fluxos leem igual.
 */

export const ITEM_ORDER_MAX_ROWS = 500;
export const ITEM_ORDER_MAX_ITEM_COLUMNS = 20;
/** Colunas fixas de todo item; as demais são as colunas próprias da lista, pelo id. */
export const ITEM_NAME_COLUMN = 'name';
export const ITEM_CODE_COLUMN = 'code';
/**
 * Subtotal (preço × quantidade) quando o total está ligado: no retrato entra como a última coluna
 * de respostas, depois das preenchidas, com o valor calculado aqui.
 */
export const ITEM_SUBTOTAL_COLUMN = '__subtotal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ItemOrderSettings {
  itemListId: string;
  /** Colunas da lista mostradas em cada item, além do nome (sempre o primeiro), na ordem. */
  itemColumns: string[];
  inputColumns: ErpTableInputColumn[];
  /** Total do pedido: coluna da lista com o preço × coluna preenchida com a quantidade. */
  totalPriceColumn: string | null;
  totalQuantityColumn: string | null;
}

/** O que o serviço carrega da lista para montar o campo. */
export interface ItemOrderList {
  id: string;
  name: string;
  columns: ItemListColumn[];
  items: Array<{
    id: string;
    code: string | null;
    name: string;
    isActive: boolean;
    valuesJson: ItemListValues;
  }>;
}

/** Linha como o navegador recebe: chave = id do item, valores das colunas mostradas. */
export interface ItemOrderItemRow {
  key: string;
  values: Record<string, ErpCellValue>;
}

/** O que o navegador manda no envio: os itens adicionados e o que foi preenchido em cada um. */
export interface ItemOrderSubmission {
  rows: Array<{ key: string; answers: Record<string, unknown> }>;
}

/** O que fica gravado em `value_json` (mesmo formato do retrato da tabela do ERP). */
export interface ItemOrderAnswer {
  schemaVersion: 1;
  source: { kind: 'item_list'; itemListId: string; listName: string };
  columns: {
    source: Array<Pick<ErpTableSourceColumn, 'key' | 'label' | 'type'>>;
    input: Array<Pick<ErpTableInputColumn, 'id' | 'label' | 'type' | 'decimals'>>;
  };
  rows: Array<{
    key: string;
    sourceValues: Record<string, ErpCellValue>;
    answers: Record<string, ErpCellValue>;
  }>;
  /** Soma dos subtotais; `null` sem total configurado. */
  total: number | null;
}

type Raw = Record<string, unknown>;
const asObject = (raw: unknown): Raw =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Raw) : {};
const asKey = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().slice(0, 100) : '');

/** `null` sem lista escolhida — campo ainda em montagem. */
export function parseItemOrderSettings(raw: unknown): ItemOrderSettings | null {
  const settings = asObject(raw);
  const itemListId = asKey(settings.itemListId);
  if (!UUID_RE.test(itemListId)) return null;
  const itemColumns = [
    ...new Set(
      (Array.isArray(settings.itemColumns) ? settings.itemColumns : [])
        .map(asKey)
        .filter((key) => key && key !== ITEM_NAME_COLUMN && key !== ITEM_SUBTOTAL_COLUMN),
    ),
  ];
  return {
    itemListId,
    itemColumns,
    inputColumns: parseInputColumns(settings.inputColumns),
    totalPriceColumn: asKey(settings.totalPriceColumn) || null,
    totalQuantityColumn: asKey(settings.totalQuantityColumn) || null,
  };
}

const LIST_TYPE_TO_SOURCE: Record<ItemListColumn['type'], ErpTableSourceColumnType> = {
  text: 'text',
  url: 'text',
  select: 'text',
  number: 'number',
  currency: 'currency',
  date: 'date',
  checkbox: 'boolean',
};

const isNumeric = (type: string): boolean => type === 'number' || type === 'currency';

/**
 * Colunas somente leitura do campo, já com nome e tipo atuais da lista: "Item" primeiro e as
 * escolhidas na ordem. Coluna que saiu da lista some.
 */
export function resolveItemColumns(
  settings: ItemOrderSettings,
  listColumns: ItemListColumn[],
): ErpTableSourceColumn[] {
  const byId = new Map(listColumns.map((column) => [column.id, column]));
  const columns: ErpTableSourceColumn[] = [{ key: ITEM_NAME_COLUMN, label: 'Item', type: 'text' }];
  for (const key of settings.itemColumns) {
    if (key === ITEM_CODE_COLUMN) {
      columns.push({ key, label: 'Código', type: 'text' });
      continue;
    }
    const column = byId.get(key);
    if (column) columns.push({ key, label: column.name, type: LIST_TYPE_TO_SOURCE[column.type] });
  }
  return columns;
}

function resolveTotal(
  settings: ItemOrderSettings,
  columns: ErpTableSourceColumn[],
): {
  price: ErpTableSourceColumn & { type: 'number' | 'currency' };
  quantity: ErpTableInputColumn;
} | null {
  const price = columns.find((column) => column.key === settings.totalPriceColumn);
  const quantity = settings.inputColumns.find(
    (column) => column.id === settings.totalQuantityColumn,
  );
  if (!price || !quantity || !isNumeric(price.type) || !isNumeric(quantity.type)) return null;
  return { price: price as ErpTableSourceColumn & { type: 'number' | 'currency' }, quantity };
}

/** Valor de uma coluna para um item (seleção vira o nome da opção; sim/não vira booleano). */
function cellValue(
  item: ItemOrderList['items'][number],
  key: string,
  listColumns: Map<string, ItemListColumn>,
): ErpCellValue {
  if (key === ITEM_NAME_COLUMN) return item.name;
  if (key === ITEM_CODE_COLUMN) return item.code;
  const column = listColumns.get(key);
  const raw = item.valuesJson?.[key];
  if (!column) return null;
  if (column.type === 'checkbox') return raw === true;
  if (raw === undefined || raw === null || raw === '') return null;
  if (column.type === 'select') {
    return column.options?.find((option) => option.id === raw)?.label ?? null;
  }
  return raw;
}

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Itens ativos, como o formulário público mostra. */
export function buildItemRows(
  settings: ItemOrderSettings,
  list: ItemOrderList,
): ItemOrderItemRow[] {
  const columns = resolveItemColumns(settings, list.columns);
  const listColumns = new Map(list.columns.map((column) => [column.id, column]));
  return list.items
    .filter((item) => item.isActive)
    .map((item) => ({
      key: item.id,
      values: Object.fromEntries(
        columns.map((column) => [column.key, cellValue(item, column.key, listColumns)]),
      ),
    }));
}

/**
 * Problemas que impedem publicar. `list` = a lista carregada (`null` quando não existe mais);
 * `undefined` quando nem há lista escolhida.
 */
export function listItemOrderSettingsProblems(
  raw: unknown,
  list: ItemOrderList | null | undefined,
): string[] {
  const settings = parseItemOrderSettings(raw);
  if (!settings) return ['escolha a lista de itens'];
  if (!list) return ['a lista de itens escolhida não existe mais'];

  const problems: string[] = [];
  if (settings.itemColumns.length > ITEM_ORDER_MAX_ITEM_COLUMNS) {
    problems.push(`no máximo ${ITEM_ORDER_MAX_ITEM_COLUMNS} colunas da lista`);
  }
  if (!list.items.some((item) => item.isActive)) {
    problems.push('a lista não tem itens ativos');
  }
  if (settings.inputColumns.length === 0) {
    problems.push('adicione pelo menos uma coluna para preencher (ex.: Quantidade)');
  }
  const reserved = [
    ITEM_NAME_COLUMN,
    ITEM_CODE_COLUMN,
    ITEM_SUBTOTAL_COLUMN,
    ...list.columns.map((column) => column.id),
  ];
  problems.push(
    ...listInputColumnProblems(
      settings.inputColumns,
      asObject(raw).inputColumns,
      reserved,
      'da lista',
    ),
  );

  if (settings.totalPriceColumn || settings.totalQuantityColumn) {
    const columns = resolveItemColumns(settings, list.columns);
    const price = columns.find((column) => column.key === settings.totalPriceColumn);
    const quantity = settings.inputColumns.find(
      (column) => column.id === settings.totalQuantityColumn,
    );
    if (!price || !isNumeric(price.type)) {
      problems.push('para o total, escolha uma coluna de número ou valor da lista que apareça');
    }
    if (!quantity || !isNumeric(quantity.type)) {
      problems.push('para o total, escolha uma coluna preenchida de número ou valor');
    }
  }
  return problems;
}

/**
 * O que o formulário público recebe: colunas a mostrar, colunas a preencher, os itens ativos para
 * pesquisar e, com total, quais colunas multiplicar. A lista em si (id) não sai do servidor.
 */
export function toPublicItemOrderSettings(
  raw: unknown,
  list: ItemOrderList | null | undefined,
): Record<string, unknown> {
  const settings = parseItemOrderSettings(raw);
  if (!settings || !list) {
    return { sourceColumns: [], inputColumns: settings?.inputColumns ?? [], items: [] };
  }
  const sourceColumns = resolveItemColumns(settings, list.columns);
  const total = resolveTotal(settings, sourceColumns);
  return {
    sourceColumns,
    inputColumns: settings.inputColumns,
    items: buildItemRows(settings, list),
    total: total
      ? {
          priceColumn: total.price.key,
          quantityColumn: total.quantity.id,
          type: total.price.type,
        }
      : null,
  };
}

/** Lê o `valueJson` do envio sem confiar em nada além do formato. `null` = formato inválido. */
export function readItemOrderSubmission(valueJson: unknown): ItemOrderSubmission | null {
  if (!valueJson || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const { rows } = valueJson as { rows?: unknown };
  if (!Array.isArray(rows)) return null;
  const parsed: ItemOrderSubmission['rows'] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const { key, answers } = row as { key?: unknown; answers?: unknown };
    if (typeof key !== 'string' || key.length === 0 || key.length > 100) return null;
    if (
      answers !== undefined &&
      (!answers || typeof answers !== 'object' || Array.isArray(answers))
    ) {
      return null;
    }
    parsed.push({ key, answers: (answers ?? {}) as Record<string, unknown> });
  }
  return { rows: parsed };
}

/**
 * Cruza os itens enviados com a lista como ela está agora: item precisa existir e estar ativo, sem
 * repetir; cada célula passa pelas mesmas regras da tabela do ERP. Os valores das colunas da lista
 * (e o subtotal) saem daqui, nunca do navegador.
 */
export function buildItemOrderAnswer(
  settings: ItemOrderSettings,
  list: ItemOrderList,
  submitted: ItemOrderSubmission,
): { answer: ItemOrderAnswer; errors: string[] } {
  const errors: string[] = [];
  const sourceColumns = resolveItemColumns(settings, list.columns);
  const total = resolveTotal(settings, sourceColumns);
  const itemById = new Map(list.items.map((item) => [item.id, item]));
  const listColumns = new Map(list.columns.map((column) => [column.id, column]));
  const inputIds = new Set(settings.inputColumns.map((column) => column.id));
  const seen = new Set<string>();
  let sum = 0;

  const rows: ItemOrderAnswer['rows'] = [];
  submitted.rows.forEach((row, index) => {
    const item = itemById.get(row.key);
    if (!item?.isActive) {
      errors.push(
        item
          ? `O item "${item.name}" não está mais disponível. Remova-o e envie de novo.`
          : `O item ${index + 1} não existe mais na lista. Remova-o e envie de novo.`,
      );
      return;
    }
    if (seen.has(item.id)) {
      errors.push(`O item "${item.name}" foi adicionado duas vezes.`);
      return;
    }
    seen.add(item.id);

    const unknown = Object.keys(row.answers).filter((id) => !inputIds.has(id));
    if (unknown.length > 0) {
      errors.push(`${item.name}: coluna desconhecida (${unknown.join(', ')}).`);
    }
    const answers: Record<string, ErpCellValue> = {};
    for (const column of settings.inputColumns) {
      const result = validateCell(column, row.answers[column.id]);
      if ('error' in result) {
        errors.push(`${item.name}: ${column.label} — ${result.error}`);
        answers[column.id] = null;
      } else {
        answers[column.id] = result.value;
      }
    }

    const sourceValues: Record<string, ErpCellValue> = {};
    for (const column of sourceColumns) {
      sourceValues[column.key] = cellValue(item, column.key, listColumns);
    }
    if (total) {
      const price = sourceValues[total.price.key];
      const quantity = answers[total.quantity.id];
      const subtotal =
        typeof price === 'number' && typeof quantity === 'number' ? round(price * quantity) : null;
      answers[ITEM_SUBTOTAL_COLUMN] = subtotal;
      if (subtotal !== null) sum += subtotal;
    }
    rows.push({ key: item.id, sourceValues, answers });
  });

  return {
    answer: {
      schemaVersion: 1,
      source: { kind: 'item_list', itemListId: list.id, listName: list.name },
      columns: {
        source: sourceColumns.map(({ key, label, type }) => ({ key, label, type })),
        input: [
          ...settings.inputColumns.map(({ id, label, type, decimals }) => ({
            id,
            label,
            type,
            decimals,
          })),
          ...(total
            ? [{ id: ITEM_SUBTOTAL_COLUMN, label: 'Subtotal', type: total.price.type, decimals: null }]
            : []),
        ],
      },
      rows,
      total: total ? round(sum) : null,
    },
    errors,
  };
}

/** Texto de `value_text` (exportação, planilha, `{{campo}}`): um item por linha e o total. */
export function buildItemOrderSummary(answer: ItemOrderAnswer): string {
  const summary = buildErpTableSummary(answer);
  if (answer.total === null) return summary;
  const subtotal = answer.columns.input.find((column) => column.id === ITEM_SUBTOTAL_COLUMN);
  return `${summary}\nTotal: ${formatErpCell(answer.total, subtotal?.type ?? 'number')}`;
}
