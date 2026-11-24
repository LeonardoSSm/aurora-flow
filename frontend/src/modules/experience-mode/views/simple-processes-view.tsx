import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { queryKeys } from '../../../lib/query-keys';
import { fetchForms, updateFormAppearance, type PaginatedForms } from '../../forms/services/forms-api';
import type { FormAppearance, FormSummary } from '../../forms/types';
import { AppearancePicker } from '../components/appearance-picker';
import { resolveAppearance } from '../lib/process-appearance';

/** Lista do modo simplificado: os processos mais recentes, sem paginação. */
export const SIMPLE_PROCESSES_PARAMS = { page: 1, limit: 100, excludeStatus: 'archived' as const };

export function useSimpleProcesses() {
  return useQuery({
    queryKey: queryKeys.forms.list(SIMPLE_PROCESSES_PARAMS),
    queryFn: () => fetchForms(SIMPLE_PROCESSES_PARAMS),
    // Sempre atual ao abrir: o passo a passo salva por outra chave (['builder', 'forms']).
    staleTime: 0,
  });
}

function ProcessCard({
  form,
  canCustomize,
  onOpen,
  onCustomize,
}: {
  form: FormSummary;
  canCustomize: boolean;
  onOpen: () => void;
  onCustomize: () => void;
}) {
  const { color, Icon } = resolveAppearance(form.appearance);

  return (
    <article className="relative">
      {/* O card inteiro, na cor do processo, abre o kanban; só o nome vai escrito. */}
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full min-h-[56px] w-full items-center gap-2.5 rounded-xl py-2.5 pl-3 pr-9 text-left text-white shadow-soft transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: color, outlineColor: color }}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/20">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="line-clamp-2 text-[13px] font-semibold leading-tight">{form.name}</span>
      </button>
      {canCustomize ? (
        <button
          type="button"
          onClick={onCustomize}
          aria-label={`Cor e ícone de ${form.name}`}
          title="Cor e ícone"
          className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/20 hover:text-white"
        >
          <Palette className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </article>
  );
}

/**
 * Modo simplificado: os processos em cards — só ícone, cor e nome. Clicar abre o kanban do
 * processo; a cor e o ícone são escolhidos por quem pode editar processos.
 */
export function SimpleProcessesView({ onCreateProcess }: { onCreateProcess: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { can } = useAuth();
  const processes = useSimpleProcesses();
  const [customizing, setCustomizing] = useState<FormSummary | null>(null);

  const appearanceMutation = useMutation({
    mutationFn: ({ formId, appearance }: { formId: string; appearance: FormAppearance }) =>
      updateFormAppearance(formId, appearance),
    onSuccess: (appearance, { formId }) => {
      queryClient.setQueryData<PaginatedForms>(queryKeys.forms.list(SIMPLE_PROCESSES_PARAMS), (current) =>
        current
          ? { ...current, data: current.data.map((form) => (form.id === formId ? { ...form, appearance } : form)) }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms.all() });
      setCustomizing(null);
    },
    onError: () => {
      showToast({ title: 'Não deu para salvar', description: 'Tente de novo em instantes.', variant: 'error' });
    },
  });

  const list = processes.data?.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-tx-primary">Seus processos</h1>
          <p className="mt-1 text-base text-tx-secondary">
            {processes.isLoading
              ? 'Carregando…'
              : `${list.length} ${list.length === 1 ? 'processo' : 'processos'}`}
          </p>
        </div>
        {can('forms.create') ? (
          <button
            type="button"
            onClick={onCreateProcess}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-white hover:opacity-90"
          >
            <Plus className="h-5 w-5" />
            Criar processo
          </button>
        ) : null}
      </div>

      {processes.isError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-base font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
          Não foi possível carregar os processos.
        </p>
      ) : null}

      {!processes.isLoading && list.length === 0 && !processes.isError ? (
        <p className="py-16 text-center text-base text-tx-secondary">Nenhum processo ainda.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((form) => (
          <ProcessCard
            key={form.id}
            form={form}
            canCustomize={can('forms.edit', form.id)}
            // O nome vai junto: com o board vazio o kanban não tem de onde tirar o título.
            onOpen={() => navigate(`/kanban/${form.id}`, { state: { processName: form.name } })}
            onCustomize={() => setCustomizing(form)}
          />
        ))}
      </div>

      {customizing ? (
        <AppearancePicker
          processName={customizing.name}
          value={customizing.appearance}
          saving={appearanceMutation.isPending}
          onSave={(appearance) => appearanceMutation.mutate({ formId: customizing.id, appearance })}
          onClose={() => setCustomizing(null)}
        />
      ) : null}
    </div>
  );
}
