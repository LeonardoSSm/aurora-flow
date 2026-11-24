import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Plus } from 'lucide-react';
import type { ErpTableInputColumn, FieldSettings } from '../../forms/types';
import {
  fetchItemList,
  itemListKeys,
  useItemListsQuery,
  type ItemListColumnType,
} from '../../item-lists/item-lists-api';
import { columnIdFromLabel, InputColumnEditor, MAX_INPUT_COLUMNS } from './erp-table-settings-editor';

const labelCls = 'grid gap-2 text-xs font-semibold text-tx-secondary';
const inputCls =
  'h-9 w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60';
const smallButtonCls =
  'inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-xs font-semibold text-tx-primary hover:bg-bg-hover disabled:opacity-50';
const iconButtonCls =
  'grid h-7 w-7 place-items-center rounded-md text-tx-secondary hover:bg-bg-hover disabled:opacity-30';
const sectionTitleCls = 'text-xs font-bold uppercase tracking-wide text-tx-secondary';
const warnCls = 'text-xs font-semibold text-amber-700 dark:text-amber-400';

/** Mesmo limite do backend (`ITEM_ORDER_MAX_ITEM_COLUMNS`). */
const MAX_ITEM_COLUMNS = 20;
const CODE_COLUMN = 'code';

type ItemColumnChoice = { key: string; label: string; numeric: boolean };

const isNumericListType = (type: ItemListColumnType) => type === 'number' || type === 'currency';
const isNumericInput = (column: ErpTableInputColumn) =>
  column.type === 'number' || column.type === 'currency';

/**
 * Configuração de um "Pedido de itens": de qual lista vêm os itens, quais colunas da lista
 * aparecem (como na Tabela dinâmica do ERP), o que a pessoa preenche em cada item e, se quiser,
 * o total (preço da lista × quantidade). O nome do item aparece sempre, primeiro.
 */
export function ItemOrderSettingsEditor({
  settings,
  onChange,
}: {
  settings: FieldSettings;
  onChange: (next: FieldSettings) => void;
}) {
  const listId = settings.itemListId ?? '';
  const itemColumns = settings.itemColumns ?? [];
  const inputColumns = settings.inputColumns ?? [];
  const listsQuery = useItemListsQuery(false);
  const listQuery = useQuery({
    queryKey: itemListKeys.detail(listId || null),
    queryFn: () => fetchItemList(listId),
    enabled: listId.length > 0,
    staleTime: 30_000,
  });
  const list = listQuery.data;
  const lists = listsQuery.data ?? [];

  const choices: ItemColumnChoice[] = [
    { key: CODE_COLUMN, label: 'Código', numeric: false },
    ...(list?.columns ?? []).map((column) => ({
      key: column.id,
      label: column.name,
      numeric: isNumericListType(column.type),
    })),
  ];
  const choiceByKey = new Map(choices.map((choice) => [choice.key, choice]));
  // Coluna escolhida que saiu da lista some daqui e do formulário público (o backend ignora).
  const shownColumns = list ? itemColumns.filter((key) => choiceByKey.has(key)) : itemColumns;
  const activeItems = list?.items.filter((item) => item.isActive).length ?? 0;
  const totalOn = Boolean(settings.totalPriceColumn || settings.totalQuantityColumn);
  const priceChoices = choices.filter((choice) => choice.numeric);
  const quantityChoices = inputColumns.filter(isNumericInput);

  function update(patch: Partial<FieldSettings>) {
    onChange({ ...settings, ...patch });
  }

  function selectList(id: string) {
    // Lista nova: as colunas dela são outras; as colunas preenchidas ficam.
    update({
      itemListId: id || undefined,
      itemColumns: [],
      totalPriceColumn: undefined,
      totalQuantityColumn: settings.totalQuantityColumn,
    });
  }

  function toggleColumn(key: string, checked: boolean) {
    update({
      itemColumns: checked ? [...itemColumns, key] : itemColumns.filter((item) => item !== key),
      // Sem a coluna do preço na tela, o total não tem de onde vir.
      ...(!checked && key === settings.totalPriceColumn ? { totalPriceColumn: undefined } : {}),
    });
  }

  function moveColumn(index: number, delta: number) {
    const next = [...shownColumns];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    update({ itemColumns: next });
  }

  function setPriceColumn(key: string) {
    update({
      totalPriceColumn: key || undefined,
      itemColumns: key && !itemColumns.includes(key) ? [...itemColumns, key] : itemColumns,
    });
  }

  function toggleTotal(checked: boolean) {
    update(
      checked
        ? {
            totalPriceColumn: priceChoices.find((choice) => shownColumns.includes(choice.key))?.key,
            totalQuantityColumn: quantityChoices[0]?.id,
          }
        : { totalPriceColumn: undefined, totalQuantityColumn: undefined },
    );
  }

  function updateInputColumn(index: number, patch: Partial<ErpTableInputColumn>) {
    update({
      inputColumns: inputColumns.map((column, i) => (i === index ? { ...column, ...patch } : column)),
    });
  }

  function addInputColumn() {
    const taken = new Set([...inputColumns.map((column) => column.id), ...choices.map((c) => c.key)]);
    update({
      inputColumns: [
        ...inputColumns,
        { id: columnIdFromLabel('Nova coluna', taken), label: 'Nova coluna', type: 'text', required: false },
      ],
    });
  }

  function removeInputColumn(index: number) {
    const removed = inputColumns[index];
    update({
      inputColumns: inputColumns.filter((_, i) => i !== index),
      ...(removed?.id === settings.totalQuantityColumn ? { totalQuantityColumn: undefined } : {}),
    });
  }

  const current = lists.find((item) => item.id === listId);

  return (
    <div className="grid gap-4">
      <label className={labelCls}>
        Lista de itens
        <select
          value={listId}
          onChange={(event) => selectList(event.target.value)}
          className={inputCls}
          aria-label="Lista de itens"
        >
          <option value="">{listsQuery.isLoading ? 'Carregando…' : 'Escolha uma lista'}</option>
          {listId && !current ? <option value={listId}>{list?.name ?? 'Lista arquivada'}</option> : null}
          {lists.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.itemCount} {item.itemCount === 1 ? 'item' : 'itens'})
            </option>
          ))}
        </select>
      </label>

      {!listsQuery.isLoading && lists.length === 0 && !listId ? (
        <p className="text-xs text-tx-muted">
          Nenhuma lista salva ainda.{' '}
          <a
            href="/listas-de-itens/nova"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary dark:text-blue-300"
          >
            Criar uma lista
          </a>
        </p>
      ) : null}

      {listId ? (
        <p className="text-xs text-tx-muted">
          {list
            ? `Quem preencher pesquisa entre os ${activeItems} ${activeItems === 1 ? 'item ativo' : 'itens ativos'} da lista e adiciona os que quiser.`
            : listQuery.isError
              ? 'Não foi possível carregar a lista.'
              : 'Carregando a lista…'}
          <a
            href={`/listas-de-itens/${listId}`}
            target="_blank"
            rel="noreferrer"
            className="ml-1 inline-flex items-center gap-1 font-bold text-primary dark:text-blue-300"
          >
            Abrir a lista <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      ) : null}
      {list && activeItems === 0 ? (
        <p className="text-xs font-semibold text-error">Esta lista não tem itens ativos.</p>
      ) : null}

      {list ? (
        <section className="grid gap-2">
          <p className={sectionTitleCls}>Colunas da lista (somente leitura)</p>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-tx-primary">
              <input type="checkbox" checked disabled />
              Item (nome)
            </label>
            {choices.map((choice) => {
              const checked = shownColumns.includes(choice.key);
              return (
                <label key={choice.key} className="flex items-center gap-2 text-sm text-tx-primary">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && shownColumns.length >= MAX_ITEM_COLUMNS}
                    onChange={(event) => toggleColumn(choice.key, event.target.checked)}
                  />
                  {choice.label}
                </label>
              );
            })}
          </div>
          {shownColumns.length > 1 ? (
            <ol className="grid gap-1" aria-label="Ordem das colunas da lista">
              {shownColumns.map((key, index) => (
                <li
                  key={key}
                  className="flex items-center justify-between rounded-[8px] bg-bg-hover px-3 py-1 text-sm text-tx-primary"
                >
                  <span>
                    {index + 2}. {choiceByKey.get(key)?.label ?? key}
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className={iconButtonCls}
                      disabled={index === 0}
                      aria-label={`Mover ${choiceByKey.get(key)?.label ?? key} para cima`}
                      onClick={() => moveColumn(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={iconButtonCls}
                      disabled={index === shownColumns.length - 1}
                      aria-label={`Mover ${choiceByKey.get(key)?.label ?? key} para baixo`}
                      onClick={() => moveColumn(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className={sectionTitleCls}>Colunas preenchidas em cada item</p>
          <button
            type="button"
            className={smallButtonCls}
            disabled={inputColumns.length >= MAX_INPUT_COLUMNS}
            onClick={addInputColumn}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar coluna
          </button>
        </div>
        <p className="text-xs text-tx-muted">
          Use “Mínimo” para a quantidade mínima de cada item e “Obrigatória” para não deixar em branco.
        </p>
        {inputColumns.map((column, index) => (
          <InputColumnEditor
            key={index}
            column={column}
            onChange={(patch) => updateInputColumn(index, patch)}
            onRemove={() => removeInputColumn(index)}
          />
        ))}
        {inputColumns.length === 0 ? (
          <p className={warnCls}>Adicione pelo menos uma coluna para preencher (ex.: Quantidade).</p>
        ) : null}
      </section>

      <section className="grid gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-tx-primary">
          <input
            type="checkbox"
            checked={totalOn}
            disabled={!list}
            onChange={(event) => toggleTotal(event.target.checked)}
          />
          Mostrar subtotal por item e total do pedido
        </label>
        {totalOn ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelCls}>
              Preço (coluna da lista)
              <select
                value={settings.totalPriceColumn ?? ''}
                onChange={(event) => setPriceColumn(event.target.value)}
                className={inputCls}
              >
                <option value="">
                  {priceChoices.length === 0 ? 'A lista não tem coluna de número ou valor' : 'Escolha a coluna'}
                </option>
                {priceChoices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Quantidade (coluna preenchida)
              <select
                value={settings.totalQuantityColumn ?? ''}
                onChange={(event) => update({ totalQuantityColumn: event.target.value || undefined })}
                className={inputCls}
              >
                <option value="">
                  {quantityChoices.length === 0 ? 'Nenhuma coluna de número' : 'Escolha a coluna'}
                </option>
                {quantityChoices.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            {!settings.totalPriceColumn || !settings.totalQuantityColumn ? (
              <p className={`${warnCls} md:col-span-2`}>
                Escolha as duas colunas para o total aparecer.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
