import type { FieldSettings } from '../../forms/types';
import {
  effectiveSectionScores,
  scoreMarkOf,
  scoreResultMeasureOf,
  type ScoredChoiceField,
  type ScoreResultMeasure,
} from '../lib/score-fields';
import { OptionScoresEditor } from './formula-score-settings';
import { ScoreAlertEditor } from './score-alert-editor';

const INPUT_CLASS =
  'h-9 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary';

/**
 * "Pontuação da seção": a conformidade (%) das perguntas de escolha da própria seção. Só se escolhe
 * quanto vale cada opção — a fórmula é gerada ao salvar, e pergunta nova na seção entra sozinha.
 */
export function SectionScoreEditor({
  settings,
  questions,
  onChangeSettings,
}: {
  settings: FieldSettings;
  /** Perguntas de escolha da mesma seção, na ordem. */
  questions: ScoredChoiceField[];
  onChangeSettings: (settings: FieldSettings) => void;
}) {
  const scores = effectiveSectionScores(settings, questions);

  return (
    <div className="grid gap-3">
      <p className="text-xs text-tx-secondary">
        Calcula a conformidade (%) desta seção: pontos obtidos sobre o máximo possível, só nas
        perguntas respondidas. Pergunta nova na seção entra sozinha, com Sim = 1 e Não = 0.
      </p>
      <label className="grid max-w-[340px] gap-1 text-xs font-semibold text-tx-secondary">
        Limite próprio desta seção para o aviso (%)
        <input
          type="number"
          min={0}
          max={100}
          aria-label="Limite próprio da seção"
          placeholder="Vazio = marco do resultado"
          value={typeof settings.scoreLimit === 'number' ? settings.scoreLimit : ''}
          onChange={(event) => {
            const raw = event.target.value.trim();
            const limit = Number(raw.replace(',', '.'));
            onChangeSettings({ ...settings, scoreLimit: raw !== '' && Number.isFinite(limit) ? limit : undefined });
          }}
          className={INPUT_CLASS}
        />
        <span className="font-normal">
          Para seção crítica: avisa abaixo deste valor em vez do marco do &quot;Resultado da
          pontuação&quot;.
        </span>
      </label>
      {questions.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-2.5 text-xs font-semibold text-tx-secondary">
          Esta seção ainda não tem perguntas de escolha (com opções) para pontuar.
        </p>
      ) : (
        <OptionScoresEditor
          locked
          choiceFields={questions}
          scores={scores}
          onChange={(optionScores) => onChangeSettings({ ...settings, optionScores })}
        />
      )}
    </div>
  );
}

const MEASURES: Array<{ value: ScoreResultMeasure; label: string; help: string }> = [
  {
    value: 'reached',
    label: '% de seções que atingiram o marco',
    help: 'Ex.: 6 seções com nota, 4 iguais ou acima do marco → 66,7%.',
  },
  {
    value: 'average',
    label: 'Média das seções',
    help: 'Média das notas das seções com nota.',
  },
];

/**
 * "Resultado da pontuação": junta todas as "Pontuação da seção" do formulário (dos dois caminhos,
 * se houver) — seção sem nota ou não percorrida fica de fora da conta.
 */
export function ScoreResultEditor({
  fieldCode,
  settings,
  sectionScores,
  labelFieldOptions = [],
  onChangeSettings,
}: {
  fieldCode: string;
  settings: FieldSettings;
  /** As "Pontuação da seção" do formulário, na ordem. */
  sectionScores: Array<{ code: string; label: string; sectionTitle?: string }>;
  /** Perguntas que podem identificar a auditoria no aviso (ex.: a unidade). */
  labelFieldOptions?: Array<{ code: string; label: string }>;
  onChangeSettings: (settings: FieldSettings) => void;
}) {
  const measure = scoreResultMeasureOf(settings);

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-tx-secondary">O que mostrar</legend>
        {MEASURES.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm text-tx-primary">
            <input
              type="radio"
              name={`score-result-measure-${fieldCode}`}
              className="mt-1"
              checked={measure === option.value}
              onChange={() => onChangeSettings({ ...settings, scoreResultMeasure: option.value })}
            />
            <span className="grid">
              <span className="font-semibold">{option.label}</span>
              <span className="text-xs text-tx-secondary">{option.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {measure === 'reached' || settings.scoreAlert?.sectionsBelow ? (
        <label className="grid max-w-[220px] gap-1 text-xs font-semibold text-tx-secondary">
          Marco (%) — seção igual ou acima atingiu
          <input
            type="number"
            min={0}
            max={100}
            aria-label="Marco em %"
            value={scoreMarkOf(settings)}
            onChange={(event) => {
              const mark = Number(event.target.value.replace(',', '.'));
              if (event.target.value.trim() !== '' && Number.isFinite(mark)) {
                onChangeSettings({ ...settings, scoreMark: mark });
              }
            }}
            className={INPUT_CLASS}
          />
        </label>
      ) : null}

      <div className="grid gap-1.5">
        <span className="text-xs font-semibold text-tx-secondary">
          Usa {sectionScores.length} pontuaç{sectionScores.length === 1 ? 'ão' : 'ões'} de seção
        </span>
        {sectionScores.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-border-strong px-3 py-2.5 text-xs font-semibold text-tx-secondary">
            Adicione uma &quot;Pontuação da seção&quot; nas seções que devem ter nota.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sectionScores.map((score) => (
              <span
                key={score.code}
                className="rounded-full bg-bg-hover px-2.5 py-1 text-xs font-semibold text-tx-secondary"
              >
                {score.sectionTitle ?? score.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <ScoreAlertEditor settings={settings} labelFieldOptions={labelFieldOptions} onChangeSettings={onChangeSettings} />
    </div>
  );
}
