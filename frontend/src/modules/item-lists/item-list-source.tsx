import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/ui';
import { cn } from '../../lib/cn';
import { getApiErrorMessage } from '../approvals/components/approval-modal-utils';
import {
  fetchItemList,
  itemListKeys,
  useItemListsQuery,
  type ItemListDetail,
} from './item-lists-api';

const PREVIEW_LIMIT = 12;

/**
 * De onde vêm as opções de um campo de seleção: digitadas no próprio campo ou de uma lista de
 * itens salva. Ligado a uma lista, mostra só a prévia — quem muda os itens é a página da lista.
 */
export function ItemListSource({
  listId,
  visibleLabels,
  hiddenCount,
  onLink,
  onUnlink,
  children,
}: {
  listId: string | null;
  /** Rótulos que quem preenche vê (para a prévia). */
  visibleLabels: string[];
  /** Opções guardadas só por causa de respostas antigas (itens desativados ou removidos). */
  hiddenCount: number;
  onLink: (list: ItemListDetail) => void;
  onUnlink: () => void;
  /** Editor das opções digitadas, mostrado quando não há lista. */
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [choosing, setChoosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const fromList = Boolean(listId) || choosing;
  const listsQuery = useItemListsQuery(false);
  const lists = listsQuery.data ?? [];
  const current = lists.find((list) => list.id === listId);

  async function pick(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      const list = await queryClient.fetchQuery({
        queryKey: itemListKeys.detail(id),
        queryFn: () => fetchItemList(id),
        staleTime: 0,
      });
      onLink(list);
      setChoosing(false);
    } catch (error) {
      showToast({
        title: 'Não foi possível carregar a lista',
        description: getApiErrorMessage(error, 'Tente novamente.'),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  const segment = (active: boolean) =>
    cn(
      'h-8 rounded-[6px] px-3 text-xs font-bold transition-colors',
      active
        ? 'bg-bg-surface text-tx-primary shadow-sm'
        : 'text-tx-secondary hover:text-tx-primary',
    );

  return (
    <div className="grid gap-2">
      <div
        role="radiogroup"
        aria-label="Origem das opções"
        className="inline-flex w-fit gap-1 rounded-[8px] bg-bg-hover p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!fromList}
          onClick={() => {
            setChoosing(false);
            if (listId) onUnlink();
          }}
          className={segment(!fromList)}
        >
          Digitar opções
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={fromList}
          onClick={() => setChoosing(true)}
          className={segment(fromList)}
        >
          Usar lista salva
        </button>
      </div>

      {!fromList ? (
        children
      ) : (
        <div className="grid gap-2 rounded-[8px] border border-border-default bg-bg-surface p-3">
          <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
            Lista de itens
            <select
              value={listId ?? ''}
              disabled={loading}
              onChange={(event) => void pick(event.target.value)}
              aria-label="Lista de itens"
              className="h-9 w-full rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">{listsQuery.isLoading ? 'Carregando…' : 'Escolha uma lista'}</option>
              {listId && !current ? <option value={listId}>Lista arquivada</option> : null}
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.itemCount} {list.itemCount === 1 ? 'item' : 'itens'})
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
            <>
              {visibleLabels.length === 0 ? (
                <p className="text-xs font-semibold text-error">
                  Esta lista não tem itens ativos — o campo ficaria sem opções.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Opções vindas da lista">
                  {visibleLabels.slice(0, PREVIEW_LIMIT).map((label, index) => (
                    <li
                      key={`${label}-${index}`}
                      className="rounded-full bg-bg-hover px-2.5 py-1 text-xs font-semibold text-tx-primary"
                    >
                      {label}
                    </li>
                  ))}
                  {visibleLabels.length > PREVIEW_LIMIT ? (
                    <li className="rounded-full px-2 py-1 text-xs font-semibold text-tx-muted">
                      +{visibleLabels.length - PREVIEW_LIMIT}
                    </li>
                  ) : null}
                </ul>
              )}
              <p className="text-xs text-tx-muted">
                {visibleLabels.length} {visibleLabels.length === 1 ? 'opção' : 'opções'} da lista.
                Para mudar, edite a lista — vale para todos os campos que a usam.
                {hiddenCount > 0
                  ? ` ${hiddenCount} item(ns) fora da lista ficam guardados só para respostas antigas.`
                  : ''}
                <a
                  href={`/listas-de-itens/${listId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex items-center gap-1 font-bold text-primary dark:text-blue-300"
                >
                  Abrir a lista <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
