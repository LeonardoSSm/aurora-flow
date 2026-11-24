import { ArrowDown, ArrowUp, Flag, Plus, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { FormAssigneesPicker } from '../../builder/components/form-assignees-picker';
import type { useFormBuilder } from '../../builder/hooks/use-form-builder';
import { createDraftFieldOption } from '../../builder/state/draft.helpers';
import { fieldTypeChoiceLabel, supportsOptions, type DraftField } from '../../builder/types';
import type { FormFieldType } from '../../forms/types';
import { PhasePeoplePicker } from '../../kanban-phases/components/people-multi-select';
import type { usePhasesDraft } from '../../kanban-phases/hooks/use-phases-draft';
import { phaseColorHex, type DraftKanbanPhase } from '../../kanban-phases/types';

type Builder = ReturnType<typeof useFormBuilder>;
type Phases = ReturnType<typeof usePhasesDraft>;

const inputClass =
  'h-12 w-full min-w-0 rounded-xl border border-border-default bg-bg-s2 px-4 text-base font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary';

const smallButtonClass =
  'grid h-10 w-10 shrink-0 place-items-center rounded-lg text-tx-secondary transition-colors hover:bg-bg-hover hover:text-tx-primary disabled:opacity-30 disabled:hover:bg-transparent';

/** Título grande da etapa + explicação curta. */
export function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="mb-6">
      <h2 className="text-2xl font-bold text-tx-primary">{title}</h2>
      {hint ? <p className="mt-1.5 text-base text-tx-secondary">{hint}</p> : null}
    </header>
  );
}

function YesNo({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={label}>
      {[
        { option: false, text: 'Não' },
        { option: true, text: 'Sim' },
      ].map(({ option, text }) => (
        <button
          key={text}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'h-12 rounded-xl border-2 text-base font-bold transition-colors',
            value === option
              ? 'border-primary bg-primary/10 text-primary dark:text-blue-300'
              : 'border-border-default text-tx-primary hover:bg-bg-hover',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h3 className="text-lg font-bold text-tx-primary">{title}</h3>
        {hint ? <p className="text-sm text-tx-secondary">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ── 1. Nome ───────────────────────────────────────────────────────────────────

export function NameStep({ builder }: { builder: Builder }) {
  const { draft, setDraftField } = builder;
  return (
    <>
      <StepHeading title="Qual é o nome do processo?" hint="É assim que ele vai aparecer para todo mundo." />
      <div className="grid gap-6">
        <label className="grid gap-2 text-base font-bold text-tx-primary">
          Nome
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraftField('name', event.target.value)}
            placeholder="Ex.: Pedido de compra"
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-base font-bold text-tx-primary">
          Para que serve?
          <textarea
            value={draft.description}
            onChange={(event) => setDraftField('description', event.target.value)}
            placeholder="Ex.: Para pedir a compra de materiais do setor."
            rows={4}
            className="w-full resize-none rounded-xl border border-border-default bg-bg-s2 px-4 py-3 text-base font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary"
          />
        </label>
      </div>
    </>
  );
}

// ── 2. Perguntas ──────────────────────────────────────────────────────────────

/** Tipos oferecidos no modo simplificado, com nomes do dia a dia. */
const SIMPLE_FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
  { value: 'short_text', label: 'Resposta curta' },
  { value: 'long_text', label: 'Resposta longa' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Valor em R$' },
  { value: 'date', label: 'Data' },
  { value: 'single_select', label: 'Escolher uma opção' },
  { value: 'multi_select', label: 'Escolher várias opções' },
  { value: 'checkbox', label: 'Marcar (sim ou não)' },
  { value: 'file_upload', label: 'Anexar arquivo' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
];

function OptionsEditor({
  field,
  onChange,
}: {
  field: DraftField;
  onChange: (options: DraftField['options']) => void;
}) {
  const { options } = field;
  return (
    <div className="grid gap-2 rounded-xl bg-bg-s2 p-3">
      <p className="text-sm font-bold text-tx-secondary">Opções</p>
      {options.map((option, index) => (
        <div key={option.id} className="flex items-center gap-2">
          <input
            value={option.displayLabel}
            onChange={(event) =>
              onChange(options.map((item, i) => (i === index ? { ...item, displayLabel: event.target.value } : item)))
            }
            placeholder={`Opção ${index + 1}`}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
          />
          <button
            type="button"
            aria-label="Tirar opção"
            onClick={() => onChange(options.filter((_, i) => i !== index))}
            className={smallButtonClass}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, createDraftFieldOption(`Opção ${options.length + 1}`, options)])}
        className="inline-flex h-10 items-center gap-2 justify-self-start rounded-lg px-3 text-sm font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
      >
        <Plus className="h-4 w-4" />
        Adicionar opção
      </button>
    </div>
  );
}

export function QuestionsStep({ builder }: { builder: Builder }) {
  const { draft } = builder;
  // O modo simplificado mostra as perguntas numa lista só; cada uma continua na sua seção.
  const questions = draft.sections.flatMap((section) =>
    section.fields.map((field) => ({ sectionId: section.id, sectionSize: section.fields.length, field })),
  );
  const lastSection = draft.sections[draft.sections.length - 1];

  return (
    <>
      <StepHeading
        title="O que a pessoa precisa responder?"
        hint="Essas são as perguntas de quem abre um pedido neste processo."
      />
      <ol className="grid gap-4">
        {questions.map(({ sectionId, sectionSize, field }, index) => {
          const known = SIMPLE_FIELD_TYPES.some((type) => type.value === field.fieldType);
          return (
            <li key={field.id} className="grid gap-3 rounded-2xl border border-border-default bg-bg-surface p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
                  {index + 1}
                </span>
                <input
                  value={field.label}
                  onChange={(event) => builder.updateField(sectionId, field.id, 'label', event.target.value)}
                  placeholder="Escreva a pergunta"
                  aria-label={`Pergunta ${index + 1}`}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-border-default bg-bg-s2 px-3 text-base font-semibold text-tx-primary outline-none focus:border-primary"
                />
                <button
                  type="button"
                  aria-label="Apagar pergunta"
                  title={sectionSize <= 1 ? 'Precisa ter pelo menos uma pergunta' : 'Apagar pergunta'}
                  disabled={sectionSize <= 1}
                  onClick={() => builder.removeField(sectionId, field.id)}
                  className={smallButtonClass}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pl-11">
                <select
                  value={field.fieldType}
                  aria-label="Tipo de resposta"
                  onChange={(event) => builder.updateField(sectionId, field.id, 'fieldType', event.target.value as FormFieldType)}
                  className="h-10 min-w-0 rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
                >
                  {known ? null : (
                    <option value={field.fieldType}>{fieldTypeChoiceLabel(field.fieldType, field.settingsJson)}</option>
                  )}
                  {SIMPLE_FIELD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-tx-primary">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => builder.updateField(sectionId, field.id, 'required', event.target.checked)}
                    className="h-5 w-5 accent-primary"
                  />
                  Resposta obrigatória
                </label>
              </div>

              {supportsOptions(field.fieldType) && field.fieldType !== 'product_table' ? (
                <div className="pl-11">
                  <OptionsEditor
                    field={field}
                    onChange={(options) => builder.updateField(sectionId, field.id, 'options', options)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {lastSection ? (
        <button
          type="button"
          onClick={() => builder.addField(lastSection.id, 'short_text')}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong text-base font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
        >
          <Plus className="h-5 w-5" />
          Adicionar pergunta
        </button>
      ) : null}
    </>
  );
}

// ── 3. Responsáveis ───────────────────────────────────────────────────────────

export function OwnersStep({ builder }: { builder: Builder }) {
  return (
    <>
      <StepHeading
        title="Quem cuida deste processo?"
        hint="Essas pessoas veem todos os pedidos deste processo. Se não souber agora, pode pular."
      />
      <FormAssigneesPicker
        users={builder.assignableUsers}
        loading={builder.loadingAssignableUsers}
        selectedIds={builder.draft.assignedUserIds}
        onChange={(ids) => builder.setDraftField('assignedUserIds', ids)}
      />
    </>
  );
}

// ── 4. Etapas do pedido ───────────────────────────────────────────────────────

export function PhasesStep({ phases }: { phases: Phases }) {
  const list = phases.draft;
  const terminalIndex = list.findIndex((phase) => phase.isTerminal);

  function addPhase() {
    const id = phases.addPhase();
    // A nova etapa entra antes da etapa final, que continua sendo a última.
    if (terminalIndex >= 0) phases.movePhase(list.length, terminalIndex);
    return id;
  }

  if (!phases.initialized) {
    return <p className="text-base text-tx-secondary">Carregando as etapas…</p>;
  }

  return (
    <>
      <StepHeading
        title="Por quais etapas o pedido passa?"
        hint="O pedido entra na primeira etapa e vai seguindo até a última, que encerra o pedido."
      />
      <ol className="grid gap-3">
        {list.map((phase, index) => (
          <li
            key={phase.id}
            className="flex items-center gap-3 rounded-2xl border border-border-default bg-bg-surface p-3"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: phaseColorHex(phase.color) }}
            >
              {phase.isTerminal ? <Flag className="h-4 w-4" /> : index + 1}
            </span>
            <input
              value={phase.label}
              onChange={(event) => phases.updatePhase(phase.id, { ...phase, label: event.target.value })}
              placeholder="Nome da etapa"
              aria-label={`Nome da etapa ${index + 1}`}
              className="h-11 min-w-0 flex-1 rounded-lg border border-border-default bg-bg-s2 px-3 text-base font-semibold text-tx-primary outline-none focus:border-primary"
            />
            {phase.isTerminal ? (
              <span className="hidden shrink-0 rounded-full bg-bg-s3 px-2.5 py-1 text-xs font-bold text-tx-secondary sm:inline">
                Encerra o pedido
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Subir etapa"
              disabled={index === 0}
              onClick={() => phases.movePhase(index, index - 1)}
              className={smallButtonClass}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Descer etapa"
              disabled={index === list.length - 1}
              onClick={() => phases.movePhase(index, index + 1)}
              className={smallButtonClass}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Apagar etapa"
              disabled={list.length <= 1}
              onClick={() => phases.removePhase(phase.id)}
              className={smallButtonClass}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={addPhase}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong text-base font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
      >
        <Plus className="h-5 w-5" />
        Adicionar etapa
      </button>
    </>
  );
}

// ── 5. Quem faz o quê (uma tela por etapa) ───────────────────────────────────

export function PhaseDetailStep({
  phase,
  position,
  total,
  phases,
}: {
  phase: DraftKanbanPhase;
  position: number;
  total: number;
  phases: Phases;
}) {
  const update = (patch: Partial<DraftKanbanPhase>) => phases.updatePhase(phase.id, { ...phase, ...patch });
  const slaDays = phase.slaHours ? Math.max(1, Math.round(phase.slaHours / 24)) : null;

  return (
    <>
      <p className="mb-1 text-sm font-bold uppercase tracking-wide text-tx-secondary">
        Etapa {position} de {total}
      </p>
      <StepHeading title={phase.label || 'Etapa sem nome'} />
      <div className="grid gap-8">
        <Question
          title="Quem trabalha nesta etapa?"
          hint="Escolha perfis ou pessoas. Se deixar em branco, qualquer pessoa com acesso pode atuar."
        >
          <PhasePeoplePicker
            label="Quem trabalha nesta etapa"
            value={phase.actors}
            onChange={(actors) => update({ actors })}
            roleOptions={phases.roleOptions}
          />
        </Question>

        <Question title="Precisa de aprovação para seguir?" hint="Se sim, alguém precisa aprovar antes do pedido avançar.">
          <YesNo
            label="Precisa de aprovação"
            value={phase.requiresApproval}
            onChange={(requiresApproval) => update({ requiresApproval })}
          />
          {phase.requiresApproval ? (
            <div className="grid gap-2">
              <p className="text-sm font-bold text-tx-primary">Quem aprova?</p>
              <PhasePeoplePicker
                label="Quem aprova"
                value={phase.approvers}
                onChange={(approvers) => update({ approvers })}
                roleOptions={phases.roleOptions}
              />
            </div>
          ) : null}
        </Question>

        <Question title="Tem prazo?" hint="O pedido fica em alerta quando o prazo está acabando.">
          <YesNo
            label="Tem prazo"
            value={slaDays !== null}
            onChange={(hasSla) => update({ slaHours: hasSla ? 24 : null, slaBusinessHours: false })}
          />
          {slaDays !== null ? (
            <label className="flex items-center gap-3 text-base font-semibold text-tx-primary">
              <input
                type="number"
                min={1}
                value={slaDays}
                onChange={(event) => {
                  const days = Math.max(1, Math.round(Number(event.target.value) || 1));
                  update({ slaHours: days * 24 });
                }}
                className="h-12 w-24 rounded-xl border border-border-default bg-bg-s2 px-3 text-center text-base font-bold text-tx-primary outline-none focus:border-primary"
              />
              {slaDays === 1 ? 'dia' : 'dias'}
            </label>
          ) : null}
        </Question>
      </div>
    </>
  );
}
