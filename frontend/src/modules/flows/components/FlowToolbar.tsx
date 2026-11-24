import { ArrowLeft, Play, Save, Trash2 } from 'lucide-react';
import type { NodeTestResult } from '../types/flow.types';

interface Props {
  flowName: string;
  isActive: boolean;
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
  validationErrors: string[];
  canRunTest: boolean;
  canDelete: boolean;
  isRunningTest: boolean;
  isDeleting: boolean;
  testResult: NodeTestResult[] | null;
  onNameChange: (name: string) => void;
  onToggleActive: (val: boolean) => void;
  onSave: () => void;
  onRunTest: () => void;
  onDelete: () => void;
  /** Volta para a lista de automações (editor embutido no mapa de processos). */
  onBack?: () => void;
}

function SaveStatus({
  isSaving,
  isDirty,
  lastSavedAt,
}: {
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
}) {
  if (isSaving) return <span className="text-[11px] text-tx-secondary">Salvando...</span>;
  if (isDirty) return <span className="text-[11px] text-tx-muted">Não salvo</span>;
  if (lastSavedAt) {
    const hh = String(lastSavedAt.getHours()).padStart(2, '0');
    const mm = String(lastSavedAt.getMinutes()).padStart(2, '0');
    return (
      <span className="text-[11px] text-[#00a96b] dark:text-emerald-400">
        Salvo às {hh}:{mm}
      </span>
    );
  }
  return null;
}

export function FlowToolbar({
  flowName,
  isActive,
  isSaving,
  isDirty,
  lastSavedAt,
  validationErrors,
  canRunTest,
  canDelete,
  isRunningTest,
  isDeleting,
  testResult,
  onNameChange,
  onToggleActive,
  onSave,
  onRunTest,
  onDelete,
  onBack,
}: Props) {
  const hasErrors = validationErrors.length > 0;

  const testSummary = testResult
    ? (() => {
        const ok = testResult.filter((r) => r.status === 'success').length;
        const fail = testResult.filter((r) => r.status === 'failed').length;
        return fail > 0
          ? `${ok} nó(s) OK, ${fail} falha(s)`
          : `${ok} nó(s) executado(s) com sucesso`;
      })()
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-strong bg-bg-surface px-4 py-2.5">
      {onBack ? (
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm('Este fluxo tem mudanças não salvas. Voltar mesmo assim?')) return;
            onBack();
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-bold text-tx-secondary hover:bg-bg-hover hover:text-tx-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Automações
        </button>
      ) : null}

      {/* Flow name */}
      <input
        value={flowName}
        onChange={(e) => onNameChange(e.target.value)}
        className="h-9 w-[200px] rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm font-bold text-tx-primary outline-none focus:border-primary"
        placeholder="Nome do fluxo"
      />

      {/* Active toggle */}
      <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-tx-secondary">
        <button
          type="button"
          aria-pressed={isActive}
          onClick={() => onToggleActive(!isActive)}
          className={[
            'relative h-5 w-9 rounded-full transition-colors',
            isActive ? 'bg-primary' : 'bg-border-strong',
          ].join(' ')}
        >
          <span
            className={[
              'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              isActive ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
        {isActive ? 'Ativo' : 'Inativo'}
      </label>

      {/* Status + actions */}
      <div className="ml-auto flex items-center gap-3">
        <SaveStatus isSaving={isSaving} isDirty={isDirty} lastSavedAt={lastSavedAt} />

        {testSummary && (
          <span
            className={[
              'rounded-full px-2.5 py-0.5 text-[11px] font-bold',
              testResult?.some((r) => r.status === 'failed')
                ? 'bg-[#fef2f2] text-[#ef4444]'
                : 'bg-[#f0fdf4] text-[#16a34a]',
            ].join(' ')}
          >
            {testSummary}
          </span>
        )}

        {hasErrors && (
          <span
            className="max-w-[200px] truncate text-[11px] font-bold text-[#ef4444]"
            title={validationErrors.join('\n')}
          >
            {validationErrors.length} nó(s) incompleto(s)
          </span>
        )}

        {canRunTest && (
          <button
            type="button"
            onClick={onRunTest}
            disabled={isRunningTest}
            title="Executar fluxo com dados de teste"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm font-bold text-tx-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {isRunningTest ? 'Executando...' : 'Testar'}
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            title="Excluir fluxo"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#fee2e2] bg-bg-surface px-3 text-sm font-bold text-[#ef4444] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Excluindo...' : 'Excluir'}
          </button>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || hasErrors}
          title={hasErrors ? validationErrors.join('\n') : undefined}
          className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
