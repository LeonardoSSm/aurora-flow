import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_FORMULA_DECIMALS,
  FORMULA_FUNCTION_HINTS,
  computeCalculatedFieldValues,
  extractFormulaRefs,
  extractSumProductColumnRefs,
  formatCalculatedValue,
  getFormulaDecimals,
  getFormulaOptionScores,
  validateFormulaSource,
} from '../../forms/formula';
import {
  OptionScoresEditor,
  ScoreRangesEditor,
  type FormulaPhaseOption,
  type ScoredChoiceField,
} from './formula-score-settings';

export type { FormulaPhaseOption } from './formula-score-settings';
import type { FieldSettings, FormFieldType, ProductTableColumn } from '../../forms/types';

/** Campo de referência disponível para condições/fórmulas — inclui as colunas configuradas
 * quando é uma tabela de produtos, para o editor de fórmula oferecer atalho por coluna. */
export type FormulaAvailableField = {
  code: string;
  label: string;
  fieldType: FormFieldType;
  productTableColumns?: ProductTableColumn[];
  /** Opções das perguntas de escolha — para dar pontos a elas no cálculo. */
  options?: Array<{ internalValue: string; displayLabel: string }>;
};

export function NumberSettingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-tx-secondary">
      {label}
      <input
        type="number"
        value={value ?? ''}
        onChange={(event) => {
          const nextValue = event.target.value.trim();
          onChange(nextValue ? Number(nextValue) : undefined);
        }}
        className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
      />
    </label>
  );
}

/** Tipos que entram naturalmente em uma conta — viram atalhos no editor de fórmula. */
const NUMERIC_FIELD_TYPES: FormFieldType[] = [
  'number',
  'currency',
  'scale',
  'rating',
  'checkbox',
  'calculated',
  // Hora entra na conta em horas ("08:30" vale 8,5) — feita para DURACAO({inicio}; {fim}).
  'time',
  // Não é escalar, mas o código dela é usável dentro de SOMAPRODUTO/SOMAQUOCIENTE — ver
  // o tratamento especial no clique do atalho, logo abaixo.
  'product_table',
];

/** Perguntas de escolha: entram na conta pelos pontos das opções (settings.optionScores). */
const CHOICE_FIELD_TYPES: FormFieldType[] = ['single_select', 'multi_select'];

const FORMULA_OPERATORS = ['+', '-', '*', '/', '(', ')'];

/** Primeira DURACAO({inicio}; {fim}) da fórmula — o que o atalho do "Total de horas" edita. */
const DURATION_CALL = /DURACAO\(\s*\{([^{}]*)\}\s*[;,]\s*\{([^{}]*)\}\s*\)/i;

/**
 * "Total de horas": escolhe os dois campos de Hora e escreve a DURACAO na fórmula. O que vier em
 * volta dela (ex.: `- 1` de almoço) fica como está.
 */
function HoursBetweenPicker({
  formula,
  timeFields,
  onChangeFormula,
}: {
  formula: string;
  timeFields: FormulaAvailableField[];
  onChangeFormula: (formula: string) => void;
}) {
  const match = DURATION_CALL.exec(formula);
  const start = match?.[1].trim() ?? '';
  const end = match?.[2].trim() ?? '';

  // Escolhido só um lado, o outro já vem com o outro campo de Hora — nunca a mesma hora nos dois:
  // escolher num lado a hora que está no outro inverte os dois.
  const otherThan = (code: string) => timeFields.find((item) => item.code !== code)?.code ?? code;
  const counterpart = (chosen: string, current: string, opposite: string) =>
    current && current !== chosen ? current : opposite && opposite !== chosen ? opposite : otherThan(chosen);

  function choose(nextStart: string, nextEnd: string) {
    const call = `DURACAO({${nextStart}}; {${nextEnd}})`;
    onChangeFormula(match ? formula.replace(DURATION_CALL, call) : call);
  }

  if (timeFields.length < 2) {
    return (
      <p className="rounded-[8px] bg-bg-hover px-3 py-2.5 text-xs text-tx-secondary">
        Crie antes dois campos do tipo <strong>Hora</strong> — ex.: Hora de chegada e Hora de saída —
        e volte aqui para escolher quais entram na conta.
      </p>
    );
  }

  const select = (label: string, value: string, onChange: (code: string) => void) => (
    <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
      >
        <option value="" disabled>
          Escolha um campo de Hora
        </option>
        {timeFields.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label || item.code}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid gap-2 rounded-[8px] border border-border-strong px-3 py-2.5">
      <div className="grid gap-3 md:grid-cols-2">
        {select('Hora de início (ex.: chegada)', start, (code) => choose(code, counterpart(code, end, start)))}
        {select('Hora de fim (ex.: saída)', end, (code) => choose(counterpart(code, start, end), code))}
      </div>
      <span className="text-xs text-tx-ph">
        O resultado sai em horas, ex.: 8h30. Fim antes do início conta até o dia seguinte (22:00 →
        06:00 = 8h00). Para descontar o almoço, acrescente “- 1” no fim da fórmula.
      </span>
    </div>
  );
}

/** Chave de estado do valor de teste de uma célula (tabela + coluna) — separador que não
 * aparece em código de campo nem em nome de coluna digitado por gente. */
function testColumnKey(tableCode: string, column: string): string {
  return `${tableCode}0000${column}`;
}

/**
 * Editor da fórmula de um campo calculado: monta a expressão com atalhos para os
 * demais campos, valida enquanto se digita e simula o resultado com valores de
 * teste.
 */
export function FormulaEditor({
  fieldCode,
  settings,
  availableFields,
  onChangeSettings,
  fixedFormat = false,
  phaseOptions = null,
  sectionFieldCodes,
}: {
  fieldCode: string;
  settings: FieldSettings;
  availableFields: FormulaAvailableField[];
  onChangeSettings: (settings: FieldSettings) => void;
  /** Fase do Kanban: o resultado é sempre R$ com 2 casas — esconde casas, prefixo e sufixo. */
  fixedFormat?: boolean;
  /** Fases salvas do processo, para as faixas do resultado; null = processo ainda não salvo. */
  phaseOptions?: FormulaPhaseOption[] | null;
  /** Códigos dos campos da mesma seção do cálculo (atalho "pontuar as perguntas desta seção"). */
  sectionFieldCodes?: string[];
}) {
  const formula = settings.formula ?? '';
  const hoursFormat = settings.formulaFormat === 'hours';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [testValues, setTestValues] = useState<Record<string, string>>({});

  const knownCodes = useMemo(() => availableFields.map((item) => item.code), [availableFields]);
  const optionScores = useMemo(() => settings.optionScores ?? {}, [settings.optionScores]);
  const choiceFields = useMemo<ScoredChoiceField[]>(
    () =>
      availableFields
        .filter((item) => CHOICE_FIELD_TYPES.includes(item.fieldType))
        .map((item) => ({ code: item.code, label: item.label, options: item.options ?? [] })),
    [availableFields],
  );
  // Pergunta de escolha pontuada entra na conta como qualquer número.
  const numericFields = useMemo(
    () =>
      availableFields.filter(
        (item) =>
          NUMERIC_FIELD_TYPES.includes(item.fieldType) ||
          (CHOICE_FIELD_TYPES.includes(item.fieldType) && item.code in optionScores),
      ),
    [availableFields, optionScores],
  );
  // Um chip por coluna configurada de cada tabela de produtos disponível — sem isso, a
  // única forma de saber o nome exato de uma coluna (pro argumento em aspas do
  // SOMAPRODUTO/SOMAQUOCIENTE) é abrir o campo da tabela e ler lá.
  const productTableColumnChips = useMemo(
    () =>
      numericFields
        .filter((item) => item.fieldType === 'product_table')
        .flatMap((tableField) =>
          (tableField.productTableColumns ?? []).map((column) => ({
            key: `${tableField.code}-${column.id}`,
            snippet: `"${column.label}"`,
          })),
        ),
    [numericFields],
  );
  const usedCodes = useMemo(() => extractFormulaRefs(formula), [formula]);
  // Colunas de tabela usadas dentro de SOMAPRODUTO/SOMAQUOCIENTE — testadas por coluna,
  // não pela tabela inteira (um campo de número solto pra "a tabela" não tem sentido
  // nenhum: ela não tem um valor único, tem 0..N linhas com uma coluna cada).
  const sumProductColumnRefs = useMemo(() => extractSumProductColumnRefs(formula), [formula]);
  const tablesTestedByColumn = useMemo(
    () => new Set(sumProductColumnRefs.map((ref) => ref.tableCode)),
    [sumProductColumnRefs],
  );
  const scalarTestCodes = useMemo(
    () => usedCodes.filter((code) => !tablesTestedByColumn.has(code)),
    [usedCodes, tablesTestedByColumn],
  );
  const error = useMemo(
    () =>
      formula.trim() ? validateFormulaSource(formula, { fieldCode: fieldCode, knownCodes }) : null,
    [formula, fieldCode, knownCodes],
  );

  const testResult = useMemo(() => {
    if (error || !formula.trim()) return null;
    const scope: Record<string, unknown> = {};
    for (const code of scalarTestCodes) {
      scope[code] = testValues[code] ?? null;
    }
    for (const tableCode of tablesTestedByColumn) {
      const values: Record<string, number> = {};
      let anyFilled = false;
      for (const ref of sumProductColumnRefs) {
        if (ref.tableCode !== tableCode) continue;
        const raw = testValues[testColumnKey(tableCode, ref.column)];
        const parsed = raw ? Number(raw) : NaN;
        if (Number.isFinite(parsed)) {
          values[ref.column] = parsed;
          anyFilled = true;
        }
      }
      // Simula uma única linha de teste — o suficiente pra conferir a fórmula sem
      // precisar preencher o formulário inteiro. `null` quando nada foi digitado
      // reproduz o mesmo "fica em branco" de uma tabela nunca tocada.
      scope[tableCode] = anyFilled ? [{ produto: 'Teste', values }] : null;
    }
    const computed = computeCalculatedFieldValues(
      [
        {
          code: fieldCode,
          formula,
          decimals: getFormulaDecimals(settings),
          optionScores: getFormulaOptionScores(settings),
        },
      ],
      scope,
    );
    return computed[fieldCode] ?? null;
  }, [
    error,
    formula,
    scalarTestCodes,
    tablesTestedByColumn,
    sumProductColumnRefs,
    testValues,
    fieldCode,
    settings,
  ]);

  // Pergunta de escolha na fórmula sem pontos fica em branco na conta — quase sempre é esquecimento.
  const unscoredChoiceRefs = useMemo(
    () =>
      choiceFields.filter((item) => usedCodes.includes(item.code) && !(item.code in optionScores)),
    [choiceFields, usedCodes, optionScores],
  );

  function updateSettings(patch: Partial<FieldSettings>) {
    onChangeSettings({ ...settings, ...patch });
  }

  function insertSnippet(snippet: string) {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? formula.length;
    const end = element?.selectionEnd ?? formula.length;
    const next = `${formula.slice(0, start)}${snippet}${formula.slice(end)}`;
    updateSettings({ formula: next });
    requestAnimationFrame(() => {
      const caret = start + snippet.length;
      element?.focus();
      element?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="grid gap-3">
      {hoursFormat ? (
        <HoursBetweenPicker
          formula={formula}
          timeFields={availableFields.filter((item) => item.fieldType === 'time')}
          onChangeFormula={(next) => updateSettings({ formula: next })}
        />
      ) : null}

      <div className="grid gap-2">
        <span className="text-xs font-semibold text-tx-secondary">Fórmula</span>
        <textarea
          ref={textareaRef}
          rows={2}
          spellCheck={false}
          value={formula}
          onChange={(event) => updateSettings({ formula: event.target.value })}
          placeholder="Ex.: {quantidade} * {valor_unitario}"
          className={[
            'rounded-[8px] border bg-bg-surface px-3 py-2 font-mono text-sm text-tx-primary outline-none',
            error ? 'border-error focus:border-error' : 'border-border-strong focus:border-primary',
          ].join(' ')}
        />
        {error ? (
          <span className="text-xs font-semibold text-error">{error}</span>
        ) : (
          <span className="text-xs text-tx-ph">
            Some, subtraia, multiplique e divida entre campos. Um cálculo também pode usar o
            resultado de outro cálculo.
          </span>
        )}
        {!error && unscoredChoiceRefs.length > 0 ? (
          <span className="text-xs font-semibold text-tx-secondary">
            {unscoredChoiceRefs.map((item) => item.label || item.code).join(', ')}{' '}
            {unscoredChoiceRefs.length === 1 ? 'está' : 'estão'} na fórmula sem pontos e{' '}
            {unscoredChoiceRefs.length === 1 ? 'fica' : 'ficam'} em branco na conta — dê pontos às
            opções em “Pontos por opção”.
          </span>
        ) : null}
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-semibold text-tx-secondary">Campos disponíveis</span>
        {numericFields.length === 0 ? (
          <span className="text-xs text-tx-ph">
            Crie campos de número, valor monetário ou outro cálculo para usar aqui.
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {numericFields.map((item) => {
              const firstColumn = item.productTableColumns?.[0]?.label;
              const snippet =
                item.fieldType === 'product_table'
                  ? `SOMAPRODUTO({${item.code}}; "${firstColumn ?? 'coluna'}")`
                  : `{${item.code}}`;
              return (
                <button
                  key={item.code}
                  type="button"
                  title={snippet}
                  onClick={() => insertSnippet(snippet)}
                  className={[
                    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                    usedCodes.includes(item.code)
                      ? 'bg-primary text-white'
                      : 'bg-bg-hover text-tx-secondary hover:text-tx-primary',
                  ].join(' ')}
                >
                  {item.label || item.code}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {productTableColumnChips.length > 0 ? (
        <div className="grid gap-2">
          <span className="text-xs font-semibold text-tx-secondary">
            Colunas da tabela (clique para inserir o nome entre aspas)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {productTableColumnChips.map(({ key, snippet }) => (
              <button
                key={key}
                type="button"
                title={`Inserir ${snippet}`}
                onClick={() => insertSnippet(snippet)}
                className="rounded-full bg-bg-hover px-2.5 py-1 font-mono text-xs font-semibold text-tx-secondary hover:text-tx-primary"
              >
                {snippet}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {FORMULA_OPERATORS.map((operator) => (
          <button
            key={operator}
            type="button"
            onClick={() => insertSnippet(` ${operator} `)}
            className="h-7 w-7 rounded-[6px] bg-bg-hover font-mono text-sm font-bold text-tx-secondary hover:text-tx-primary"
          >
            {operator}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#cfdced]" />
        {FORMULA_FUNCTION_HINTS.map((fn) => (
          <button
            key={fn.name}
            type="button"
            title={fn.help}
            onClick={() => insertSnippet(fn.snippet)}
            className="h-7 rounded-[6px] bg-bg-hover px-2 font-mono text-xs font-bold text-tx-secondary hover:text-tx-primary"
          >
            {fn.name}
          </button>
        ))}
      </div>

      {fixedFormat ? null : (
        <OptionScoresEditor
          choiceFields={choiceFields}
          sectionFieldCodes={sectionFieldCodes}
          scores={optionScores}
          onScoreSection={(next, sectionCodes) =>
            updateSettings({
              optionScores: next,
              // Fórmula em branco vira a conformidade da seção; uma já escrita fica como está.
              ...(formula.trim()
                ? {}
                : {
                    formula: `CONFORMIDADE(${sectionCodes.map((code) => `{${code}}`).join('; ')})`,
                    formulaDecimals: settings.formulaDecimals ?? 1,
                    formulaSuffix: settings.formulaSuffix ?? '%',
                  }),
            })
          }
          onChange={(next) =>
            updateSettings({ optionScores: Object.keys(next).length > 0 ? next : undefined })
          }
          onUseSum={() =>
            updateSettings({
              formula: `SOMA(${choiceFields
                .filter((item) => item.code in optionScores)
                .map((item) => `{${item.code}}`)
                .join('; ')})`,
            })
          }
        />
      )}

      {fixedFormat ? null : (
        <div className={['grid gap-3', hoursFormat ? 'md:grid-cols-2' : 'md:grid-cols-3'].join(' ')}>
          {/* Em horas o resultado sai no relógio (8h30): casas decimais não se aplicam. */}
          {hoursFormat ? null : (
            <NumberSettingInput
              label="Casas decimais"
              value={settings.formulaDecimals ?? DEFAULT_FORMULA_DECIMALS}
              onChange={(value) => updateSettings({ formulaDecimals: value })}
            />
          )}
          <label className="grid gap-2 text-xs font-semibold text-tx-secondary">
            Prefixo (ex.: R$ )
            <input
              value={settings.formulaPrefix ?? ''}
              onChange={(event) =>
                updateSettings({ formulaPrefix: event.target.value || undefined })
              }
              className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold text-tx-secondary">
            Sufixo (ex.: %)
            <input
              value={settings.formulaSuffix ?? ''}
              onChange={(event) =>
                updateSettings({ formulaSuffix: event.target.value || undefined })
              }
              className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary"
            />
          </label>
        </div>
      )}

      {(scalarTestCodes.length > 0 || sumProductColumnRefs.length > 0) && !error ? (
        <div className="grid gap-2 rounded-[8px] border border-dashed border-border-strong px-3 py-2.5">
          <span className="text-xs font-semibold text-tx-secondary">
            Testar com valores de exemplo
          </span>
          {sumProductColumnRefs.length > 0 ? (
            <p className="text-[11px] text-tx-ph">
              Colunas de tabela simulam uma única linha de teste — preencha só as que quiser
              conferir.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            {scalarTestCodes.map((code) => {
              const choice = code in optionScores ? choiceFields.find((item) => item.code === code) : undefined;
              const isTime = availableFields.find((item) => item.code === code)?.fieldType === 'time';
              return (
                <label key={code} className="grid gap-1 text-[11px] font-semibold text-tx-ph">
                  {availableFields.find((item) => item.code === code)?.label ?? code}
                  {choice ? (
                    <select
                      value={testValues[code] ?? ''}
                      onChange={(event) =>
                        setTestValues((current) => ({ ...current, [code]: event.target.value }))
                      }
                      className="h-8 max-w-[180px] rounded-[6px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
                    >
                      <option value="">—</option>
                      {choice.options.map((option) => (
                        <option key={option.internalValue} value={option.internalValue}>
                          {option.displayLabel || option.internalValue}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={isTime ? 'time' : 'number'}
                      value={testValues[code] ?? ''}
                      onChange={(event) =>
                        setTestValues((current) => ({ ...current, [code]: event.target.value }))
                      }
                      className="h-8 w-24 rounded-[6px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
                    />
                  )}
                </label>
              );
            })}
            {sumProductColumnRefs.map((ref) => {
              const key = testColumnKey(ref.tableCode, ref.column);
              return (
                <label key={key} className="grid gap-1 text-[11px] font-semibold text-tx-ph">
                  {`"${ref.column}"`}
                  <input
                    type="number"
                    value={testValues[key] ?? ''}
                    onChange={(event) =>
                      setTestValues((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="h-8 w-24 rounded-[6px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
                  />
                </label>
              );
            })}
            <div className="grid gap-1 text-[11px] font-semibold text-tx-ph">
              Resultado
              <span className="flex h-8 items-center rounded-[6px] bg-primary/10 px-3 text-sm font-bold text-primary">
                {formatCalculatedValue(testResult, settings) || '—'}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {fixedFormat ? null : (
        <ScoreRangesEditor
          ranges={settings.scoreRanges ?? []}
          phaseOptions={phaseOptions}
          testValue={testResult}
          onChange={(next) => updateSettings({ scoreRanges: next.length > 0 ? next : undefined })}
        />
      )}
    </div>
  );
}
