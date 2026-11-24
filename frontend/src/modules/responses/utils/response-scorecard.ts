import { extractFormulaRefs, formatCalculatedValue, getFormulaOptionScores } from '../../forms/formula';
import type { ResponseItem } from '../types';
import type { ResponseFieldMeta } from './response-formatters';

/**
 * Quadro de pontuação de uma resposta: a nota de cada seção (cálculo com pontos por opção ou
 * CONFORMIDADE) e o resultado geral (cálculo que usa as notas das seções). Tudo sai do que foi
 * gravado na submissão — o backend recalcula no envio, então é o número oficial.
 */
export type ScorecardSectionRow = {
  code: string;
  /** Nome da seção (ou do campo, quando a seção tem mais de uma nota). */
  label: string;
  value: number | null;
  formatted: string;
  /** É um % (CONFORMIDADE ou sufixo %): só aí a barra de 0 a 100 faz sentido. */
  percent: boolean;
  /** Comparação com o marco do ATINGIRAM; null quando não há marco para esta nota. */
  reachedMark: boolean | null;
  /** Modo "Pontos": "5 de 6 pontos" (null quando a nota não vem de pontos por opção). */
  pointsText: string | null;
};

export type ScorecardResultRow = {
  code: string;
  label: string;
  value: number;
  formatted: string;
  /** Modo "Pontos": "4 de 6 seções" no % de seções que atingiram o marco; null nos demais. */
  pointsText: string | null;
};

export type ResponseScorecard = {
  sections: ScorecardSectionRow[];
  results: ScorecardResultRow[];
  /** Marco do ATINGIRAM (ex.: 70), quando o formulário usa um. */
  mark: number | null;
};

const SCORE_FUNCTION = /\b(CONFORMIDADE|ATINGIRAM|MEDIAPREENCHIDOS)\s*\(/i;
const MARK_PATTERN = /\bATINGIRAM\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*;/i;

function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCalculated(meta: ResponseFieldMeta | undefined): meta is ResponseFieldMeta {
  return meta?.fieldType === 'calculated';
}

function formulaOf(meta: ResponseFieldMeta): string {
  return typeof meta.settingsJson.formula === 'string' ? meta.settingsJson.formula : '';
}

function formatCount(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** Resposta crua gravada: lista na múltipla escolha, valor interno da opção na escolha única. */
function rawAnswer(item: ResponseItem): unknown {
  return item.valueJson ?? item.valueText ?? item.valueNumber ?? item.valueBoolean;
}

/**
 * Pontos obtidos e possíveis de uma nota de seção, refeitos das respostas com os pontos do próprio
 * cálculo — a mesma regra da CONFORMIDADE no motor: pergunta em branco ou opção que "não conta"
 * fica fora; o máximo é o maior ponto da pergunta (várias marcadas: a soma dos positivos).
 */
export function sectionPoints(
  meta: ResponseFieldMeta,
  rawByCode: ReadonlyMap<string, unknown>,
): { obtained: number; possible: number } | null {
  const scores = getFormulaOptionScores(meta.settingsJson);
  if (!scores) return null;
  const refs = extractFormulaRefs(formulaOf(meta)).filter((ref) => ref in scores);
  let obtained = 0;
  let possible = 0;
  for (const code of refs.length > 0 ? refs : Object.keys(scores)) {
    const byOption = scores[code];
    const raw = rawByCode.get(code);
    const chosen = (Array.isArray(raw) ? raw : [raw]).filter(
      (value) => value !== null && value !== undefined && value !== '',
    );
    if (chosen.length === 0) continue;
    const points = Object.values(byOption).filter((value): value is number => value !== null);
    if (Array.isArray(raw)) {
      for (const value of chosen) obtained += byOption[String(value)] ?? 0;
      possible += points.filter((value) => value > 0).reduce((total, value) => total + value, 0);
      continue;
    }
    const score = byOption[String(chosen[0])];
    if (score === null) continue;
    obtained += score ?? 0;
    possible += Math.max(0, ...points);
  }
  return possible > 0 ? { obtained, possible } : null;
}

/** Respostas na ordem do formulário (seção, depois campo); campo que não existe mais vai para o fim. */
export function sortResponseItems(
  items: ResponseItem[],
  metaByCode: Record<string, ResponseFieldMeta>,
): ResponseItem[] {
  const positionOf = (item: ResponseItem) => metaByCode[item.fieldCode]?.position ?? Number.MAX_SAFE_INTEGER;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => positionOf(a.item) - positionOf(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Monta o quadro, ou `null` quando o formulário não pontua nada (um cálculo comum, como um total
 * em R$, continua só na lista de respostas).
 */
export function buildResponseScorecard(
  items: ResponseItem[],
  metaByCode: Record<string, ResponseFieldMeta>,
): ResponseScorecard | null {
  const valueByCode = new Map(items.map((item) => [item.fieldCode, numberOf(item.valueNumber)]));
  const rawByCode = new Map(items.map((item) => [item.fieldCode, rawAnswer(item)]));
  const calculated = Object.entries(metaByCode)
    .filter(([, meta]) => isCalculated(meta))
    .sort(([, a], [, b]) => (a.position ?? 0) - (b.position ?? 0));

  // Nota de seção: pontua opções (pontos no próprio cálculo) ou usa CONFORMIDADE.
  const sectionCodes = new Set(
    calculated
      .filter(([, meta]) => meta.settingsJson.optionScores || /\bCONFORMIDADE\s*\(/i.test(formulaOf(meta)))
      .map(([code]) => code),
  );
  // Resultado geral: usa as notas das seções ou as funções de pontuação sobre elas.
  const resultCodes = calculated
    .filter(([code, meta]) => {
      if (sectionCodes.has(code)) return false;
      const formula = formulaOf(meta);
      return SCORE_FUNCTION.test(formula) || extractFormulaRefs(formula).some((ref) => sectionCodes.has(ref));
    })
    .map(([code]) => code);
  if (sectionCodes.size === 0 && resultCodes.length === 0) return null;

  // Marco: o primeiro ATINGIRAM do resultado, e só para as notas que ele compara.
  let mark: number | null = null;
  const markedCodes = new Set<string>();
  for (const code of resultCodes) {
    const formula = formulaOf(metaByCode[code]);
    const match = MARK_PATTERN.exec(formula);
    if (!match) continue;
    mark ??= Number(match[1].replace(',', '.'));
    for (const ref of extractFormulaRefs(formula)) markedCodes.add(ref);
  }

  // Seção percorrida = alguma resposta dela foi gravada; as do outro caminho não aparecem.
  const answeredSections = new Set(
    items.map((item) => metaByCode[item.fieldCode]?.sectionId).filter((id): id is string => Boolean(id)),
  );
  const scoresPerSection = new Map<string, number>();
  for (const code of sectionCodes) {
    const sectionId = metaByCode[code].sectionId ?? code;
    scoresPerSection.set(sectionId, (scoresPerSection.get(sectionId) ?? 0) + 1);
  }

  const sections: ScorecardSectionRow[] = [];
  for (const [code, meta] of calculated) {
    if (!sectionCodes.has(code)) continue;
    const value = valueByCode.get(code) ?? null;
    if (value === null && !(meta.sectionId && answeredSections.has(meta.sectionId))) continue;
    const onlyScoreOfSection = (scoresPerSection.get(meta.sectionId ?? code) ?? 0) === 1;
    const points = value === null ? null : sectionPoints(meta, rawByCode);
    sections.push({
      code,
      label: (onlyScoreOfSection ? meta.sectionTitle : undefined) ?? meta.label,
      value,
      formatted: value === null ? 'Sem nota' : formatCalculatedValue(value, meta.settingsJson),
      percent: /\bCONFORMIDADE\s*\(/i.test(formulaOf(meta)) || meta.settingsJson.formulaSuffix?.trim() === '%',
      reachedMark: value === null || mark === null || !markedCodes.has(code) ? null : value >= mark,
      pointsText: points
        ? `${formatCount(points.obtained)} de ${formatCount(points.possible)} ${points.possible === 1 ? 'ponto' : 'pontos'}`
        : null,
    });
  }

  const results: ScorecardResultRow[] = [];
  for (const code of resultCodes) {
    const value = valueByCode.get(code);
    if (value === null || value === undefined) continue;
    const meta = metaByCode[code];
    // "% que atingiram o marco" em pontos = quantas seções com nota atingiram, de quantas.
    const markMatch = MARK_PATTERN.exec(formulaOf(meta));
    let pointsText: string | null = null;
    if (markMatch) {
      const resultMark = Number(markMatch[1].replace(',', '.'));
      const notas = extractFormulaRefs(formulaOf(meta))
        .map((ref) => valueByCode.get(ref) ?? null)
        .filter((nota): nota is number => nota !== null);
      if (notas.length > 0) {
        const reached = notas.filter((nota) => nota >= resultMark).length;
        pointsText = `${reached} de ${notas.length} ${notas.length === 1 ? 'seção' : 'seções'}`;
      }
    }
    results.push({ code, label: meta.label, value, formatted: formatCalculatedValue(value, meta.settingsJson), pointsText });
  }

  if (sections.length === 0 && results.length === 0) return null;
  return { sections, results, mark };
}
