/**
 * Configuração de um campo "Tabela dinâmica do ERP" (`settingsJson` do campo). Contrato em
 * Docs/campo_tabela_dinamica_erp_implantacao.md (§3, com as revisões de 2026-10-08).
 *
 * As colunas do ERP (`sourceColumns`) são só leitura e vêm da tabela declarada na API
 * erp-lookup; as colunas preenchíveis (`inputColumns`) pertencem só ao formulário.
 */
export type ErpTableSourceColumnType = 'text' | 'number' | 'currency' | 'date' | 'boolean';
export type ErpTableInputColumnType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'checkbox';

export interface ErpTableParameterBinding {
  /** Nome do parâmetro na tabela do erp-lookup (ex.: `pedidoId`). */
  parameter: string;
  /** Campo do formulário de onde sai o valor (ex.: a Lista do ERP `pedido`). */
  fieldCode: string;
}

export interface ErpTableSourceColumn {
  key: string;
  label: string;
  type: ErpTableSourceColumnType;
}

export interface ErpTableInputColumn {
  id: string;
  label: string;
  type: ErpTableInputColumnType;
  required: boolean;
  min: number | null;
  max: number | null;
  decimals: number | null;
  maxLength: number | null;
  options: string[];
  helpText: string | null;
  defaultValue: string | number | boolean | null;
}

export interface ErpTableSettings {
  erpConnectorId: string;
  fonte: string;
  dataset: string;
  parameterBindings: ErpTableParameterBinding[];
  sourceColumns: ErpTableSourceColumn[];
  inputColumns: ErpTableInputColumn[];
  maxRows: number;
  exigirLogin: boolean;
}

export const ERP_TABLE_MAX_ROWS = 500;
export const ERP_TABLE_MAX_SOURCE_COLUMNS = 20;
export const ERP_TABLE_MAX_INPUT_COLUMNS = 10;
export const ERP_TABLE_MAX_TEXT = 1000;
export const ERP_TABLE_MAX_ROW_KEY = 180;
const MAX_OPTIONS = 50;
const MAX_LABEL = 120;
const MAX_HELP = 300;
const MAX_DECIMALS = 6;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ID de coluna preenchível: vira chave de JSON e cabeçalho de exportação. */
const COLUMN_ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SOURCE_TYPES = new Set<ErpTableSourceColumnType>([
  'text',
  'number',
  'currency',
  'date',
  'boolean',
]);
const INPUT_TYPES = new Set<ErpTableInputColumnType>([
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'select',
  'checkbox',
]);

type Raw = Record<string, unknown>;

const asObject = (raw: unknown): Raw =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Raw) : {};
const asString = (raw: unknown, max: number): string =>
  typeof raw === 'string' ? raw.trim().slice(0, max) : '';
const asNumber = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

/**
 * Lê a configuração aplicando padrões e descartando o que não é reconhecível. `null` quando falta
 * o essencial (conector, lista ou tabela) — campo ainda em montagem, ou configuração quebrada.
 * As regras que só fazem sentido na publicação estão em `listErpTableSettingsProblems`.
 */
export function parseErpTableSettings(raw: unknown): ErpTableSettings | null {
  const settings = asObject(raw);
  const erpConnectorId = asString(settings.erpConnectorId, 36);
  const fonte = asString(settings.fonte, 100);
  const dataset = asString(settings.dataset, 100);
  if (!UUID_RE.test(erpConnectorId) || !fonte || !dataset) {
    return null;
  }

  const parameterBindings = (
    Array.isArray(settings.parameterBindings) ? settings.parameterBindings : []
  )
    .map(asObject)
    .map((binding) => ({
      parameter: asString(binding.parameter, 100),
      fieldCode: asString(binding.fieldCode, 100),
    }))
    .filter((binding) => binding.parameter && binding.fieldCode);

  const sourceColumns = (Array.isArray(settings.sourceColumns) ? settings.sourceColumns : [])
    .map(asObject)
    .map((column) => ({
      key: asString(column.key, 100),
      label: asString(column.label, MAX_LABEL),
      type: SOURCE_TYPES.has(column.type as ErpTableSourceColumnType)
        ? (column.type as ErpTableSourceColumnType)
        : 'text',
    }))
    .filter((column) => column.key)
    .map((column) => ({ ...column, label: column.label || column.key }));

  const inputColumns = parseInputColumns(settings.inputColumns);

  const rawMaxRows = asNumber(settings.maxRows);
  const maxRows =
    rawMaxRows !== null && Number.isInteger(rawMaxRows) && rawMaxRows > 0
      ? Math.min(rawMaxRows, ERP_TABLE_MAX_ROWS)
      : ERP_TABLE_MAX_ROWS;

  return {
    erpConnectorId,
    fonte,
    dataset,
    parameterBindings,
    sourceColumns,
    inputColumns,
    maxRows,
    exigirLogin: settings.exigirLogin === true,
  };
}

/** Colunas preenchíveis válidas (as irreconhecíveis somem). Também usado pelo "Pedido de itens". */
export function parseInputColumns(raw: unknown): ErpTableInputColumn[] {
  return (Array.isArray(raw) ? raw : [])
    .map(asObject)
    .map(parseInputColumn)
    .filter((column): column is ErpTableInputColumn => column !== null);
}

function parseInputColumn(column: Raw): ErpTableInputColumn | null {
  const id = asString(column.id, 40);
  const type = column.type as ErpTableInputColumnType;
  if (!id || !INPUT_TYPES.has(type)) return null;

  const decimals = asNumber(column.decimals);
  const maxLength = asNumber(column.maxLength);
  const options =
    type === 'select' && Array.isArray(column.options)
      ? [
          ...new Set(
            column.options
              .map((option) => asString(option, MAX_LABEL))
              .filter((option) => option.length > 0),
          ),
        ].slice(0, MAX_OPTIONS)
      : [];
  const defaultValue =
    typeof column.defaultValue === 'string' ||
    typeof column.defaultValue === 'boolean' ||
    asNumber(column.defaultValue) !== null
      ? (column.defaultValue as string | number | boolean)
      : null;

  return {
    id,
    label: asString(column.label, MAX_LABEL) || id,
    type,
    required: column.required === true,
    min: asNumber(column.min),
    max: asNumber(column.max),
    decimals:
      decimals !== null && Number.isInteger(decimals)
        ? Math.min(Math.max(decimals, 0), MAX_DECIMALS)
        : type === 'currency'
          ? 2
          : null,
    maxLength:
      type === 'text' || type === 'long_text'
        ? Math.min(
            maxLength !== null && Number.isInteger(maxLength) && maxLength > 0
              ? maxLength
              : ERP_TABLE_MAX_TEXT,
            ERP_TABLE_MAX_TEXT,
          )
        : null,
    options,
    helpText: asString(column.helpText, MAX_HELP) || null,
    defaultValue,
  };
}

/**
 * Problemas de configuração que impedem publicar, sem olhar o ERP nem os outros campos
 * (esses ficam no `ErpTableFieldService.assertFieldsReady`). Lista vazia = ok.
 */
export function listErpTableSettingsProblems(raw: unknown): string[] {
  const settings = parseErpTableSettings(raw);
  if (!settings) {
    return ['escolha o conector, a lista e a tabela do ERP'];
  }
  const problems: string[] = [];
  const rawObject = asObject(raw);

  if (settings.sourceColumns.length === 0) {
    problems.push('escolha pelo menos uma coluna do ERP para mostrar');
  }
  if (settings.sourceColumns.length > ERP_TABLE_MAX_SOURCE_COLUMNS) {
    problems.push(`no máximo ${ERP_TABLE_MAX_SOURCE_COLUMNS} colunas do ERP`);
  }
  const sourceKeys = settings.sourceColumns.map((column) => column.key);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    problems.push('há coluna do ERP repetida');
  }
  problems.push(
    ...listInputColumnProblems(settings.inputColumns, rawObject.inputColumns, sourceKeys, 'do ERP'),
  );

  const parameters = settings.parameterBindings.map((binding) => binding.parameter);
  if (new Set(parameters).size !== parameters.length) {
    problems.push('há parâmetro associado a mais de um campo');
  }
  return problems;
}

/**
 * Problemas das colunas preenchíveis: limite, identificador, opções da seleção e mínimo/máximo.
 * `reservedKeys` são as chaves das colunas somente leitura (`sourceName` entra na mensagem).
 */
export function listInputColumnProblems(
  columns: ErpTableInputColumn[],
  rawColumns: unknown,
  reservedKeys: string[],
  sourceName: string,
): string[] {
  const problems: string[] = [];
  if (columns.length > ERP_TABLE_MAX_INPUT_COLUMNS) {
    problems.push(`no máximo ${ERP_TABLE_MAX_INPUT_COLUMNS} colunas preenchíveis`);
  }
  const rawInputs = Array.isArray(rawColumns) ? rawColumns : [];
  if (rawInputs.length !== columns.length) {
    problems.push('há coluna preenchível sem identificador ou com tipo desconhecido');
  }
  const inputIds = columns.map((column) => column.id);
  if (new Set(inputIds).size !== inputIds.length) {
    problems.push('há colunas preenchíveis com o mesmo identificador');
  }
  if (inputIds.some((id) => reservedKeys.includes(id))) {
    problems.push(
      `coluna preenchível não pode ter o mesmo identificador de uma coluna ${sourceName}`,
    );
  }

  for (const column of columns) {
    if (!COLUMN_ID_RE.test(column.id)) {
      problems.push(
        `o identificador "${column.id}" deve começar com letra e ter só letras, números e _`,
      );
    }
    if (column.type === 'select' && column.options.length === 0) {
      problems.push(`a coluna "${column.label}" precisa de opções`);
    }
    if (column.min !== null && column.max !== null && column.min > column.max) {
      problems.push(`na coluna "${column.label}", o mínimo é maior que o máximo`);
    }
  }
  return problems;
}

/**
 * O que o formulário público recebe: colunas a exibir, colunas preenchíveis com as regras de
 * validação e os campos de que a tabela depende. Conector, lista, tabela e nomes de parâmetro
 * ficam no servidor.
 */
export function toPublicErpTableSettings(raw: unknown): Record<string, unknown> {
  const settings = parseErpTableSettings(raw);
  return {
    dependsOn: [...new Set(settings?.parameterBindings.map((b) => b.fieldCode) ?? [])],
    sourceColumns: settings?.sourceColumns ?? [],
    inputColumns: settings?.inputColumns ?? [],
    maxRows: settings?.maxRows ?? ERP_TABLE_MAX_ROWS,
    exigirLogin: settings?.exigirLogin ?? false,
  };
}
