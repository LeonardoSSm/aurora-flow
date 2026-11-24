import { AlertTriangle, CheckCircle2, FlaskConical, Play, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Node } from '@xyflow/react';
import { queryKeys } from '../../../lib/query-keys';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { fetchFormById } from '../../forms/services/forms-api';
import { runFlowTest } from '../services/flows-api';
import type { NodeTestResult } from '../types/flow.types';
import type { FormField } from '../../forms/types';
import { getNodeLibraryLabel } from './NodeLibrary';
import { getEntryNodes, ownFormId } from '../lib/flow-entries';

interface Props {
  flowId: string;
  nodes: Node[];
  onClose: () => void;
}

const NUMERIC_TYPES = new Set(['number', 'currency', 'scale', 'rating']);
const DISPLAY_ONLY_TYPES = new Set(['title', 'description', 'divider', 'file_download']);

type ResultKind = 'ok' | 'simulated' | 'warning' | 'failed';

interface DryRunOutput {
  dryRun: true;
  summary?: string;
  warning?: string;
  preview?: string;
}

function dryRunOutputOf(result: NodeTestResult): DryRunOutput | null {
  const output = result.output as Partial<DryRunOutput> | null | undefined;
  return output && typeof output === 'object' && output.dryRun === true
    ? (output as DryRunOutput)
    : null;
}

function resultKind(result: NodeTestResult): ResultKind {
  if (result.status === 'failed') return 'failed';
  const dryRun = dryRunOutputOf(result);
  if (dryRun?.warning) return 'warning';
  return dryRun ? 'simulated' : 'ok';
}

const KIND_STYLES: Record<ResultKind, string> = {
  ok: 'border-[#bbf7d0] bg-[#f0fdf4] dark:border-emerald-800 dark:bg-emerald-900/30',
  simulated: 'border-[#bfdbfe] bg-[#eff6ff] dark:border-blue-800 dark:bg-blue-900/30',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30',
  failed: 'border-[#fecaca] bg-[#fef2f2] dark:border-red-800 dark:bg-red-900/30',
};

function ResultIcon({ kind }: { kind: ResultKind }) {
  if (kind === 'failed') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#ef4444]" />;
  if (kind === 'warning') return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />;
  if (kind === 'simulated') return <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />;
  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />;
}

export function FlowTestModal({ flowId, nodes, onClose }: Props) {
  // Com várias entradas, o teste entra pela escolhida; os campos são os do formulário dela.
  const entries = getEntryNodes(nodes);
  const [entryNodeId, setEntryNodeId] = useState<string | null>(entries[0]?.id ?? null);
  const entry = entries.find((n) => n.id === entryNodeId) ?? entries[0] ?? null;
  const formId = entry ? ownFormId(entry) : null;
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<NodeTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: form, isLoading: isLoadingForm } = useQuery({
    queryKey: queryKeys.forms.byId(formId ?? ''),
    queryFn: () => fetchFormById(formId ?? ''),
    enabled: !!formId,
  });

  const inputFields: FormField[] = (
    form?.versions[0]?.sections.flatMap((s) => s.fields) ?? []
  ).filter((f) => !DISPLAY_ONLY_TYPES.has(f.fieldType));

  async function handleRun() {
    setIsRunning(true);
    setRunError(null);
    try {
      const parsed: Record<string, unknown> = {};
      for (const [code, raw] of Object.entries(fieldValues)) {
        if (raw === '') continue;
        const field = inputFields.find((f) => f.code === code);
        if (field && NUMERIC_TYPES.has(field.fieldType)) {
          const num = Number(raw);
          parsed[code] = isNaN(num) ? raw : num;
        } else if (field?.fieldType === 'checkbox') {
          parsed[code] = raw === 'true';
        } else {
          parsed[code] = raw;
        }
      }
      const res = await runFlowTest(flowId, {
        fieldValues: parsed,
        ...(entries.length > 1 && entry ? { entryNodeId: entry.id } : {}),
      });
      setResults(res);
    } catch (error) {
      setRunError(
        getApiErrorMessage(error, 'Erro ao executar o teste. Verifique as configurações do fluxo.'),
      );
    } finally {
      setIsRunning(false);
    }
  }

  function handleFieldChange(code: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [code]: value }));
  }

  function nodeLabel(nodeId: string): string {
    const node = nodes.find((n) => n.id === nodeId);
    const label = (node?.data as { label?: unknown } | undefined)?.label;
    if (typeof label === 'string' && label.trim()) return label;
    return (node?.type && getNodeLibraryLabel(node.type)) ?? node?.type ?? nodeId;
  }

  const kinds = results?.map(resultKind) ?? [];
  const count = (kind: ResultKind) => kinds.filter((k) => k === kind).length;
  const failCount = count('failed');
  const warningCount = count('warning');
  const summaryParts = [
    count('ok') ? `${count('ok')} OK` : null,
    count('simulated') ? `${count('simulated')} simulado(s)` : null,
    warningCount ? `${warningCount} aviso(s)` : null,
    failCount ? `${failCount} falha(s)` : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#071a38]/45 px-4 py-6">
      <section className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[10px] bg-bg-surface shadow-2xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-default px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-tx-primary">Executar teste</h2>
            {!results && (
              <p className="mt-0.5 text-xs text-tx-secondary">
                Preencha valores simulados para testar o fluxo.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-bg-hover"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!results && entries.length > 1 && (
            <label className="mb-4 grid gap-1">
              <span className="text-xs font-bold text-tx-secondary">Entrar pelo gatilho</span>
              <select
                value={entry?.id ?? ''}
                onChange={(e) => {
                  setEntryNodeId(e.target.value);
                  // Os campos mudam com o formulário da entrada.
                  setFieldValues({});
                }}
                className="h-9 cursor-pointer rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm text-tx-primary outline-none focus:border-primary"
              >
                {entries.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nodeLabel(n.id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {results ? (
            <div className="grid gap-3">
              <div
                className={[
                  'flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-bold',
                  failCount > 0
                    ? 'bg-[#fef2f2] text-[#dc2626] dark:bg-red-900/30 dark:text-red-400'
                    : warningCount > 0
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-[#f0fdf4] text-[#16a34a] dark:bg-emerald-900/30 dark:text-emerald-400',
                ].join(' ')}
              >
                {failCount > 0 ? (
                  <XCircle className="h-4 w-4 shrink-0" />
                ) : warningCount > 0 ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                {summaryParts.length ? summaryParts.join(' · ') : 'Nenhum nó executado'}
              </div>

              <p className="text-xs text-tx-secondary">
                Nada foi enviado, chamado ou gravado: as ações aparecem como simuladas, com o que
                fariam.
              </p>

              {results.map((r, index) => {
                const kind = kinds[index];
                const dryRun = dryRunOutputOf(r);
                const description = dryRun?.summary ?? (dryRun?.preview ? `Prévia: ${dryRun.preview}` : null);
                return (
                  <div
                    key={r.nodeId}
                    className={['flex items-start gap-3 rounded-[8px] border p-3', KIND_STYLES[kind]].join(' ')}
                  >
                    <ResultIcon kind={kind} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-tx-primary">
                        {nodeLabel(r.nodeId)}
                        {kind === 'simulated' && (
                          <span className="rounded bg-[#dbeafe] px-1.5 text-[10px] font-bold text-[#1d4ed8] dark:bg-blue-900/60 dark:text-blue-300">
                            Simulado
                          </span>
                        )}
                      </p>
                      {description && (
                        <p className="mt-0.5 break-words text-[11px] text-tx-secondary">{description}</p>
                      )}
                      {dryRun?.warning && (
                        <p className="mt-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                          {dryRun.warning}
                        </p>
                      )}
                      {r.error && <p className="mt-0.5 text-[11px] text-[#ef4444]">{r.error}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-tx-muted">{r.durationMs}ms</span>
                  </div>
                );
              })}
            </div>
          ) : !formId ? (
            <div className="rounded-[8px] border border-border-default bg-bg-s2 p-4 text-sm text-tx-secondary">
              Sem formulário vinculado. O teste usará uma submissão em branco.
            </div>
          ) : isLoadingForm ? (
            <p className="text-sm text-tx-secondary">Carregando campos do formulário...</p>
          ) : inputFields.length === 0 ? (
            <div className="rounded-[8px] border border-border-default bg-bg-s2 p-4 text-sm text-tx-secondary">
              O formulário não tem campos de entrada. O teste usará uma submissão em branco.
            </div>
          ) : (
            <div className="grid gap-3">
              {inputFields.map((field) => (
                <label key={field.id} className="grid gap-1">
                  <span className="text-xs font-bold text-tx-secondary">
                    {field.label}
                    {field.required && <span className="ml-1 text-[#ef4444]">*</span>}
                    <span className="ml-1.5 font-normal text-tx-muted">({field.fieldType})</span>
                  </span>

                  {field.fieldType === 'checkbox' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`field-${field.code}`}
                        checked={fieldValues[field.code] === 'true'}
                        onChange={(e) =>
                          handleFieldChange(field.code, e.target.checked ? 'true' : 'false')
                        }
                        className="h-4 w-4 rounded border-border-default text-primary"
                      />
                      <span className="text-sm text-tx-secondary">Marcado</span>
                    </div>
                  ) : (
                    <input
                      type={NUMERIC_TYPES.has(field.fieldType) ? 'number' : 'text'}
                      value={fieldValues[field.code] ?? ''}
                      onChange={(e) => handleFieldChange(field.code, e.target.value)}
                      placeholder={`Valor de teste para "${field.label}" (opcional)`}
                      className="h-9 rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm text-tx-primary outline-none focus:border-primary"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          {runError && <p className="mt-3 text-sm font-bold text-[#ef4444]">{runError}</p>}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border-default px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover"
          >
            {results ? 'Fechar' : 'Cancelar'}
          </button>
          {!results && (
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={isRunning || isLoadingForm}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              {isRunning ? 'Executando...' : 'Executar teste'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
