import { ChevronDown, Eye, FileText, GitBranch, Save, SlidersHorizontal } from 'lucide-react';
import { useAutomations } from '../../automations/hooks/use-automations';
import { usePhasesDraft } from '../../kanban-phases/hooks/use-phases-draft';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModeSwitch } from '../../experience-mode/components/mode-switch';
import { setExperienceMode } from '../../experience-mode/experience-mode-store';
import { erpTableKeys, fetchErpFeatures } from '../../erp-lookup/erp-lookup-api';
import { BuilderWizardPreview } from '../components/builder-wizard-preview';
import { ProcessSettingsPanel } from '../components/process-settings-panel';
import { ProcessMapView } from '../components/process/ProcessMapView';
import { useFormBuilder } from '../hooks/use-form-builder';

/**
 * Protótipo "Processos": o Criador deixa de ser só de formulário. As fases ficam no mapa da aba
 * "Processo" e tudo se configura dentro delas (formulário, pessoas, aprovação, integrações e
 * automações). Saíram as abas Fluxo, Fases, Integrações, Automações, Perguntas padrão, Conectores
 * e Analytics.
 */
type BuilderTab = 'config' | 'process' | 'preview';

const allTabs: Array<{
  value: BuilderTab;
  label: string;
  icon: typeof SlidersHorizontal;
}> = [
  { value: 'config', label: 'Configurações', icon: SlidersHorizontal },
  { value: 'process', label: 'Processo', icon: GitBranch },
  { value: 'preview', label: 'Preview', icon: Eye },
];

function statusLabel(status?: string) {
  if (status === 'published') return 'Publicado';
  if (status === 'paused') return 'Pausado';
  if (status === 'archived') return 'Arquivado';
  if (status === 'expired') return 'Expirado';
  return 'Rascunho';
}

function HeaderTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof SlidersHorizontal;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        // `shrink-0` e `whitespace-nowrap`: dentro do contêiner rolável as abas
        // mantêm a largura, em vez de se espremerem até o rótulo quebrar.
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13px] transition-colors',
        active
          ? 'border-primary font-bold text-primary dark:border-blue-300 dark:text-blue-300'
          : 'border-transparent font-semibold text-tx-secondary hover:text-primary dark:hover:text-blue-300',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}


export function BuilderView() {
  const builder = useFormBuilder();
  const { selectedForm, selectedFormSummary, selectedFormId, saving, draft, startNewDraft, saveDraft } =
    builder;
  const phases = usePhasesDraft(selectedFormId || null);
  const navigate = useNavigate();
  // Processo já salvo abre direto no mapa; um novo começa pela identificação.
  const [tab, setTab] = useState<BuilderTab>(() => (selectedFormId ? 'process' : 'config'));

  // Chip de automações no nó: regras "ao chegar na seção", ligadas pelo id salvo da seção.
  const automations = useAutomations(selectedFormId);
  const automationCountBySectionId = useMemo(() => {
    const localIdByServerId = new Map(
      draft.sections
        .filter((section) => section.serverId)
        .map((section) => [section.serverId as string, section.id]),
    );
    const counts: Record<string, number> = {};
    for (const rule of automations.rules) {
      if (rule.trigger !== 'on_section_reached' || !rule.targetSectionId) continue;
      const sectionId = localIdByServerId.get(rule.targetSectionId);
      if (sectionId) counts[sectionId] = (counts[sectionId] ?? 0) + 1;
    }
    return counts;
  }, [automations.rules, draft.sections]);

  const title = draft.name.trim() || 'Sem título';
  const allDraftFields = useMemo(
    () =>
      draft.sections.flatMap((section) =>
        section.fields.map((field) => ({
          code: field.code,
          label: field.label || 'Campo sem rótulo',
          fieldType: field.fieldType,
          options: field.options,
          productTableColumns: field.settingsJson.productTableColumns,
        })),
      ),
    [draft.sections],
  );
  // "Tabela dinâmica do ERP" só é oferecida com ERP_TABLE_ENABLED ligado no backend.
  const erpFeatures = useQuery({
    queryKey: erpTableKeys.features(),
    queryFn: fetchErpFeatures,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Condições e fórmulas comparam o valor digitado; "Lista do ERP" guarda código + nome e a
  // tabela do ERP guarda linhas: as duas ficam de fora no v1.
  const conditionFields = useMemo(
    () =>
      allDraftFields.filter(
        (field) =>
          field.fieldType !== 'erp_lookup' &&
          field.fieldType !== 'erp_table' &&
          field.fieldType !== 'item_order',
      ),
    [allDraftFields],
  );

  // Um "Salvar" para tudo: o processo (formulário de abertura e configurações) e, se mudaram, as fases.
  async function handleSave() {
    const saved = await saveDraft();
    if (saved && phases.hasUnsavedChanges) await phases.save();
  }
  const isSaving = saving || phases.isSaving;

  // Chave "Simples": volta para o kanban do processo no modo simplificado, com as Etapas abertas.
  function backToSimple() {
    if (
      (builder.state.isDirty || phases.hasUnsavedChanges) &&
      !window.confirm('Há mudanças não salvas no processo. Sair mesmo assim?')
    ) {
      return;
    }
    setExperienceMode('simple');
    navigate(`/kanban/${selectedFormId}`, { state: { processName: title, openPhases: true } });
  }

  const isProcessTab = tab === 'process';
  const isConfigTab = tab === 'config';

  return (
    <section
      className={[
        '-m-4 bg-bg-s2 text-tx-primary md:-m-6',
        // Na aba Processo o mapa ocupa todo o resto da tela: a página tem a altura da
        // viewport (menos a faixa de 53px que o AppShell mostra no mobile) e não rola.
        isProcessTab
          ? 'flex h-[calc(100vh-53px)] flex-col overflow-hidden md:h-screen'
          : isConfigTab
            ? 'min-h-[calc(100vh-96px)] md:flex md:h-screen md:flex-col md:overflow-hidden'
            : 'min-h-[calc(100vh-96px)]',
      ].join(' ')}
    >
      <header className="sticky top-0 z-20 shrink-0 border-b border-border-strong bg-bg-surface">
        <div className="flex h-[52px] min-w-0 items-center gap-3 px-5">
          <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-primary text-white">
            <FileText className="h-4 w-4" />
          </div>
          <h1 className="min-w-0 truncate text-[15px] font-bold text-tx-primary">{title}</h1>
          <span className="shrink-0 rounded-full bg-bg-s3 px-[9px] py-[3px] text-[11px] font-bold uppercase text-tx-secondary">
            {statusLabel(selectedForm?.status ?? selectedFormSummary?.status)}
          </span>

          <div className="flex-1" />

          {selectedFormId ? (
            <ModeSwitch value="advanced" onChange={backToSimple} className="hidden sm:inline-flex" />
          ) : null}

          <button
            type="button"
            onClick={startNewDraft}
            className="h-[34px] shrink-0 rounded-[8px] px-3 text-[13px] font-bold text-tx-primary hover:bg-bg-hover"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-[34px] shrink-0 items-center gap-2 rounded-[8px] bg-primary px-3.5 text-[13px] font-bold text-white disabled:opacity-60"
          >
            <Save className="h-[15px] w-[15px]" />
            {isSaving ? 'Salvando…' : 'Salvar'}
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </button>
        </div>

        {/* `-mb-px` faz o sublinhado da aba ativa encostar na borda de baixo do header. */}
        <nav className="sidebar-scroll -mb-px flex h-10 max-w-full items-stretch gap-1 overflow-x-auto px-3.5">
          {allTabs.map((item) => (
            <HeaderTab
              key={item.value}
              active={tab === item.value}
              icon={item.icon}
              label={item.label}
              onClick={() => setTab(item.value)}
            />
          ))}
        </nav>
      </header>

      {isProcessTab ? (
        <ProcessMapView
          formId={selectedFormId || null}
          builder={builder}
          phases={phases}
          automationCountBySectionId={automationCountBySectionId}
          conditionFields={conditionFields}
          automationFields={allDraftFields}
          erpTableEnabled={erpFeatures.data?.erpTable === true}
        />
      ) : (
      <main
        className={
          isConfigTab
            ? // Configurações usa a tela toda: no desktop, colunas na altura que sobra; só rola se não couber.
              'min-h-0 flex-1 px-4 py-5 md:overflow-y-auto md:px-6'
            : 'mx-auto max-w-[1352px] px-6 pb-24 pt-9'
        }
      >
        {tab === 'config' ? (
          <ProcessSettingsPanel
            builder={builder}
            phases={phases.draft}
            onOpenProcess={() => setTab('process')}
          />
        ) : null}

        {tab === 'preview' ? (
          <section className="max-w-[1352px]">
            <BuilderWizardPreview draft={draft} />

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTab('process')}
                className="text-sm font-bold text-tx-primary"
              >
                &lt;- Processo
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="h-10 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {isSaving ? 'Salvando...' : 'Salvar rascunho'}
              </button>
            </div>
          </section>
        ) : null}
      </main>
      )}
    </section>
  );
}
