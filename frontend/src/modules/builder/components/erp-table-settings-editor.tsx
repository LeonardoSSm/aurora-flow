import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  type ErpTableDefinition,
  erpLookupKeys,
  erpTableKeys,
  fetchErpLookupConnectors,
  fetchErpLookupSources,
  fetchErpTables,
  getErpTableErrorMessage,
  testErpTable,
} from '../../erp-lookup/erp-lookup-api';
import type {
  ErpTableInputColumn,
  ErpTableInputColumnType,
  ErpTableSourceColumn,
  FieldSettings,
  FormFieldType,
} from '../../forms/types';
import { formatErpTableCell } from '../../public-form/erp-table';

const labelCls = 'grid gap-2 text-xs font-semibold text-tx-secondary';
// `w-full min-w-0`: sem isso o input fica com a largura intrínseca e invade a coluna vizinha
// nos grids de 3-4 colunas do editor de coluna.
const inputCls =
  'h-9 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60';
const smallButtonCls =
  'inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-xs font-semibold text-tx-primary hover:bg-bg-hover disabled:opacity-50';
const iconButtonCls =
  'grid h-7 w-7 place-items-center rounded-md text-tx-secondary hover:bg-bg-hover disabled:opacity-30';

/** Campos que podem alimentar um parâmetro (§2.3): mesma lista do backend. */
export const ERP_TABLE_DEPENDENCY_TYPES: ReadonlySet<FormFieldType> = new Set([
  'erp_lookup',
  'short_text',
  'number',
  'single_select',
]);

export type ErpTableDependencyField = { code: string; label: string; fieldType: FormFieldType };
export type ErpTableParameter = ErpTableDefinition['parameters'][number];

/**
 * "pedidoId" → "Pedido id": rótulo inicial do campo criado para um parâmetro. A pessoa pode
 * renomear depois; a associação acompanha (o reducer troca o código nas associações).
 */
export function parameterFieldLabel(parameter: string): string {
  const words = parameter
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Parâmetro';
}

const INPUT_TYPES: Array<{ value: ErpTableInputColumnType; label: string }> = [
  { value: 'text', label: 'Texto curto' },
  { value: 'long_text', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Valor monetário' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção única' },
  { value: 'checkbox', label: 'Checkbox' },
];

const MAX_SOURCE_COLUMNS = 20;
export const MAX_INPUT_COLUMNS = 10;

/** "Qtd. conferida" → "qtdConferida": identificador estável para a coluna preenchível. */
export function columnIdFromLabel(label: string, taken: Set<string>): string {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base =
    words
      .map((word, index) =>
        index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
      )
      .join('')
      .slice(0, 36) || 'coluna';
  if (!/^[A-Za-z]/.test(base)) base = `c${base}`;
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}${n++}`;
  return id;
}

/**
 * Configuração de um campo "Tabela dinâmica do ERP": de onde vêm as linhas (conector, lista e
 * tabela da API erp-lookup), de quais campos anteriores saem os parâmetros, quais colunas do
 * ERP aparecem e quais colunas a pessoa preenche. Docs/campo_tabela_dinamica_erp_implantacao.md §9.
 */
export function ErpTableSettingsEditor({
  settings,
  dependencyFields,
  onChange,
  onCreateDependencyField,
}: {
  settings: FieldSettings;
  /** Campos antes da tabela que podem ser parâmetro (já filtrados por posição e tipo). */
  dependencyFields: ErpTableDependencyField[];
  onChange: (next: FieldSettings) => void;
  /**
   * Cria, logo antes da tabela, um campo para o parâmetro e já o associa. Sem isso, quem põe a
   * tabela como 1º campo fica sem nada para escolher e só descobre o problema ao publicar.
   */
  onCreateDependencyField?: (parameter: ErpTableParameter) => void;
}) {
  const connectorId = settings.erpConnectorId ?? '';
  const fonte = settings.fonte ?? '';
  const sourceColumns = settings.sourceColumns ?? [];
  const inputColumns = settings.inputColumns ?? [];
  const bindings = settings.parameterBindings ?? [];

  const connectors = useQuery({
    queryKey: erpLookupKeys.connectors(),
    queryFn: fetchErpLookupConnectors,
    staleTime: 60_000,
  });
  const sources = useQuery({
    queryKey: erpLookupKeys.sources(connectorId),
    queryFn: () => fetchErpLookupSources(connectorId),
    enabled: connectorId.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const tables = useQuery({
    queryKey: erpTableKeys.tables(connectorId, fonte),
    queryFn: () => fetchErpTables(connectorId, fonte),
    enabled: connectorId.length > 0 && fonte.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const definition: ErpTableDefinition | undefined = tables.data?.find(
    (table) => table.id === settings.dataset,
  );

  function selectTable(table: ErpTableDefinition | undefined) {
    onChange({
      ...settings,
      dataset: table?.id,
      // Tabela nova: parâmetros e colunas do ERP recomeçam; colunas preenchíveis ficam.
      parameterBindings: [],
      sourceColumns: table ? table.columns.slice(0, Math.min(4, table.columns.length)) : [],
      maxRows: table?.maxRows,
    });
  }

  function setBinding(parameter: string, fieldCode: string) {
    const rest = bindings.filter((binding) => binding.parameter !== parameter);
    onChange({
      ...settings,
      parameterBindings: fieldCode ? [...rest, { parameter, fieldCode }] : rest,
    });
  }

  function toggleSourceColumn(column: ErpTableSourceColumn, checked: boolean) {
    onChange({
      ...settings,
      sourceColumns: checked
        ? [...sourceColumns, column]
        : sourceColumns.filter((item) => item.key !== column.key),
    });
  }

  function moveSourceColumn(index: number, delta: number) {
    const next = [...sourceColumns];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    onChange({ ...settings, sourceColumns: next });
  }

  function updateInputColumn(index: number, patch: Partial<ErpTableInputColumn>) {
    onChange({
      ...settings,
      inputColumns: inputColumns.map((column, i) => (i === index ? { ...column, ...patch } : column)),
    });
  }

  function addInputColumn() {
    const taken = new Set([...inputColumns.map((c) => c.id), ...sourceColumns.map((c) => c.key)]);
    onChange({
      ...settings,
      inputColumns: [
        ...inputColumns,
        { id: columnIdFromLabel('Nova coluna', taken), label: 'Nova coluna', type: 'text', required: false },
      ],
    });
  }

  const tableMissing = !!settings.dataset && !!tables.data && !definition;
  const missingParameters =
    definition?.parameters.filter(
      (parameter) => parameter.required && !bindings.some((b) => b.parameter === parameter.name),
    ) ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className={labelCls}>
          Conector de ERP
          <select
            value={connectorId}
            disabled={connectors.isLoading}
            onChange={(event) =>
              onChange({
                ...settings,
                erpConnectorId: event.target.value || undefined,
                fonte: undefined,
                dataset: undefined,
                parameterBindings: [],
                sourceColumns: [],
              })
            }
            className={inputCls}
          >
            <option value="">{connectors.isLoading ? 'Carregando…' : 'Escolha o conector'}</option>
            {connectors.data?.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelCls}>
          Lista
          <select
            value={fonte}
            disabled={!connectorId || sources.isLoading || sources.isError}
            onChange={(event) =>
              onChange({
                ...settings,
                fonte: event.target.value || undefined,
                dataset: undefined,
                parameterBindings: [],
                sourceColumns: [],
              })
            }
            className={inputCls}
          >
            <option value="">{!connectorId ? 'Escolha o conector primeiro' : 'Escolha a lista'}</option>
            {sources.data?.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelCls}>
          Tabela
          <select
            value={settings.dataset ?? ''}
            disabled={!fonte || tables.isLoading || tables.isError}
            onChange={(event) =>
              selectTable(tables.data?.find((table) => table.id === event.target.value))
            }
            className={inputCls}
          >
            <option value="">
              {!fonte
                ? 'Escolha a lista primeiro'
                : tables.isLoading
                  ? 'Carregando…'
                  : tables.data?.length === 0
                    ? 'Esta lista não tem tabelas'
                    : 'Escolha a tabela'}
            </option>
            {tables.data?.map((table) => (
              <option key={table.id} value={table.id}>
                {table.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sources.isError || tables.isError ? (
        <p className="text-xs font-semibold text-error">
          {getErpTableErrorMessage(sources.error ?? tables.error)}
        </p>
      ) : null}
      {tableMissing ? (
        <p className="text-xs font-semibold text-error">
          A tabela "{settings.dataset}" não existe mais nesta lista. Escolha outra.
        </p>
      ) : null}

      {definition ? (
        <>
          <section className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">Parâmetros</p>
            {definition.parameters.length === 0 ? (
              <p className="text-xs text-tx-secondary">Esta tabela não tem parâmetros.</p>
            ) : null}
            {definition.parameters.map((parameter) => {
              const boundCode = bindings.find((b) => b.parameter === parameter.name)?.fieldCode ?? '';
              // Associação a um campo que saiu da lista (removido, movido para depois da tabela
              // ou com tipo trocado): mostra como está, para a pessoa ver e trocar.
              const staleBinding =
                !!boundCode && !dependencyFields.some((dependency) => dependency.code === boundCode);
              return (
                <div key={parameter.name} className="grid gap-1.5">
                  <label className={labelCls}>
                    <span>
                      {parameter.name}
                      {parameter.required ? <span className="text-error"> *</span> : null}{' '}
                      <span className="font-normal">— valor tirado do campo:</span>
                    </span>
                    <select
                      value={boundCode}
                      onChange={(event) => setBinding(parameter.name, event.target.value)}
                      className={inputCls}
                    >
                      <option value="">
                        {dependencyFields.length === 0
                          ? 'Nenhum campo antes da tabela pode ser usado'
                          : 'Escolha um campo anterior'}
                      </option>
                      {staleBinding ? (
                        <option value={boundCode}>{boundCode} (não está mais antes da tabela)</option>
                      ) : null}
                      {dependencyFields.map((dependency) => (
                        <option key={dependency.code} value={dependency.code}>
                          {dependency.label} ({dependency.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  {onCreateDependencyField && (!boundCode || staleBinding) ? (
                    <button
                      type="button"
                      onClick={() => onCreateDependencyField(parameter)}
                      className={`${smallButtonCls} justify-self-start`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Criar campo "{parameterFieldLabel(parameter.name)}" antes da tabela
                    </button>
                  ) : null}
                </div>
              );
            })}
            {missingParameters.length > 0 ? (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Associe {missingParameters.map((p) => `"${p.name}"`).join(', ')} a um campo antes de
                publicar: é dele que sai o valor da consulta (quem preenche o formulário digita ou
                escolhe ali). Só servem campos de Lista do ERP, texto curto, número ou seleção única
                que vêm antes da tabela
                {dependencyFields.length === 0
                  ? ` — e esta tabela ainda não tem nenhum antes dela. ${
                      onCreateDependencyField
                        ? 'Crie o campo pelo botão acima ou adicione um e mova a tabela para depois dele.'
                        : 'Adicione um e mova a tabela para depois dele.'
                    }`
                  : '.'}
              </p>
            ) : null}
          </section>

          <section className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
              Colunas do ERP (somente leitura)
            </p>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {definition.columns.map((column) => {
                const checked = sourceColumns.some((item) => item.key === column.key);
                return (
                  <label key={column.key} className="flex items-center gap-2 text-sm text-tx-primary">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && sourceColumns.length >= MAX_SOURCE_COLUMNS}
                      onChange={(event) => toggleSourceColumn(column, event.target.checked)}
                    />
                    {column.label}
                  </label>
                );
              })}
            </div>
            {sourceColumns.length > 1 ? (
              <ol className="grid gap-1">
                {sourceColumns.map((column, index) => (
                  <li
                    key={column.key}
                    className="flex items-center justify-between rounded-[8px] bg-bg-hover px-3 py-1 text-sm"
                  >
                    <span>
                      {index + 1}. {column.label}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className={iconButtonCls}
                        disabled={index === 0}
                        aria-label={`Mover ${column.label} para cima`}
                        onClick={() => moveSourceColumn(index, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={iconButtonCls}
                        disabled={index === sourceColumns.length - 1}
                        aria-label={`Mover ${column.label} para baixo`}
                        onClick={() => moveSourceColumn(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {sourceColumns.length === 0 ? (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Escolha pelo menos uma coluna do ERP.
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
            Colunas preenchidas no formulário
          </p>
          <button
            type="button"
            className={smallButtonCls}
            disabled={inputColumns.length >= MAX_INPUT_COLUMNS}
            onClick={addInputColumn}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar coluna
          </button>
        </div>
        {inputColumns.map((column, index) => (
          <InputColumnEditor
            key={index}
            column={column}
            onChange={(patch) => updateInputColumn(index, patch)}
            onRemove={() =>
              onChange({ ...settings, inputColumns: inputColumns.filter((_, i) => i !== index) })
            }
          />
        ))}
      </section>

      <label className="flex items-center gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          checked={settings.exigirLogin === true}
          onChange={(event) => onChange({ ...settings, exigirLogin: event.target.checked })}
        />
        Só carregar a tabela para quem estiver logado
      </label>

      {definition && connectorId && fonte ? (
        <TableTester connectorId={connectorId} fonte={fonte} definition={definition} columns={sourceColumns} />
      ) : null}
    </div>
  );
}

export function InputColumnEditor({
  column,
  onChange,
  onRemove,
}: {
  column: ErpTableInputColumn;
  onChange: (patch: Partial<ErpTableInputColumn>) => void;
  onRemove: () => void;
}) {
  const numeric = column.type === 'number' || column.type === 'currency';
  const textual = column.type === 'text' || column.type === 'long_text';
  const toNumber = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

  return (
    <div className="grid gap-2 rounded-[10px] border border-border-default p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_140px_auto]">
        <label className={labelCls}>
          Rótulo
          <input
            value={column.label}
            maxLength={120}
            onChange={(event) => onChange({ label: event.target.value })}
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Identificador
          <input
            value={column.id}
            maxLength={40}
            onChange={(event) => onChange({ id: event.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Tipo
          <select
            value={column.type}
            onChange={(event) =>
              onChange({
                type: event.target.value as ErpTableInputColumnType,
                decimals: event.target.value === 'currency' ? 2 : null,
              })
            }
            className={inputCls}
          >
            {INPUT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3 pb-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-tx-secondary">
            <input
              type="checkbox"
              checked={column.required === true}
              onChange={(event) => onChange({ required: event.target.checked })}
            />
            Obrigatória
          </label>
          <button type="button" className={iconButtonCls} aria-label={`Remover ${column.label}`} onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {numeric ? (
          <>
            <label className={labelCls}>
              Mínimo
              <input
                type="number"
                value={column.min ?? ''}
                onChange={(event) => onChange({ min: toNumber(event.target.value) })}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Máximo
              <input
                type="number"
                value={column.max ?? ''}
                onChange={(event) => onChange({ max: toNumber(event.target.value) })}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Casas decimais
              <input
                type="number"
                min={0}
                max={6}
                value={column.decimals ?? ''}
                onChange={(event) => onChange({ decimals: toNumber(event.target.value) })}
                className={inputCls}
              />
            </label>
          </>
        ) : null}
        {textual ? (
          <label className={labelCls}>
            Tamanho máximo
            <input
              type="number"
              min={1}
              max={1000}
              value={column.maxLength ?? ''}
              onChange={(event) => onChange({ maxLength: toNumber(event.target.value) })}
              className={inputCls}
            />
          </label>
        ) : null}
        {column.type === 'select' ? (
          <label className={`${labelCls} md:col-span-2`}>
            Opções (uma por linha)
            <textarea
              rows={3}
              value={(column.options ?? []).join('\n')}
              onChange={(event) => onChange({ options: event.target.value.split('\n') })}
              onBlur={(event) =>
                onChange({
                  options: [
                    ...new Set(event.target.value.split('\n').map((option) => option.trim()).filter(Boolean)),
                  ],
                })
              }
              className="rounded-[8px] border border-border-strong bg-bg-surface px-3 py-2 text-sm text-tx-primary outline-none focus:border-primary"
            />
          </label>
        ) : null}
        <label className={`${labelCls} md:col-span-2`}>
          Texto de ajuda
          <input
            value={column.helpText ?? ''}
            maxLength={300}
            onChange={(event) => onChange({ helpText: event.target.value || null })}
            className={inputCls}
          />
        </label>
      </div>
    </div>
  );
}

/** "Testar consulta" (§9 item 10): roda a tabela com valores digitados aqui. */
function TableTester({
  connectorId,
  fonte,
  definition,
  columns,
}: {
  connectorId: string;
  fonte: string;
  definition: ErpTableDefinition;
  columns: ErpTableSourceColumn[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const test = useMutation({
    mutationFn: () => testErpTable(connectorId, fonte, definition.id, values),
  });
  const shown = columns.length > 0 ? columns : definition.columns.slice(0, 4);

  return (
    <section className="grid gap-2 rounded-[10px] bg-bg-s2 p-3 dark:bg-slate-800/50">
      <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">Testar consulta</p>
      <div className="flex flex-wrap items-end gap-2">
        {definition.parameters.map((parameter) => (
          <label key={parameter.name} className={labelCls}>
            {parameter.name}
            <input
              value={values[parameter.name] ?? ''}
              inputMode={parameter.type === 'number' ? 'numeric' : undefined}
              onChange={(event) => setValues({ ...values, [parameter.name]: event.target.value })}
              className={inputCls}
            />
          </label>
        ))}
        <button
          type="button"
          className={smallButtonCls}
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? 'Consultando…' : 'Consultar'}
        </button>
      </div>
      {test.isError ? (
        <p className="text-xs font-semibold text-error">{getErpTableErrorMessage(test.error)}</p>
      ) : null}
      {test.data && !test.data.found ? (
        <p className="text-xs text-tx-secondary">Registro não encontrado no ERP.</p>
      ) : null}
      {test.data?.found ? (
        <div className="grid gap-1">
          <p className="text-xs text-tx-secondary">
            {test.data.totalRows} linha(s)
            {test.data.totalRows > test.data.rows.length ? ` — mostrando ${test.data.rows.length}` : ''}.
          </p>
          {test.data.rows.length > 0 ? (
            <div className="max-h-64 overflow-auto rounded-[8px] border border-border-default">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-bg-surface">
                  <tr>
                    {shown.map((column) => (
                      <th key={column.key} className="px-2 py-1 text-left font-bold text-tx-secondary">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {test.data.rows.map((row) => (
                    <tr key={row.key} className="border-t border-border-default">
                      {shown.map((column) => (
                        <td key={column.key} className="px-2 py-1 text-tx-primary">
                          {formatErpTableCell(row.values[column.key], column.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
