import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { X } from 'lucide-react';
import { useId, useMemo } from 'react';
import { brandCssVars } from '../../../brand/css-vars';
import { useBrand } from '../../../brand/hooks/useBrand';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { queryKeys } from '../../../lib/query-keys';
import { fetchFormById } from '../../forms/services/forms-api';
import { fetchSolicitationById } from '../../solicitations/services/solicitations-api';
import { fetchResponseById } from '../services/responses-api';
import { buildFieldMetaByCode, getSubmissionStatusMeta } from '../utils/response-formatters';
import { ResponseItemsList } from './responses-list';
import { SubmissionAttachments } from './submission-attachments';

function humanizeFieldCode(code: string) {
  return code
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function isForbidden(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

/**
 * Mostra as respostas do formulário que originou uma solicitação/card do Kanban.
 * Resolve a submissão a partir do `solicitationId` — o card não carrega o
 * submissionId de graça, então essa busca é sempre em duas etapas.
 */
export function ResponseDetailModal({
  solicitationId,
  formId,
  onClose,
}: {
  solicitationId: string;
  formId: string | null;
  onClose: () => void;
}) {
  const brand = useBrand();
  const titleId = useId();
  useEscapeKey(onClose);

  const solicitationQuery = useQuery({
    queryKey: queryKeys.solicitations.byId(solicitationId),
    queryFn: () => fetchSolicitationById(solicitationId),
  });

  const submissionId = solicitationQuery.data?.submissionId ?? null;

  const responseQuery = useQuery({
    queryKey: queryKeys.responses.byId(submissionId ?? ''),
    queryFn: () => fetchResponseById(submissionId as string),
    enabled: Boolean(submissionId),
  });

  const formQuery = useQuery({
    queryKey: queryKeys.forms.byId(formId ?? ''),
    queryFn: () => fetchFormById(formId as string),
    enabled: Boolean(formId),
    staleTime: 5 * 60_000,
  });

  const fieldMetaByCode = useMemo(() => buildFieldMetaByCode(formQuery.data ?? null), [formQuery.data]);

  const resolveFieldLabel = (fieldCode: string) =>
    (fieldMetaByCode[fieldCode]?.label ?? humanizeFieldCode(fieldCode)) || 'Pergunta';
  const resolveField = (fieldCode: string) => fieldMetaByCode[fieldCode];

  const response = responseQuery.data;
  const loading = solicitationQuery.isLoading || (Boolean(submissionId) && responseQuery.isLoading);

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      style={brandCssVars(brand)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border-default px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-widest text-tx-secondary">
              Respostas do formulário
            </p>
            <h3 id={titleId} className="truncate text-lg font-bold text-tx-primary">
              {response?.responderName ?? 'Respondente sem identificação'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-bg-hover"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="text-sm text-tx-secondary">Carregando respostas...</p>
          ) : isForbidden(solicitationQuery.error) ? (
            <p className="text-sm text-tx-secondary">Você não tem acesso a esta solicitação.</p>
          ) : solicitationQuery.isError ? (
            <p className="text-sm text-tx-secondary">Não foi possível carregar a solicitação.</p>
          ) : !submissionId ? (
            <p className="text-sm text-tx-secondary">
              Esta solicitação não tem uma submissão de formulário associada.
            </p>
          ) : isForbidden(responseQuery.error) ? (
            <p className="text-sm text-tx-secondary">
              Você não tem permissão para ver o detalhe desta resposta.
            </p>
          ) : responseQuery.isError || !response ? (
            <p className="text-sm text-tx-secondary">Não foi possível carregar as respostas.</p>
          ) : response.items.length === 0 ? (
            <p className="text-sm text-tx-secondary">Esta submissão não tem respostas registradas.</p>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    'inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold uppercase',
                    getSubmissionStatusMeta(response.status).className,
                  ].join(' ')}
                >
                  {getSubmissionStatusMeta(response.status).label}
                </span>
                <small className="text-xs text-tx-secondary">
                  {response.submittedAt ? new Date(response.submittedAt).toLocaleString('pt-BR') : '-'}
                </small>
              </div>
              <p className="text-sm text-tx-secondary">{response.responderEmail ?? '-'}</p>
              <ResponseItemsList
                items={response.items}
                resolveFieldLabel={resolveFieldLabel}
                resolveField={resolveField}
                fieldMetaByCode={fieldMetaByCode}
              />
              <SubmissionAttachments submissionId={response.id} />
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border-default px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover"
          >
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}
