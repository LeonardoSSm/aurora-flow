import { escapeHtml } from '../../notifications/domain/notification-template';
import {
  DEFAULT_SCORE_MARK,
  getScoreAlertSettings,
  isScoreAlertBelow,
  scoreAlertHeading,
  scoreAlertSubject,
  trimmedOrNull,
  type ScoreAlert,
  type ScoreAlertContext,
  type ScoreAlertField,
} from './score-alert';

/**
 * Versão formatada (HTML) do aviso de pontuação por e-mail: tabela com todas as seções com nota
 * (as abaixo do limite em vermelho), os resultados e o botão "Ver a resposta". O texto puro
 * (buildScoreAlertMessage) continua indo junto, para quem lê e-mail sem HTML.
 *
 * Segurança: é HTML montado pelo próprio sistema — todo texto que vem de dados (nome do formulário,
 * de quem respondeu, títulos de seção) passa por escapeHtml, e o link só entra se for http(s).
 * Estilos inline e tabelas: é o que os clientes de e-mail (Outlook, Gmail) entendem.
 */
export type ScoreOverviewRow = { label: string; value: number; limit: number | null; below: boolean };
export type ScoreOverview = { sections: ScoreOverviewRow[]; results: ScoreOverviewRow[] };

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Todas as notas do envio, com o limite de cada uma — para a tabela do e-mail. */
export function buildScoreOverview(
  fields: ScoreAlertField[],
  valueByCode: ReadonlyMap<string, number | null>,
): ScoreOverview {
  const ordered = [...fields].sort((a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order);
  const results = ordered.filter((field) => field.settingsJson?.scoreMode === 'result');
  const mark =
    results.map((field) => finite(field.settingsJson?.scoreMark)).find((value) => value !== null) ??
    DEFAULT_SCORE_MARK;

  const sections: ScoreOverviewRow[] = [];
  for (const field of ordered) {
    if (field.settingsJson?.scoreMode !== 'section') continue;
    const value = valueByCode.get(field.code) ?? null;
    if (value === null) continue;
    const limit = finite(field.settingsJson?.scoreLimit) ?? mark;
    sections.push({ label: field.sectionTitle || field.label, value, limit, below: value < limit });
  }

  const resultRows: ScoreOverviewRow[] = [];
  for (const field of results) {
    const value = valueByCode.get(field.code) ?? null;
    if (value === null) continue;
    const limit = finite(getScoreAlertSettings(field.settingsJson)?.resultBelow);
    resultRows.push({ label: field.label, value, limit, below: limit !== null && value < limit });
  }
  return { sections, results: resultRows };
}

/**
 * Identidade visual Tijuca (arte "57 anos"): azuis das ondas e o cinza do fundo. Toda cor de fundo
 * vai duas vezes — atributo `bgcolor` e `background-color` no estilo (nunca o atalho `background:`):
 * é o que sobrevive no Gmail e no Outlook, que descartam fundos declarados de outro jeito.
 */
const BRAND = {
  navy: '#17468c',
  blue: '#1f6fb6',
  sky: '#4fb0e0',
  page: '#e6e7e9',
  card: '#ffffff',
  text: '#1f2933',
  muted: '#667085',
  border: '#dfe3e8',
  headBg: '#eaf2fb',
  danger: '#b42318',
  dangerBg: '#fdecec',
  success: '#067647',
  successBg: '#ecfdf3',
} as const;

/** Arte "57 anos" de fundo — registrada em notifications/email-assets (o canal de e-mail a anexa). */
export const SCORE_ALERT_BACKGROUND_CID = 'tijuca-fundo-57anos';
/** Marca do Tijuca Flow no rodapé — também registrada em notifications/email-assets. */
export const SCORE_ALERT_LOGO_CID = 'tijuca-flow-logo';

/** Espaços invisíveis depois da prévia: sem eles, o Gmail completa a prévia com o começo do corpo. */
const PREHEADER_FILL = '&#847;&zwnj;&nbsp;'.repeat(80);

/**
 * Texto de prévia na lista da caixa de entrada (ao lado do assunto): de onde é a auditoria (a unidade,
 * ou quem respondeu) e o resultado, com os números — quem recebe entende sem abrir. Ex.: "Frango
 * Tropical: 2 seções abaixo do limite · Média de conformidade das seções 76,4% (mínimo 80%)"; sem nada
 * abaixo: "Frango Tropical: todas as seções dentro do limite · Média de conformidade das seções 92%".
 * Vai escondido no começo do HTML e também na primeira linha do texto puro — o Gmail monta a prévia
 * pelo texto puro quando ele vem junto.
 */
export function scoreAlertPreheader(
  alert: ScoreAlert,
  overview: ScoreOverview,
  who: Pick<ScoreAlertContext, 'responderName' | 'unitLabel'>,
): string {
  const name = trimmedOrNull(who.unitLabel) ?? trimmedOrNull(who.responderName) ?? 'sem identificação';
  const below = isScoreAlertBelow(alert);
  const belowCount = alert.sectionsBelow.length;
  const parts = [
    belowCount > 0
      ? `${belowCount} ${belowCount === 1 ? 'seção abaixo do limite' : 'seções abaixo do limite'}`
      : below
        ? null
        : 'todas as seções dentro do limite',
    // Com algo abaixo, só os resultados abaixo; tudo em dia, os resultados como ficaram.
    ...overview.results
      .filter((row) => row.below || !below)
      .map((row) => {
        const label = row.label.replace(/\s*\(%\)\s*$/, '');
        return `${label} ${percent(row.value)}${row.limit === null ? '' : ` (mínimo ${percent(row.limit)})`}`;
      }),
  ].filter(Boolean);
  return `${name}: ${parts.join(' · ')}`;
}

function percent(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function safeLink(link: string | null): string | null {
  return link && /^https?:\/\//i.test(link) ? link : null;
}

/** Célula com fundo à prova de cliente de e-mail. */
function bg(color: string): string {
  return `bgcolor="${color}" style="background-color:${color};`;
}

function rowHtml(row: ScoreOverviewRow): string {
  const fill = row.below ? BRAND.dangerBg : BRAND.card;
  const valueColor = row.below ? BRAND.danger : BRAND.text;
  // Três colunas cabem no celular: o "abaixo" vai pequeno embaixo da nota (a linha já fica em vermelho).
  const below = row.below
    ? `<br><span style="font-size:11px;font-weight:bold;text-transform:uppercase">abaixo</span>`
    : '';
  const cell = `padding:9px 8px;border-bottom:1px solid ${BRAND.border};`;
  return `<tr>
<td ${bg(fill)}${cell}color:${BRAND.text}">${escapeHtml(row.label)}</td>
<td align="right" ${bg(fill)}${cell}color:${valueColor};font-weight:bold;white-space:nowrap">${percent(row.value)}${below}</td>
<td align="right" ${bg(fill)}${cell}color:${BRAND.muted};white-space:nowrap">${row.limit === null ? '—' : percent(row.limit)}</td>
</tr>`;
}

function tableHtml(title: string, firstColumn: string, limitColumn: string, rows: ScoreOverviewRow[]): string {
  if (rows.length === 0) return '';
  const head = `padding:8px;color:${BRAND.navy};font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BRAND.blue};`;
  return `<p style="margin:26px 0 8px;font-size:15px;font-weight:bold;color:${BRAND.navy}">${escapeHtml(title)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr><td ${bg(BRAND.headBg)}${head}">${escapeHtml(firstColumn)}</td><td align="right" ${bg(BRAND.headBg)}${head}">Nota</td><td align="right" ${bg(BRAND.headBg)}${head}">${escapeHtml(limitColumn)}</td></tr>
${rows.map((row) => rowHtml(row)).join('\n')}
</table>`;
}

export function buildScoreAlertEmailHtml(
  alert: ScoreAlert,
  overview: ScoreOverview,
  context: ScoreAlertContext & {
    /** cid da arte trocada na tela (`email-image-<id>`); sem ele, a arte padrão. */
    backgroundCid?: string | null;
  },
): string {
  const responder = context.responderName?.trim() ? context.responderName.trim() : 'sem identificação';
  const unit = trimmedOrNull(context.unitLabel);
  const heading = scoreAlertHeading(alert);
  const below = isScoreAlertBelow(alert);
  const when = context.submittedAt
    ? context.submittedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    : null;
  const belowCount = alert.sectionsBelow.length;
  const summary = below
    ? [
        belowCount > 0 ? `${belowCount} ${belowCount === 1 ? 'seção ficou abaixo do limite' : 'seções ficaram abaixo do limite'}` : null,
        alert.resultsBelow.length > 0 ? 'resultado abaixo do mínimo' : null,
      ]
        .filter(Boolean)
        .join(' e ')
    : 'todas as seções ficaram dentro do limite';
  // Faixa do resumo: vermelha com algo abaixo, verde com tudo em dia (envio de sempre).
  const tone = below ? { fg: BRAND.danger, bg: BRAND.dangerBg } : { fg: BRAND.success, bg: BRAND.successBg };
  const link = safeLink(context.link);
  // Botão: a cor também vai no próprio link (com borda da mesma cor) — se o fundo da célula cair,
  // continua um botão azul legível, em vez de texto branco no branco.
  const button = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px"><tr>
<td ${bg(BRAND.navy)}border-radius:8px">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;background-color:${BRAND.navy};border:1px solid ${BRAND.navy};border-radius:8px;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none">Ver a resposta</a>
</td></tr></table>`
    : '';
  // Arte atrás do cartão, embutida no próprio e-mail (o canal anexa o cid): atributo `background` +
  // `background-image`, que o Gmail mostra sem listar a imagem como anexo; sem a imagem, fica o cinza da
  // marca. A arte padrão vai puxada 140px para a esquerda (as ondas na margem, o selo "57" à direita do
  // cartão); uma arte trocada na tela vai centralizada, porque não se sabe onde fica o destaque dela.
  const customCid = context.backgroundCid && /^[a-z0-9-]+$/i.test(context.backgroundCid) ? context.backgroundCid : null;
  const art = `cid:${customCid ?? SCORE_ALERT_BACKGROUND_CID}`;
  const position = customCid ? 'center top' : '-140px top';
  const backdrop = `background="${art}" ${bg(BRAND.page)}background-image:url('${art}');background-size:cover;background-position:${position};background-repeat:no-repeat;`;
  // Marca do Tijuca Flow num selo branco (fundo de célula, como a arte: o Gmail não a lista como anexo).
  const logo = `cid:${SCORE_ALERT_LOGO_CID}`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(scoreAlertSubject(alert, context))}</title></head>
<body ${bg(BRAND.page)}margin:0;padding:0">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${BRAND.page}">${escapeHtml(scoreAlertPreheader(alert, overview, context))}${PREHEADER_FILL}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" ${backdrop}padding:56px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:Arial,Helvetica,sans-serif">
<tr><td ${bg(BRAND.navy)}padding:20px 24px;border-radius:12px 12px 0 0">
<p style="margin:0;color:#bfe1f6;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(heading)}</p>
<p style="margin:6px 0 0;color:#ffffff;font-size:${unit ? 22 : 19}px;font-weight:bold;line-height:1.3">${escapeHtml(unit ?? context.formName)}</p>
${unit ? `<p style="margin:4px 0 0;color:#d6e6f5;font-size:13px;line-height:1.4">${escapeHtml(context.formName)}</p>` : ''}
</td></tr>
<tr><td ${bg(BRAND.sky)}height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td ${bg(BRAND.card)}padding:22px 24px 26px;color:${BRAND.text};font-size:14px;line-height:1.5">
<p style="margin:0;color:${BRAND.muted}">Resposta de <strong style="color:${BRAND.text}">${escapeHtml(responder)}</strong>${when ? ` — ${escapeHtml(when)}` : ''}</p>
${summary ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td ${bg(tone.bg)}padding:11px 14px;border-left:4px solid ${tone.fg};color:${tone.fg};font-weight:bold">${escapeHtml(summary.charAt(0).toUpperCase() + summary.slice(1))}.</td></tr></table>` : ''}
${tableHtml('Notas por seção', 'Seção', 'Limite', overview.sections)}
${tableHtml('Resultado', 'Resultado', 'Mínimo', overview.results)}
${button}
</td></tr>
<tr><td ${bg(BRAND.navy)}padding:14px 24px;border-radius:0 0 12px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="color:#d6e6f5;font-size:12px;line-height:1.5">Aviso automático do Tijuca Flow<br>Tijuca Alimentos</td>
<td align="right" style="white-space:nowrap"><table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr>
<td width="36" height="36" background="${logo}" ${bg(BRAND.card)}background-image:url('${logo}');background-size:30px 30px;background-position:center;background-repeat:no-repeat;width:36px;height:36px;border-radius:9px;font-size:0;line-height:0">&nbsp;</td>
<td style="padding-left:10px;color:#ffffff;font-size:15px;font-weight:bold;white-space:nowrap">Tijuca Flow</td>
</tr></table></td>
</tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
