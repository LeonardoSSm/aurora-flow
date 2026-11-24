import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, FileStack, ListChecks, Rows3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { fetchFormClassificationOptions } from '../../forms/services/forms-api';
import { phaseColorHex, type DraftKanbanPhase } from '../../kanban-phases/types';
import {
  applyIdentificationToggle,
  getResponderIdentificationMode,
} from '../../public-form/identification';
import type { useFormBuilder } from '../hooks/use-form-builder';
import { ProcessMembersPanel } from '../../process-access/components/process-members-panel';
import { FormAssigneesPicker } from './form-assignees-picker';

type Builder = ReturnType<typeof useFormBuilder>;

const inputClass =
  'h-10 w-full min-w-0 rounded-[10px] border border-border-default bg-bg-s2 px-3 text-sm font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary';

function SwitchControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-bg-hover',
      )}
    >
      <span
        className={cn(
          'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function Panel({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-[12px] border border-border-strong bg-bg-surface p-5',
        className,
      )}
    >
      <header className="mb-4 shrink-0">
        <h2 className="text-[15px] font-bold text-tx-primary">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-tx-secondary">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[10px] bg-bg-s2 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-tx-primary">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-tx-secondary">{description}</p>
      </div>
      <SwitchControl checked={checked} label={title} onChange={onChange} />
    </div>
  );
}

const NEW_OPTION = '__new__';

function sameLabel(a: string, b: string) {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

/**
 * Lista suspensa com o que já existe no sistema. Um valor salvo que não está na lista (texto
 * antigo, área desativada) continua aparecendo e selecionado, para abrir o processo não apagá-lo.
 * Com `allowNew`, a última opção vira um campo de texto para criar um valor novo.
 */
function ClassificationSelect({
  label,
  value,
  options,
  loading,
  onChange,
  allowNew = false,
  newPlaceholder,
  emptyHint,
}: {
  label: string;
  value: string;
  options: string[];
  loading: boolean;
  onChange: (value: string) => void;
  allowNew?: boolean;
  newPlaceholder?: string;
  emptyHint: string;
}) {
  const [creating, setCreating] = useState(false);
  const known = options.find((option) => sameLabel(option, value));
  const orphan = value.trim() && !known ? value : null;

  if (creating) {
    return (
      <label className="grid min-w-0 gap-2 text-sm font-bold text-tx-primary">
        <span className="flex items-center justify-between gap-2">
          {label}
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              if (!value.trim()) onChange('');
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Escolher da lista
          </button>
        </span>
        <input
          autoFocus
          aria-label={`Nova ${label.toLowerCase()}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={newPlaceholder}
          className={inputClass}
        />
      </label>
    );
  }

  return (
    <label className="grid min-w-0 gap-2 text-sm font-bold text-tx-primary">
      {label}
      <select
        value={known ?? value}
        disabled={loading}
        onChange={(event) => {
          if (event.target.value === NEW_OPTION) {
            onChange('');
            setCreating(true);
            return;
          }
          onChange(event.target.value);
        }}
        className={inputClass}
      >
        <option value="">{loading ? 'Carregando…' : 'Selecione'}</option>
        {orphan ? <option value={orphan}>{orphan} (fora da lista)</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {allowNew ? <option value={NEW_OPTION}>+ Nova {label.toLowerCase()}…</option> : null}
      </select>
      {!loading && options.length === 0 ? (
        <span className="text-xs font-medium text-tx-secondary">{emptyHint}</span>
      ) : null}
    </label>
  );
}

const MODES: Array<{ value: 'single' | 'stepper'; label: string; hint: string }> = [
  { value: 'single', label: 'Página única', hint: 'Todas as seções numa tela só' },
  { value: 'stepper', label: 'Multi-etapas', hint: 'Uma seção por vez, com avançar' },
];

function statusLabel(status?: string) {
  if (status === 'published') return 'Publicado';
  if (status === 'paused') return 'Pausado';
  if (status === 'archived') return 'Arquivado';
  if (status === 'expired') return 'Expirado';
  return 'Rascunho';
}

/**
 * Aba "Configurações" do Criador: tudo o que vale para o processo inteiro, em colunas que ocupam
 * a tela (no desktop, sem rolar). O que é de cada fase fica no mapa da aba "Processo".
 */
export function ProcessSettingsPanel({
  builder,
  phases,
  onOpenProcess,
}: {
  builder: Builder;
  phases: DraftKanbanPhase[];
  onOpenProcess: () => void;
}) {
  const {
    forms,
    selectedForm,
    selectedFormSummary,
    selectedFormId,
    hasMoreForms,
    loadingForms,
    loadingFormDetail,
    draft,
    assignableUsers,
    loadingAssignableUsers,
    setDraftField,
    openExistingForm,
    loadMoreForms,
  } = builder;

  const { data: classification, isLoading: loadingClassification } = useQuery({
    queryKey: queryKeys.forms.classificationOptions(),
    queryFn: fetchFormClassificationOptions,
    staleTime: 60_000,
  });

  const settings = draft.settingsJson;
  const mode = settings.mode ?? 'single';
  const identification = getResponderIdentificationMode(settings);
  const fieldCount = draft.sections.reduce((total, section) => total + section.fields.length, 0);
  const version = selectedForm?.versions[0]?.versionNumber ?? 1;

  return (
    <div className="flex flex-col gap-5 xl:h-full">
      <section className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-[12px] border border-border-strong bg-bg-surface px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-bg-s3 px-2.5 py-0.5 text-[11px] font-bold uppercase text-tx-secondary">
            {statusLabel(selectedForm?.status ?? selectedFormSummary?.status)}
          </span>
          <span className="whitespace-nowrap text-tx-secondary">
            {loadingFormDetail
              ? 'Carregando…'
              : selectedForm
                ? `Versão ${version}`
                : 'Novo rascunho, ainda não salvo'}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-tx-secondary">
          {[
            { icon: Rows3, value: phases.length, label: phases.length === 1 ? 'fase' : 'fases' },
            { icon: FileStack, value: draft.sections.length, label: draft.sections.length === 1 ? 'seção' : 'seções' },
            { icon: ListChecks, value: fieldCount, label: fieldCount === 1 ? 'campo' : 'campos' },
          ].map(({ icon: Icon, value, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Icon className="h-4 w-4" />
              <strong className="text-tx-primary">{value}</strong> {label}
            </span>
          ))}
        </div>

        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs font-semibold text-tx-secondary">
          {phases.map((phase, index) => (
            <li key={phase.id} className="flex shrink-0 items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3 w-3 text-tx-muted" /> : null}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-s2 px-2 py-0.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: phaseColorHex(phase.color) }} />
                {phase.label || `Fase ${index + 1}`}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2">
          <select
            aria-label="Abrir outro processo"
            title="Abrir outro processo"
            value={selectedFormId}
            disabled={loadingForms}
            onChange={(event) => openExistingForm(event.target.value)}
            className="h-9 w-56 min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-2.5 text-sm font-medium text-tx-primary outline-none focus:border-primary"
          >
            <option value="">Criando novo processo</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
          {hasMoreForms ? (
            <button
              type="button"
              onClick={loadMoreForms}
              disabled={loadingForms}
              className="h-9 shrink-0 rounded-[8px] bg-bg-hover px-3 text-xs font-bold text-primary disabled:opacity-60"
            >
              {loadingForms ? 'Carregando…' : 'Mais'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenProcess}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[8px] bg-primary px-3.5 text-sm font-bold text-white"
          >
            Abrir mapa do processo
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Identificação" description="Como o processo aparece na lista e para quem responde.">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <label className="grid gap-2 text-sm font-bold text-tx-primary">
            <span>
              Nome <span className="text-error">*</span>
            </span>
            <input
              value={draft.name}
              onChange={(event) => setDraftField('name', event.target.value)}
              placeholder="Ex: Pedido de Compra"
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <ClassificationSelect
              label="Categoria"
              value={draft.category}
              options={classification?.categories ?? []}
              loading={loadingClassification}
              onChange={(value) => setDraftField('category', value)}
              allowNew
              newPlaceholder="Ex: Qualidade"
              emptyHint="Nenhuma categoria em uso ainda."
            />
            <ClassificationSelect
              label="Área"
              value={draft.area}
              options={classification?.areas ?? []}
              loading={loadingClassification}
              onChange={(value) => setDraftField('area', value)}
              emptyHint="Nenhuma área cadastrada. Cadastre em Administração › Áreas."
            />
          </div>

          <label className="flex min-h-[140px] flex-1 flex-col gap-2 text-sm font-bold text-tx-primary">
            Descrição
            <textarea
              value={draft.description}
              onChange={(event) => setDraftField('description', event.target.value)}
              placeholder="Resumo do objetivo deste processo."
              className="min-h-0 flex-1 resize-none rounded-[10px] border border-border-default bg-bg-s2 px-3 py-3 text-sm font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary"
            />
          </label>
        </div>
      </Panel>

      {selectedFormId ? (
        <Panel
          title="Pessoas com acesso"
          description="Só quem está aqui vê o processo. Abra uma pessoa para ver e mudar o que ela pode fazer nele; muda na hora, sem o Salvar."
        >
          <ProcessMembersPanel formId={selectedFormId} />
        </Panel>
      ) : (
        <Panel
          title="Pessoas com acesso"
          description="Quem cria o processo vira dono dele. As pessoas escolhidas aqui entram como Operador ao salvar; depois dá para ajustar o que cada uma pode."
        >
          <FormAssigneesPicker
            fill
            users={assignableUsers}
            loading={loadingAssignableUsers}
            selectedIds={draft.assignedUserIds}
            onChange={(ids) => setDraftField('assignedUserIds', ids)}
          />
        </Panel>
      )}

        <Panel title="Formulário de abertura" description="Como a fase 1 aparece para quem abre a solicitação.">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Modo do formulário">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.value}
                  onClick={() => setDraftField('settingsJson', { ...settings, mode: option.value })}
                  className={cn(
                    'rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                    mode === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border-default hover:bg-bg-hover',
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-bold',
                      mode === option.value ? 'text-primary dark:text-blue-300' : 'text-tx-primary',
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="block text-xs text-tx-secondary">{option.hint}</span>
                </button>
              ))}
            </div>

            <ToggleRow
              title="Identificação no topo"
              description="Nome e e-mail antes da primeira seção. Desligue se o formulário já pede e-mail como pergunta obrigatória."
              checked={identification.show}
              onChange={(checked) =>
                setDraftField('settingsJson', applyIdentificationToggle(settings, 'show', checked))
              }
            />
            <ToggleRow
              title="Identificação obrigatória"
              description="O formulário abre numa tela de entrada que pede nome e e-mail; as perguntas só aparecem depois. Quem está logado entra direto com a conta. O e-mail não é verificado."
              checked={identification.required}
              onChange={(checked) =>
                setDraftField('settingsJson', applyIdentificationToggle(settings, 'required', checked))
              }
            />
            <ToggleRow
              title="Solicitante aprova a resposta"
              description="A resposta do atendente vira uma proposta: o solicitante aprova ou reprova antes de a solicitação ser concluída."
              checked={settings.requiresResponseApproval ?? false}
              onChange={(checked) =>
                setDraftField('settingsJson', { ...settings, requiresResponseApproval: checked })
              }
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
