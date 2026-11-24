import { keepPreviousData, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, PanelRightOpen, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  erpLookupKeys,
  fetchErpLookupFieldDetails,
  getErpUnavailableMessage,
  searchErpLookupField,
  type ErpLookupItem,
} from '../../erp-lookup/erp-lookup-api';
import { isErpLookupAnswer } from '../form-runtime';
import type { PublicAnswerValue, PublicFormField } from '../types';
import { ErpDetailsDrawer } from './erp-details-drawer';
import { useErpDetailsDrawer, useErpDetailsSlot } from './erp-details-slot';
import {
  ErpLookupAlerts,
  ErpLookupDetailsCard,
  ErpLookupDetailsLoading,
} from './erp-lookup-details';

const DEBOUNCE_MS = 300;
const DEFAULT_MIN_CHARS = 3;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Comparação sem acento e sem maiúscula, para filtrar a lista curta no navegador. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * "Pedido 3240701 — CLIENTE — EMPRESA" → título "Pedido 3240701" e linha de apoio
 * "CLIENTE · EMPRESA". Sem " — ", o rótulo inteiro é o título.
 */
function splitLabel(label: string): { title: string; subtitle: string | null } {
  const [title, ...rest] = label.split(' — ');
  return rest.length > 0 ? { title, subtitle: rest.join(' · ') } : { title: label, subtitle: null };
}

function describeError(error: unknown): { message: string; needsLogin: boolean } {
  if (getErpUnavailableMessage(error)) {
    return {
      message: 'O banco do ERP está fora do ar no momento. Tente de novo em alguns minutos.',
      needsLogin: false,
    };
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) {
      return { message: 'Entre na sua conta para pesquisar nesta lista.', needsLogin: true };
    }
    if (status === 429) {
      return {
        message: 'Muitas pesquisas seguidas. Espere alguns segundos e tente de novo.',
        needsLogin: false,
      };
    }
    const apiMessage = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (status === 400 && typeof apiMessage === 'string') {
      return { message: apiMessage, needsLogin: false };
    }
  }
  return { message: 'Não foi possível pesquisar agora. Tente de novo.', needsLogin: false };
}

/**
 * Campo "Lista do ERP": pesquisa (ou lista) opções vindas do banco do ERP pelo backend do
 * Tijuca. Sem `formId` (pré-visualização no construtor) só mostra como o campo vai ficar.
 */
export function ErpLookupField({
  field,
  value,
  formId,
  onChange,
  inputStyle,
}: {
  field: PublicFormField;
  value: PublicAnswerValue;
  formId?: string;
  onChange: (value: PublicAnswerValue) => void;
  inputStyle: React.CSSProperties;
}) {
  const selected = isErpLookupAnswer(value) ? value : null;
  const modo = field.settingsJson.modo === 'lista' ? 'lista' : 'pesquisa';
  const minChars =
    typeof field.settingsJson.minCaracteres === 'number'
      ? field.settingsJson.minCaracteres
      : DEFAULT_MIN_CHARS;
  const placeholder =
    field.settingsJson.placeholder?.trim() ||
    (modo === 'lista' ? 'Digite para filtrar a lista' : `Digite ao menos ${minChars} letras para pesquisar`);

  const [text, setText] = useState('');
  const debounced = useDebounced(text.trim(), DEBOUNCE_MS);
  // No modo lista a busca vai sem texto (lista inteira) e o filtro acontece aqui no navegador.
  const q = modo === 'lista' ? '' : debounced;
  const enabled = !!formId && !selected && (modo === 'lista' || q.length >= minChars);

  const query = useQuery({
    queryKey: erpLookupKeys.search(formId ?? '', field.code, q),
    queryFn: () => searchErpLookupField(formId ?? '', field.code, q),
    enabled,
    staleTime: modo === 'lista' ? 5 * 60_000 : 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  // Ficha do item escolhido (ex.: pedido com cliente, itens, valores) para conferir antes de enviar.
  const details = useQuery({
    queryKey: erpLookupKeys.details(formId ?? '', field.code, selected?.value ?? ''),
    queryFn: () => fetchErpLookupFieldDetails(formId ?? '', field.code, selected?.value ?? ''),
    enabled: !!formId && !!selected,
    staleTime: 30_000,
    retry: false,
  });

  // Tela larga no formulário público: a ficha vai para o painel ao lado do formulário.
  const detailsSlot = useErpDetailsSlot();
  // Etapa com tabela larga: a ficha fica numa gaveta, aberta só pelo "Ver ficha".
  const drawerHost = useErpDetailsDrawer();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items: ErpLookupItem[] = useMemo(() => {
    const data = query.data ?? [];
    const filter = text.trim();
    if (modo !== 'lista' || !filter) return data;
    const needle = normalize(filter);
    return data.filter((item) => normalize(item.label).includes(needle));
  }, [query.data, modo, text]);

  if (!formId) {
    return (
      <div className="grid gap-1.5">
        <input disabled placeholder={placeholder} style={{ ...inputStyle, opacity: 0.7 }} />
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          As opções vêm do ERP quando o formulário estiver publicado.
        </small>
      </div>
    );
  }

  if (selected) {
    const { title, subtitle } = splitLabel(selected.label);
    const clear = () => {
      setDrawerOpen(false);
      onChange(null);
      setText('');
    };
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <div
          className="flex items-center gap-2.5"
          style={{
            padding: '8px 10px 8px 12px',
            borderRadius: 8,
            border: '1px solid var(--tf-primary)',
            background: 'var(--tf-primary-light)',
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 1 }}>
            <span className="break-words font-bold" style={{ fontSize: 13, color: 'var(--tf-text)' }}>
              {title}
            </span>
            {subtitle ? (
              <span
                className="truncate"
                title={subtitle}
                style={{ fontSize: 12, color: 'var(--tf-text-muted)' }}
              >
                {subtitle}
              </span>
            ) : null}
          </div>
          {drawerHost && details.data ? (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              className="flex shrink-0 items-center gap-1.5 bg-[color:var(--tf-primary)] text-white transition-[filter] hover:brightness-110"
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid var(--tf-primary)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <PanelRightOpen aria-hidden className="h-3.5 w-3.5" />
              Ver ficha
            </button>
          ) : null}
          <button
            type="button"
            onClick={clear}
            className="shrink-0 bg-[color:var(--tf-surface)] text-[color:var(--tf-primary)] transition-colors hover:bg-[color:var(--tf-primary)] hover:text-white"
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--tf-primary)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Trocar
          </button>
        </div>
        {details.data && drawerHost ? (
          <>
            <ErpLookupAlerts alertas={details.data.alertas} />
            {drawerOpen
              ? createPortal(
                  <ErpDetailsDrawer details={details.data} onClose={() => setDrawerOpen(false)} />,
                  drawerHost,
                )
              : null}
          </>
        ) : null}
        {details.isPending ? <ErpLookupDetailsLoading /> : null}
        {details.isError ? (
          <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
            {getErpUnavailableMessage(details.error)
              ? 'Os detalhes não puderam ser carregados: o banco do ERP está fora do ar no momento.'
              : 'Não foi possível carregar os detalhes agora.'}
          </small>
        ) : null}
        {drawerHost ? null : details.data && detailsSlot ? (
          createPortal(
            // `data-erp-side` abre o painel (ver PublicFormView). A ficha fica na altura do
            // painel e só ela rola se ainda assim não couber; `pb-3` deixa a sombra à vista.
            <div data-erp-side="" className="flex max-h-full min-h-0 flex-col pb-3">
              <ErpLookupDetailsCard
                key={details.data.value}
                details={details.data}
                layout="side"
                onDismiss={clear}
              />
            </div>,
            detailsSlot,
          )
        ) : details.data ? (
          <ErpLookupDetailsCard key={details.data.value} details={details.data} />
        ) : null}
      </div>
    );
  }

  const error = query.isError ? describeError(query.error) : null;
  const waitingForChars = modo === 'pesquisa' && text.trim().length > 0 && text.trim().length < minChars;
  const showEmpty = enabled && query.isSuccess && items.length === 0 && !query.isFetching;

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--tf-text-muted)' }}
        />
        <input
          type="search"
          value={text}
          aria-label={`Pesquisar ${field.label}`}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
          style={{ ...inputStyle, paddingLeft: 34, paddingRight: 34 }}
        />
        {query.isFetching ? (
          <Loader2
            aria-label="Pesquisando"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin"
            style={{ color: 'var(--tf-primary)' }}
          />
        ) : null}
      </div>

      {waitingForChars ? (
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          Digite pelo menos {minChars} caracteres.
        </small>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-semibold" style={{ color: 'var(--tf-danger)' }}>
          {error.message}
          {error.needsLogin ? (
            <>
              {' '}
              <a href="/login" target="_blank" rel="noopener noreferrer" className="underline">
                Entrar (abre em outra aba)
              </a>{' '}
              e depois pesquise de novo aqui — suas respostas continuam no formulário.
            </>
          ) : null}
        </p>
      ) : null}

      {showEmpty ? (
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          Nenhum resultado{text.trim() ? ` para "${text.trim()}"` : ''}.
        </small>
      ) : null}

      {!error && items.length > 0 && enabled ? (
        <div
          role="listbox"
          aria-label={`Opções de ${field.label}`}
          className="grid gap-1.5 overflow-y-auto"
          style={{ maxHeight: 280 }}
        >
          {items.map((item) => {
            const { title, subtitle } = splitLabel(item.label);
            return (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onChange({ value: item.value, label: item.label })}
                className="flex w-full flex-col border border-solid border-[color:var(--tf-border)] bg-[color:var(--tf-surface)] text-left transition-colors hover:border-[color:var(--tf-primary)] hover:bg-[color:var(--tf-primary-light)]"
                style={{ gap: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, color: 'var(--tf-text)' }}
              >
                <span className="font-semibold">{title}</span>
                {subtitle ? (
                  <span style={{ fontSize: 12, color: 'var(--tf-text-muted)' }}>{subtitle}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
