import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../../app/auth-context';
import { Button, useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import {
  fetchProcessAccessCatalog,
  fetchUserProcesses,
  type ProcessAccessCatalog,
  type ProcessGrants,
  removeProcessMember,
  setProcessMember,
  type UserProcess,
} from '../services/process-access-api';
import { PhaseParticipation } from './phase-participation';
import { describeGrants, ProcessGrantsEditor } from './process-grants-editor';

/** Vínculo escolhido no cadastro de uma pessoa nova: gravado depois que ela é criada. */
export type PendingProcessAccess = { formId: string; formName: string; grants: ProcessGrants };

type UserProcessesStepProps =
  | { mode: 'edit'; user: { id: string; role: string } }
  | { mode: 'create'; role: string; pending: PendingProcessAccess[]; onPendingChange: (next: PendingProcessAccess[]) => void };

const selectClass =
  'h-10 w-full min-w-0 appearance-none rounded-[10px] border border-border-default bg-bg-s2 px-3 pr-9 text-sm font-medium text-tx-primary outline-none focus:border-primary';

function operatorGrants(catalog: ProcessAccessCatalog): ProcessGrants {
  return { ...(catalog.presets.find((preset) => preset.key === 'operador')?.grants ?? {}) };
}

function AddProcess({
  options,
  catalog,
  busy,
  onAdd,
}: {
  options: Array<{ formId: string; formName: string }>;
  catalog: ProcessAccessCatalog;
  busy: boolean;
  onAdd: (formId: string, formName: string, grants: ProcessGrants) => void;
}) {
  const [formId, setFormId] = useState('');
  if (options.length === 0) {
    return <p className="text-xs text-tx-muted">Não há outro processo que você possa dar acesso.</p>;
  }
  const chosen = options.find((option) => option.formId === formId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="relative min-w-[220px] flex-1">
        <select
          aria-label="Processo para dar acesso"
          className={selectClass}
          value={formId}
          onChange={(event) => setFormId(event.target.value)}
        >
          <option value="">Escolha um processo…</option>
          {options.map((option) => (
            <option key={option.formId} value={option.formId}>
              {option.formName}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-tx-muted" />
      </span>
      <Button
        variant="subtle"
        className="shrink-0 whitespace-nowrap"
        disabled={!chosen || busy}
        onClick={() => {
          if (!chosen) return;
          onAdd(chosen.formId, chosen.formName, operatorGrants(catalog));
          setFormId('');
        }}
      >
        <Plus className="mr-1 inline h-4 w-4" aria-hidden />
        Dar acesso
      </Button>
    </div>
  );
}

function ProcessRow({
  formId,
  formName,
  grants,
  catalog,
  canManage,
  person,
  saving,
  onSave,
  onRemove,
}: {
  formId: string;
  formName: string;
  grants: ProcessGrants;
  catalog: ProcessAccessCatalog;
  canManage: boolean;
  person: { id: string; role: string } | null;
  saving: boolean;
  onSave: (grants: ProcessGrants) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProcessGrants>(grants);
  const dirty = JSON.stringify(draft) !== JSON.stringify(grants);

  return (
    <li className="rounded-[12px] border border-border-default bg-bg-surface">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => {
            setDraft(grants);
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-tx-muted transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-tx-primary">{formName}</span>
            <span className="block truncate text-xs text-tx-muted">{describeGrants(grants, catalog.presets)}</span>
          </span>
        </button>
        {canManage ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            aria-label={`Tirar o acesso a ${formName}`}
            title="Tirar o acesso"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tx-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="grid gap-3 border-t border-border-default px-3.5 py-3">
          <ProcessGrantsEditor catalog={catalog} value={draft} onChange={setDraft} disabled={!canManage || saving} />
          {person ? <PhaseParticipation formId={formId} person={person} /> : null}
          {canManage ? (
            <div className="flex justify-end gap-2">
              <Button variant="subtle" disabled={!dirty || saving} onClick={() => setDraft(grants)}>
                Desfazer
              </Button>
              <Button disabled={!dirty || saving} onClick={() => onSave(draft)}>
                {saving ? 'Salvando…' : 'Salvar permissões'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-tx-muted">Você não gerencia o acesso a este processo.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Passo "Processos" do cadastro de usuário: a que processos a pessoa tem acesso e o que pode em cada
 * um. Pessoa já cadastrada: cada mudança grava na hora. Pessoa nova: os vínculos ficam guardados e são
 * gravados depois que ela é criada.
 */
export function UserProcessesStep(props: UserProcessesStepProps) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const catalogQuery = useQuery({ queryKey: queryKeys.processAccess.catalog(), queryFn: fetchProcessAccessCatalog });
  // Pessoa nova ainda não existe: as opções são os processos que QUEM CADASTRA gerencia.
  const listUserId = props.mode === 'edit' ? props.user.id : (me?.id ?? '');
  const processesQuery = useQuery({
    queryKey: queryKeys.processAccess.userProcesses(listUserId),
    queryFn: () => fetchUserProcesses(listUserId),
    enabled: Boolean(listUserId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.processAccess.userProcesses(listUserId) });
  const saveMutation = useMutation({
    mutationFn: ({ formId, grants }: { formId: string; grants: ProcessGrants }) =>
      setProcessMember(formId, props.mode === 'edit' ? props.user.id : '', grants),
    onSuccess: () => {
      showToast({ title: 'Acesso salvo', variant: 'success' });
      void invalidate();
    },
    onError: () => showToast({ title: 'Não foi possível salvar o acesso', variant: 'error' }),
  });
  const removeMutation = useMutation({
    mutationFn: (formId: string) => removeProcessMember(formId, props.mode === 'edit' ? props.user.id : ''),
    onSuccess: () => {
      showToast({ title: 'Acesso retirado', variant: 'success' });
      void invalidate();
    },
    onError: () => showToast({ title: 'Não foi possível tirar o acesso', variant: 'error' }),
  });

  const catalog = catalogQuery.data;
  const processes: UserProcess[] = processesQuery.data ?? [];
  if (catalogQuery.isLoading || processesQuery.isLoading || !catalog) {
    return <p className="text-sm text-tx-muted">Carregando processos…</p>;
  }

  const intro = (
    <p className="text-xs text-tx-muted">
      Sem acesso a um processo, a pessoa não o vê — salvo pedidos que ela mesma abriu e aprovações para as
      quais for chamada. O perfil continua valendo para o que é da plataforma.
    </p>
  );

  if (props.mode === 'create') {
    const chosen = new Set(props.pending.map((item) => item.formId));
    const options = processes.filter((process) => process.canManage && !chosen.has(process.formId));
    return (
      <div className="grid gap-3">
        {intro}
        {props.pending.length > 0 ? (
          <ul className="grid gap-2">
            {props.pending.map((item) => (
              <ProcessRow
                key={item.formId}
                formId={item.formId}
                formName={item.formName}
                grants={item.grants}
                catalog={catalog}
                canManage
                person={null}
                saving={false}
                onSave={(grants) =>
                  props.onPendingChange(props.pending.map((p) => (p.formId === item.formId ? { ...p, grants } : p)))
                }
                onRemove={() => props.onPendingChange(props.pending.filter((p) => p.formId !== item.formId))}
              />
            ))}
          </ul>
        ) : null}
        <AddProcess
          options={options}
          catalog={catalog}
          busy={false}
          onAdd={(formId, formName, grants) => props.onPendingChange([...props.pending, { formId, formName, grants }])}
        />
      </div>
    );
  }

  const member = processes.filter((process) => process.grants !== null);
  const options = processes.filter((process) => process.canManage && process.grants === null);
  const saving = saveMutation.isPending || removeMutation.isPending;
  return (
    <div className="grid gap-3">
      {intro}
      {member.length === 0 ? (
        <p className="rounded-[10px] bg-bg-s2 px-3 py-2.5 text-sm text-tx-secondary">Sem acesso a nenhum processo ainda.</p>
      ) : (
        <ul className="grid gap-2">
          {member.map((process) => (
            <ProcessRow
              key={process.formId}
              formId={process.formId}
              formName={process.formName}
              grants={process.grants ?? {}}
              catalog={catalog}
              canManage={process.canManage}
              person={props.user}
              saving={saving}
              onSave={(grants) => saveMutation.mutate({ formId: process.formId, grants })}
              onRemove={() => removeMutation.mutate(process.formId)}
            />
          ))}
        </ul>
      )}
      <AddProcess
        options={options}
        catalog={catalog}
        busy={saving}
        onAdd={(formId, _name, grants) => saveMutation.mutate({ formId, grants })}
      />
    </div>
  );
}
