import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Eye, Rocket, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { BuilderWizardPreview } from '../../builder/components/builder-wizard-preview';
import { useFormBuilder } from '../../builder/hooks/use-form-builder';
import { supportsOptions } from '../../builder/types';
import { usePhasesDraft } from '../../kanban-phases/hooks/use-phases-draft';
import { peopleCount, peopleSummary } from '../../kanban-phases/lib/phase-people';
import { phaseColorHex } from '../../kanban-phases/types';
import {
  NameStep,
  OwnersStep,
  PhaseDetailStep,
  PhasesStep,
  QuestionsStep,
  StepHeading,
} from '../components/wizard-steps';

type StepId = 'nome' | 'perguntas' | 'responsaveis' | 'etapas' | `fase:${string}` | 'revisar';

/** O que aparece na barra de progresso; as telas "fase:*" ficam todas em "Quem faz o quê". */
const GROUPS: Array<{ id: string; label: string }> = [
  { id: 'nome', label: 'Nome' },
  { id: 'perguntas', label: 'Perguntas' },
  { id: 'responsaveis', label: 'Responsáveis' },
  { id: 'etapas', label: 'Etapas' },
  { id: 'fase', label: 'Quem faz o quê' },
  { id: 'revisar', label: 'Publicar' },
];

function groupOf(step: StepId) {
  return step.startsWith('fase:') ? 'fase' : step;
}

function SideArrow({
  direction,
  label,
  onClick,
  disabled,
  highlight,
}: {
  direction: 'back' | 'next';
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  const Icon = highlight ? Rocket : direction === 'back' ? ArrowLeft : ArrowRight;
  return (
    <div className="sticky top-[40vh] hidden w-24 shrink-0 flex-col items-center gap-2 self-start md:flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          // `cn` só concatena: o tamanho sai de uma condição, sem duas classes h-* brigando.
          'grid place-items-center rounded-full shadow-soft transition-all disabled:cursor-not-allowed disabled:opacity-30',
          highlight ? 'h-20 w-20' : 'h-16 w-16',
          direction === 'next'
            ? 'bg-primary text-white hover:opacity-90'
            : 'border-2 border-border-strong bg-bg-surface text-tx-primary hover:bg-bg-hover',
        )}
      >
        <Icon className={highlight ? 'h-9 w-9' : 'h-7 w-7'} />
      </button>
      <span className="text-center text-sm font-bold text-tx-secondary">{label}</span>
    </div>
  );
}

/**
 * Modo simplificado: o Criador vira um passo a passo. Uma pergunta por tela, setas nas laterais,
 * do nome do processo até a publicação. Usa o mesmo rascunho do Criador avançado (useFormBuilder
 * + usePhasesDraft): o que se monta aqui abre igual no modo avançado.
 */
export function SimpleProcessWizard() {
  const navigate = useNavigate();
  const builder = useFormBuilder();
  const { draft, selectedFormId } = builder;
  const phases = usePhasesDraft(selectedFormId || null);
  const [current, setCurrent] = useState<StepId>('nome');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // Etapas finais só encerram o pedido: não há o que configurar nelas.
  const workPhases = useMemo(() => phases.draft.filter((phase) => !phase.isTerminal), [phases.draft]);
  const steps = useMemo<StepId[]>(
    () => [
      'nome',
      'perguntas',
      'responsaveis',
      'etapas',
      ...workPhases.map((phase) => `fase:${phase.id}` as const),
      'revisar',
    ],
    [workPhases],
  );
  // Etapa apagada enquanto se estava nela: volta para a lista de etapas.
  const step: StepId = steps.includes(current) ? current : 'etapas';
  const index = steps.indexOf(step);
  const isLast = step === 'revisar';
  const currentGroup = GROUPS.findIndex((group) => group.id === groupOf(step));

  function goTo(next: StepId) {
    setError(null);
    setCurrent(next);
    window.scrollTo({ top: 0 });
  }

  /** O que impede de avançar nesta tela (null = pode seguir). */
  function blocker(): string | null {
    if (step === 'nome') {
      if (!draft.name.trim()) return 'Escreva o nome do processo.';
      if (!draft.description.trim()) return 'Conte em uma frase para que serve o processo.';
    }
    if (step === 'perguntas') {
      const fields = draft.sections.flatMap((section) => section.fields);
      if (fields.some((field) => !field.label.trim())) return 'Tem pergunta sem texto. Escreva ou apague.';
      const noOptions = fields.find(
        (field) => supportsOptions(field.fieldType) && !field.options.some((option) => option.displayLabel.trim()),
      );
      if (noOptions) return `A pergunta "${noOptions.label}" precisa de pelo menos uma opção.`;
    }
    if (step === 'etapas' && phases.draft.some((phase) => !phase.label.trim())) {
      return 'Dê um nome para cada etapa.';
    }
    if (step.startsWith('fase:')) {
      const phase = workPhases.find((item) => `fase:${item.id}` === step);
      if (phase?.requiresApproval && peopleCount(phase.approvers) === 0) {
        return 'Escolha quem aprova, ou marque que não precisa de aprovação.';
      }
    }
    return null;
  }

  async function goNext() {
    const issue = blocker();
    if (issue) {
      setError(issue);
      return;
    }
    // As etapas só existem depois que o processo foi salvo uma vez: salva sozinho ao passar.
    if (step === 'responsaveis' && !selectedFormId) {
      setBusy(true);
      const saved = await builder.saveDraft();
      setBusy(false);
      if (!saved) return;
    }
    goTo(steps[index + 1]);
  }

  async function saveAll(): Promise<boolean> {
    const saved = await builder.saveDraft();
    if (!saved) return false;
    if (phases.hasUnsavedChanges) return phases.save();
    return true;
  }

  async function handleSaveDraft() {
    setBusy(true);
    await saveAll();
    setBusy(false);
  }

  async function handlePublish() {
    // O processo é salvo ao sair de "Responsáveis"; sem ele não há o que publicar.
    if (!selectedFormId) return;
    setBusy(true);
    try {
      if (!(await saveAll())) return;
      await builder.publish();
      setPublished(true);
    } catch {
      // publish() já avisou o erro.
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    builder.startNewDraft();
    setPublished(false);
    setShowPreview(false);
    goTo('nome');
  }

  if (builder.loadingFormDetail && selectedFormId && !draft.name) {
    return <p className="p-10 text-center text-base text-tx-secondary">Carregando o processo…</p>;
  }

  if (published) {
    const link = `${window.location.origin}/f/${selectedFormId}`;
    return (
      <div className="mx-auto grid max-w-xl justify-items-center gap-5 py-16 text-center">
        <CheckCircle2 className="h-20 w-20 text-green-600" />
        <h2 className="text-3xl font-bold text-tx-primary">Processo publicado!</h2>
        <p className="text-base text-tx-secondary">
          Já dá para abrir pedidos em <strong className="text-tx-primary">{draft.name}</strong>. Mande este link para
          quem vai usar:
        </p>
        <div className="flex w-full items-center gap-2 rounded-xl border border-border-default bg-bg-surface p-2">
          <span className="min-w-0 flex-1 truncate px-2 text-left text-sm font-semibold text-tx-primary">{link}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-white"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startAnother}
            className="h-12 rounded-xl bg-primary px-6 text-base font-bold text-white hover:opacity-90"
          >
            Criar outro processo
          </button>
          <button
            type="button"
            onClick={() => navigate('/formularios')}
            className="h-12 rounded-xl border-2 border-border-strong px-6 text-base font-bold text-tx-primary hover:bg-bg-hover"
          >
            Ver meus processos
          </button>
        </div>
      </div>
    );
  }

  const phaseIndex = workPhases.findIndex((phase) => `fase:${phase.id}` === step);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-24 md:pb-6">
      {/* Progresso: grupos já passados podem ser abertos de novo. */}
      <div className="flex items-center gap-3">
        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {GROUPS.map((group, groupIndex) => {
            const done = groupIndex < currentGroup;
            const active = groupIndex === currentGroup;
            const firstStep = steps.find((item) => groupOf(item) === group.id);
            return (
              <li key={group.id} className="flex shrink-0 items-center gap-1">
                {groupIndex > 0 ? <span className={cn('h-0.5 w-4 sm:w-8', done || active ? 'bg-primary' : 'bg-border-strong')} /> : null}
                <button
                  type="button"
                  disabled={!done || !firstStep}
                  onClick={() => firstStep && goTo(firstStep)}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 disabled:cursor-default"
                >
                  <span
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-full text-sm font-bold',
                      active
                        ? 'bg-primary text-white'
                        : done
                          ? 'bg-primary/15 text-primary dark:text-blue-300'
                          : 'bg-bg-s3 text-tx-secondary',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : groupIndex + 1}
                  </span>
                  <span
                    className={cn(
                      'hidden text-sm lg:inline',
                      active ? 'font-bold text-tx-primary' : 'font-semibold text-tx-secondary',
                    )}
                  >
                    {group.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => void handleSaveDraft()}
          disabled={busy}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold text-tx-primary hover:bg-bg-hover disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span className="hidden sm:inline">Salvar rascunho</span>
        </button>
      </div>

      <div className="flex items-stretch gap-4">
        <SideArrow direction="back" label="Voltar" onClick={() => goTo(steps[index - 1])} disabled={index === 0 || busy} />

        <section className="min-w-0 flex-1 rounded-3xl border border-border-default bg-bg-surface p-6 shadow-soft sm:p-10">
          {error ? (
            <p role="alert" className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-base font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {step === 'nome' ? <NameStep builder={builder} /> : null}
          {step === 'perguntas' ? <QuestionsStep builder={builder} /> : null}
          {step === 'responsaveis' ? <OwnersStep builder={builder} /> : null}
          {step === 'etapas' ? <PhasesStep phases={phases} /> : null}
          {phaseIndex >= 0 ? (
            <PhaseDetailStep
              key={workPhases[phaseIndex].id}
              phase={workPhases[phaseIndex]}
              position={phaseIndex + 1}
              total={workPhases.length}
              phases={phases}
            />
          ) : null}
          {isLast ? (
            <>
              <StepHeading title="Tudo pronto?" hint="Confira o resumo. Ao publicar, o processo já pode receber pedidos." />
              <dl className="grid gap-4 text-base">
                <div>
                  <dt className="text-sm font-bold text-tx-secondary">Processo</dt>
                  <dd className="font-bold text-tx-primary">{draft.name}</dd>
                  <dd className="text-tx-secondary">{draft.description}</dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-tx-secondary">Perguntas</dt>
                  <dd className="text-tx-primary">
                    {draft.sections.flatMap((section) => section.fields).map((field) => field.label).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-tx-secondary">Etapas</dt>
                  <dd>
                    <ol className="mt-1 grid gap-2">
                      {phases.draft.map((phase) => (
                        <li key={phase.id} className="flex items-center gap-2 text-tx-primary">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: phaseColorHex(phase.color) }} />
                          <span className="font-semibold">{phase.label}</span>
                          {phase.requiresApproval ? (
                            <span className="text-sm text-tx-secondary">
                              · aprovação de {peopleSummary(phase.approvers, phases.roleOptions, 'ninguém')}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => setShowPreview((value) => !value)}
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg px-3 text-base font-bold text-primary hover:bg-bg-hover dark:text-blue-300"
              >
                <Eye className="h-5 w-5" />
                {showPreview ? 'Esconder o formulário' : 'Ver como o formulário fica'}
              </button>
              {showPreview ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-border-default">
                  <BuilderWizardPreview draft={draft} />
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={busy}
                className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                <Rocket className="h-6 w-6" />
                {busy ? 'Publicando…' : 'Publicar processo'}
              </button>
            </>
          ) : null}
        </section>

        <SideArrow
          direction="next"
          label={isLast ? 'Publicar' : busy ? 'Salvando…' : 'Avançar'}
          onClick={() => void (isLast ? handlePublish() : goNext())}
          disabled={busy}
          highlight={isLast}
        />
      </div>

      {/* Celular: as setas viram uma barra fixa embaixo. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-border-default bg-bg-surface p-3 md:hidden">
        <button
          type="button"
          onClick={() => goTo(steps[index - 1])}
          disabled={index === 0 || busy}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border-strong text-base font-bold text-tx-primary disabled:opacity-30"
        >
          <ArrowLeft className="h-5 w-5" />
          Voltar
        </button>
        <button
          type="button"
          onClick={() => void (isLast ? handlePublish() : goNext())}
          disabled={busy}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white disabled:opacity-60"
        >
          {isLast ? 'Publicar' : 'Avançar'}
          {isLast ? <Rocket className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
