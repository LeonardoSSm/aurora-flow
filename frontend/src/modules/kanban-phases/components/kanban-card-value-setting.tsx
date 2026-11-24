import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign } from 'lucide-react';
import { useToast } from '../../../components/ui';
import { queryKeys } from '../../../lib/query-keys';
import { useFlowFormFields } from '../../flows/hooks/use-flow-form-fields';
import { fetchKanbanSettings, saveKanbanSettings } from '../services/kanban-phases-api';

/** Tipos que fazem sentido como valor em R$ no card. */
const MONEY_TYPES = new Set(['currency', 'calculated', 'number']);

/**
 * "Valor do card": um campo (do formulário ou de uma fase) que aparece em R$ em cada card do Kanban
 * e é somado no topo de cada coluna. Grava na hora, separado do "Salvar fases". `compact` é a
 * versão de uma linha que flutua no mapa do processo.
 */
export function KanbanCardValueSetting({ formId, compact = false }: { formId: string; compact?: boolean }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.kanbanPhases.settings(formId),
    queryFn: () => fetchKanbanSettings(formId),
  });
  const fieldsQuery = useFlowFormFields(formId);
  // "Total de horas" é cálculo, mas em horas (8h30): não vira R$ no card.
  const options = (fieldsQuery.data ?? []).filter(
    (field) => MONEY_TYPES.has(field.fieldType) && field.formulaFormat !== 'hours',
  );
  const current = settingsQuery.data?.cardValueField ?? '';

  const mutation = useMutation({
    mutationFn: (cardValueField: string | null) => saveKanbanSettings(formId, { cardValueField }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.kanbanPhases.settings(formId), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.kanbanBoard(formId) });
      showToast({
        title: saved.cardValueField ? 'Valor do card atualizado' : 'Cards sem valor',
        variant: 'success',
      });
    },
    onError: () => showToast({ title: 'Não foi possível salvar o valor do card', variant: 'error' }),
  });

  const missing = current && !options.some((field) => field.code === current);

  const select = (
    <select
      aria-label="Valor do card"
      value={current}
      disabled={settingsQuery.isLoading || mutation.isPending}
      onChange={(event) => mutation.mutate(event.target.value || null)}
      className={`${compact ? 'h-[34px] min-w-0 max-w-[260px] flex-1' : 'h-9 min-w-[220px]'} rounded-[8px] border border-border-default bg-bg-surface px-2.5 text-sm text-tx-primary disabled:opacity-60`}
    >
      <option value="">Nenhum (card sem valor)</option>
      {missing ? <option value={current}>{`${current} (campo não encontrado)`}</option> : null}
      {options.map((field) => (
        <option key={field.code} value={field.code}>
          {field.phaseLabel ? `${field.label} (fase ${field.phaseLabel})` : field.label}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <label
        className="flex min-w-0 items-center gap-2 pl-1.5"
        title="Aparece em R$ em cada card e é somado no topo de cada coluna do Kanban."
      >
        <CircleDollarSign className="h-4 w-4 shrink-0 text-tx-secondary" />
        <span className="whitespace-nowrap text-[13px] font-bold text-tx-primary">Valor do card</span>
        {select}
      </label>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border-default bg-bg-surface px-3 py-2.5">
      <CircleDollarSign className="h-5 w-5 shrink-0 text-tx-secondary" />
      <label className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="grid">
          <span className="text-sm font-bold text-tx-primary">Valor do card</span>
          <span className="text-xs text-tx-secondary">
            Aparece em R$ em cada card e é somado no topo de cada coluna.
          </span>
        </span>
        {select}
      </label>
      {options.length === 0 && !fieldsQuery.isLoading ? (
        <p className="basis-full text-xs text-tx-muted">
          Crie um campo &quot;Valor monetário&quot;, &quot;Número&quot; ou &quot;Cálculo&quot; no formulário ou numa
          fase (e salve as fases) para escolher aqui.
        </p>
      ) : null}
    </div>
  );
}
