import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalAuth } from '../../../app/auth-context';
import { useBrand } from '../../../brand/hooks/useBrand';
import { brandCssVars } from '../../../brand/css-vars';
import { Button, Card } from '../../../components/ui';
import {
  ErpDetailsDrawerContext,
  ErpDetailsSlotContext,
  isWideErpSection,
} from '../components/erp-details-slot';
import { ErpUnavailableDialog } from '../components/erp-unavailable-dialog';
import { PublicQuestionField } from '../components/public-question-field';
import { PublicTurnstile } from '../components/public-turnstile';
import { SectionProgressTrail } from '../components/section-progress-trail';
import { usePublicForm } from '../hooks/use-public-form';
import { getResponderIdentificationMode } from '../identification';
import {
  IdentificationGate,
  OptionalIdentification,
  RespondingAs,
} from '../components/responder-identification';


/** Separa os blocos do cartão (identificação / etapa / ações), no lugar de cartões e gradientes. */
const BLOCK_DIVIDER: CSSProperties = { borderTop: '1px solid var(--tf-border)', paddingTop: 16 };

const BUTTON: CSSProperties = { height: 36, padding: '0 18px', borderRadius: 8, fontSize: 13 };

function SuccessScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="text-center" style={{ padding: '16px 0 8px' }}>
      <div
        className="mx-auto flex items-center justify-center rounded-full font-extrabold text-white"
        style={{ width: 56, height: 56, background: 'var(--tf-accent)', fontSize: 24, marginBottom: 16 }}
      >
        ✓
      </div>
      <h2 className="font-extrabold" style={{ fontSize: 18, color: 'var(--tf-text)', margin: '0 0 8px' }}>
        Recebemos sua resposta!
      </h2>
      <p
        className="mx-auto"
        style={{ fontSize: 13, color: 'var(--tf-text-muted)', maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.6 }}
      >
        Nossa equipe vai analisar as informações e retornar em breve. Obrigado pelo contato.
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="font-bold text-white"
        style={{ ...BUTTON, background: 'var(--tf-primary)', border: 'none' }}
      >
        Responder novamente
      </button>
    </div>
  );
}

/**
 * Coluna do formulário: 720 px sozinha. Com a ficha de uma "Lista do ERP" ao lado
 * (`data-erp-side` no painel), o miolo da página cresce para 1320 px e o formulário encolhe para
 * 420 px enquanto desliza para a esquerda; a ficha ocupa o que sobra. As larguras estão escritas
 * por extenso nas classes abaixo (o Tailwind não monta classe a partir de variável).
 */
const FORM_NARROW_WIDTH = 420;
const SIDE_GAP = 16;
const ERP_SIDE_MOTION = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';
/** Largura final da ficha. Fixa durante a abertura: ela é revelada, não espremida e redesenhada. */
const ERP_SIDE_WIDTH_VAR = {
  '--erp-side-w': `calc(min(1320px, 100vw - 48px) - ${FORM_NARROW_WIDTH + SIDE_GAP}px)`,
} as CSSProperties;

export function PublicFormView({ formId }: { formId: string | undefined }) {
  const brand = useBrand();
  // Fora do sistema (link público) não há sessão; logado, a conta preenche a identificação.
  const auth = useOptionalAuth();
  const authUser = auth?.user ?? null;
  const account = useMemo(
    () => (authUser ? { fullName: authUser.fullName, email: authUser.email } : null),
    [authUser],
  );
  const {
    form,
    loading,
    submitting,
    error,
    answers,
    fieldErrors,
    answersByCode,
    pendingFiles,
    uploadProgress,
    responderName,
    responderEmail,
    identificationErrors,
    identificationRequired,
    needsIdentification,
    confirmIdentity,
    editIdentity,
    captchaSiteKey,
    captchaResetKey,
    activeSections,
    currentStep,
    totalSteps,
    isCaptchaEnabled,
    submissionCount,
    erpUnavailableMessage,
    dismissErpUnavailable,
    setResponderName,
    setResponderEmail,
    setCaptchaToken,
    setAnswer,
    toggleMultiOption,
    addFiles,
    updateFile,
    removeFile,
    submit,
    clearAnswers,
    reload,
    goToNextStep,
    goToPreviousStep,
  } = usePublicForm(formId, account);

  const prevSubmissionCountRef = useRef(submissionCount);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [erpDetailsSlot, setErpDetailsSlot] = useState<HTMLElement | null>(null);
  const [erpDrawerHost, setErpDrawerHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (submissionCount > prevSubmissionCountRef.current) {
      setJustSubmitted(true);
    }
    prevSubmissionCountRef.current = submissionCount;
  }, [submissionCount]);

  // Obrigatória: espera saber se há sessão, para quem está logado não ver a entrada piscar.
  if (loading || (identificationRequired && auth?.isAuthHydrating)) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-primary-light px-4">
        <Card className="w-full max-w-2xl">
          <p className="text-sm text-tx-secondary">Carregando formulário público...</p>
        </Card>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-primary-light px-4">
        <Card className="w-full max-w-2xl space-y-3 border-t-8 border-error">
          <h1 className="text-2xl font-extrabold">Formulário indisponível</h1>
          <p className="text-sm text-tx-secondary">
            {error ?? 'Não foi possível abrir este formulário agora.'}
          </p>
          <Button size="sm" onClick={reload}>
            Tentar novamente
          </Button>
        </Card>
      </div>
    );
  }

  const currentSection = activeSections[0] ?? null;
  // Lista do ERP + tabela larga na mesma etapa: formulário com a largura toda, ficha na gaveta.
  const wideSection =
    !justSubmitted && !needsIdentification && !!currentSection && isWideErpSection(currentSection.fields);
  // Sem as chaves (formulário antigo) o bloco aparece e é opcional, como sempre foi.
  // "Obrigatória" troca o bloco pela tela de entrada + "Respondendo como".
  const showOptionalIdentification =
    !identificationRequired && getResponderIdentificationMode(form.activeVersion.settingsJson).show;
  const description = form.description || form.activeVersion.descriptionDisplay || '';

  return (
    // Telas largas: a página tem a altura da janela e não rola; quem não couber rola dentro do
    // próprio cartão (formulário ou ficha). Telas estreitas: página comum, rolando inteira.
    <div
      className="group/form flex min-h-screen flex-col min-[1100px]:h-screen min-[1100px]:overflow-hidden"
      style={{ ...brandCssVars(brand), ...ERP_SIDE_WIDTH_VAR, background: 'var(--tf-background)' }}
    >
      <header
        className="flex shrink-0 items-center px-6"
        style={{ height: 52, background: 'var(--tf-surface)', borderBottom: '1px solid var(--tf-border)' }}
      >
        <img
          src={brand.logos.horizontalColor}
          alt={brand.company.name}
          style={{ height: 26, width: 'auto', objectFit: 'contain' }}
        />
      </header>

      <main className="flex min-h-0 flex-1 flex-col" style={{ padding: '20px 24px 0' }}>
        <div
          className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-4 transition-[max-width] ${ERP_SIDE_MOTION} ${
            wideSection ? 'max-w-[1320px]' : 'max-w-[720px] group-has-[[data-erp-side]]/form:max-w-[1320px]'
          }`}
        >
          <div className="flex min-w-0 flex-col" style={{ gap: 2 }}>
            <h1
              className="font-extrabold"
              style={{ fontSize: 20, color: 'var(--tf-primary)', margin: 0, letterSpacing: '-0.01em' }}
            >
              {form.name}
            </h1>
            {description ? (
              <p style={{ fontSize: 13, color: 'var(--tf-text-muted)', margin: 0 }}>{description}</p>
            ) : null}
          </div>
          {totalSteps > 1 && !needsIdentification ? (
            <div
              className={`max-w-[720px] transition-[max-width] ${ERP_SIDE_MOTION} group-has-[[data-erp-side]]/form:max-w-[420px]`}
            >
              <SectionProgressTrail current={currentStep} total={totalSteps} />
            </div>
          ) : null}

          {/* Formulário (720 px; 420 px com a ficha) + ficha (o resto; 0 sem ficha). Etapa com
              tabela larga: só o formulário, na largura toda (a ficha vai para a gaveta). */}
          <div
            className={`grid flex-1 items-start gap-x-0 gap-y-4 pb-4 transition-[column-gap,grid-template-columns] ${ERP_SIDE_MOTION} min-[1100px]:min-h-0 min-[1100px]:grid-rows-[minmax(0,1fr)] ${
              wideSection
                ? 'grid-cols-[minmax(0,1fr)_0px]'
                : 'grid-cols-[minmax(0,720px)_minmax(0,1fr)] group-has-[[data-erp-side]]/form:grid-cols-[minmax(0,420px)_minmax(0,1fr)] group-has-[[data-erp-side]]/form:gap-x-4'
            }`}
          >
            <section
              aria-label={form.name}
              className="col-start-1 row-start-1 flex min-w-0 flex-col min-[1100px]:max-h-full min-[1100px]:overflow-y-auto"
              style={{
                gap: 18,
                padding: 20,
                borderRadius: 14,
                background: 'var(--tf-surface)',
                boxShadow: '0 12px 28px -14px rgba(26,60,143,0.18)',
              }}
            >
              {justSubmitted ? (
                <SuccessScreen onRestart={() => setJustSubmitted(false)} />
              ) : needsIdentification ? (
                <IdentificationGate
                  name={responderName}
                  email={responderEmail}
                  errors={identificationErrors}
                  onNameChange={setResponderName}
                  onEmailChange={setResponderEmail}
                  onConfirm={confirmIdentity}
                />
              ) : currentSection ? (
                <>
                  {identificationRequired ? (
                    <RespondingAs name={responderName} email={responderEmail} onChange={editIdentity} />
                  ) : showOptionalIdentification ? (
                    <OptionalIdentification
                      name={responderName}
                      email={responderEmail}
                      errors={identificationErrors}
                      onNameChange={setResponderName}
                      onEmailChange={setResponderEmail}
                    />
                  ) : null}

                  <div
                    className="flex flex-col gap-3.5"
                    style={identificationRequired || showOptionalIdentification ? BLOCK_DIVIDER : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex shrink-0 items-center justify-center font-extrabold text-white"
                        style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--tf-primary)', fontSize: 12 }}
                      >
                        {currentStep + 1}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        {/* Laranja escuro: o amarelo da marca some em texto tão pequeno. */}
                        <span
                          className="font-extrabold uppercase"
                          style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--tf-warning)' }}
                        >
                          Etapa {currentStep + 1} de {totalSteps}
                        </span>
                        <h2 className="font-bold" style={{ fontSize: 15, color: 'var(--tf-text)', margin: 0 }}>
                          {currentSection.title}
                        </h2>
                      </div>
                    </div>
                    {currentSection.description ? (
                      <p style={{ fontSize: 13, color: 'var(--tf-text-muted)', margin: 0, lineHeight: 1.5 }}>
                        {currentSection.description}
                      </p>
                    ) : null}

                    <ErpDetailsSlotContext.Provider value={erpDetailsSlot}>
                      <ErpDetailsDrawerContext.Provider value={wideSection ? erpDrawerHost : null}>
                        <div className="grid gap-3.5">
                          {currentSection.fields.map((field) => (
                            <PublicQuestionField
                              key={field.id}
                              field={field}
                              formId={form.id}
                              answersByCode={answersByCode}
                              value={answers[field.id] ?? null}
                              error={fieldErrors[field.id]}
                              pendingFiles={pendingFiles[field.id]}
                              onChange={(value) => setAnswer(field.id, value)}
                              onToggleMulti={(optionValue, checked) =>
                                toggleMultiOption(field.id, optionValue, checked)
                              }
                              onAddFiles={(uploads) => addFiles(field.id, uploads)}
                              onUpdateFile={(uploadId, patch) => updateFile(field.id, uploadId, patch)}
                              onRemoveFile={(index) => removeFile(field.id, index)}
                            />
                          ))}
                        </div>
                      </ErpDetailsDrawerContext.Provider>
                    </ErpDetailsSlotContext.Provider>

                    {uploadProgress ? (
                      <p className="font-semibold" style={{ fontSize: 13, color: 'var(--tf-primary)', margin: 0 }}>
                        Enviando anexos... {uploadProgress.done}/{uploadProgress.total}
                      </p>
                    ) : null}

                    {isCaptchaEnabled ? (
                      <div className="grid gap-1.5">
                        <span
                          className="font-bold uppercase"
                          style={{ fontSize: 11, letterSpacing: '0.05em', color: 'var(--tf-text-muted)' }}
                        >
                          Verificação anti-bot
                        </span>
                        <PublicTurnstile
                          siteKey={captchaSiteKey}
                          resetKey={captchaResetKey}
                          onVerify={setCaptchaToken}
                          onExpire={() => setCaptchaToken(null)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3" style={BLOCK_DIVIDER}>
                    <button
                      type="button"
                      onClick={clearAnswers}
                      disabled={submitting}
                      className="font-semibold text-[color:var(--tf-text-muted)] underline transition-colors hover:text-[color:var(--tf-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: 12 }}
                    >
                      Limpar respostas
                    </button>
                    <div className="ml-auto flex flex-wrap gap-2">
                      {currentStep > 0 ? (
                        <button
                          type="button"
                          onClick={goToPreviousStep}
                          disabled={submitting}
                          className="font-bold disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            ...BUTTON,
                            background: 'var(--tf-surface)',
                            color: 'var(--tf-primary)',
                            border: '1px solid var(--tf-primary)',
                          }}
                        >
                          Voltar
                        </button>
                      ) : null}
                      {currentStep < totalSteps - 1 ? (
                        <button
                          type="button"
                          onClick={goToNextStep}
                          disabled={submitting}
                          className="font-bold disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ ...BUTTON, background: 'var(--tf-primary)', color: '#fff', border: 'none' }}
                        >
                          Continuar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={submit}
                          disabled={submitting || !!uploadProgress}
                          className="font-bold transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ ...BUTTON, background: 'var(--tf-secondary)', color: 'var(--tf-text)', border: 'none' }}
                        >
                          {uploadProgress
                            ? 'Enviando anexos...'
                            : submitting
                              ? 'Enviando...'
                              : 'Enviar resposta'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--tf-text-muted)', margin: 0 }}>
                  Nenhuma seção disponível para responder.
                </p>
              )}
            </section>

            <aside
              aria-label="Detalhes do item escolhido"
              className="col-start-2 row-start-1 min-w-0 overflow-x-clip min-[1100px]:h-full"
            >
              {/* ErpLookupField desenha a ficha aqui (portal), na altura da coluna: a página não
                  rola, então a ficha também não pode passar dela. */}
              <div
                ref={setErpDetailsSlot}
                className="min-[1100px]:h-full"
                style={{ width: 'var(--erp-side-w)' }}
              />
            </aside>
          </div>
        </div>
      </main>

      {/* Gaveta da ficha (etapa com tabela larga): dentro da página para herdar as cores --tf-*. */}
      <div ref={setErpDrawerHost} />

      {erpUnavailableMessage ? (
        <ErpUnavailableDialog
          message={erpUnavailableMessage}
          retrying={submitting}
          onClose={dismissErpUnavailable}
          onRetry={() => {
            dismissErpUnavailable();
            void submit();
          }}
        />
      ) : null}

      <footer
        className="flex shrink-0 items-center justify-center gap-1.5"
        style={{ padding: '8px 24px 12px', fontSize: 11, color: 'var(--tf-text-muted)' }}
      >
        <img src={brand.logos.icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
        <span>Formulários {brand.company.name}</span>
      </footer>
    </div>
  );
}
