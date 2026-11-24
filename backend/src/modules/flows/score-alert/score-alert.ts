import type { NotificationChannelId } from '../../notifications/domain/notification.types';
import type { NotificationRecipientSpec } from '../types/flow.types';

/**
 * Aviso de pontuação ("Resultado da pontuação" → "Avisar quando"): no envio do formulário, avisa
 * quando alguma seção ficou abaixo do limite dela e/ou quando o resultado ficou abaixo do mínimo — ou
 * sempre, com o resultado da auditoria (`trigger: 'always'`), destacando o que ficou abaixo.
 * Uma mensagem por auditoria: alertas com o mesmo canal e os mesmos destinatários viram uma só.
 *
 * Configuração em `settingsJson`:
 * - no "Resultado da pontuação": `scoreAlert` (abaixo) e `scoreMark` (limite padrão das seções);
 * - na "Pontuação da seção": `scoreLimit` — limite próprio da seção para o aviso.
 */
export type ScoreAlertSettings = {
  enabled?: boolean;
  /** Quando mandar: só quando algo ficar abaixo (padrão) ou sempre que o formulário for respondido. */
  trigger?: 'below' | 'always';
  /** Avisar quando alguma seção ficar abaixo do limite (próprio dela, ou o marco do resultado). */
  sectionsBelow?: boolean;
  /** Avisar quando este resultado ficar abaixo deste valor (%). Vazio = não avisa pelo resultado. */
  resultBelow?: number | null;
  channel?: NotificationChannelId;
  recipients?: NotificationRecipientSpec[];
  /** Arte de fundo do e-mail só deste formulário (id em email_images); vazio = a arte geral. */
  backgroundImageId?: string | null;
  /** Pergunta que identifica a auditoria (ex.: a unidade): a resposta vai no assunto e no topo. */
  labelFieldCode?: string | null;
  /** Assunto próprio da mensagem; `{unidade}` vira a resposta da pergunta acima. Vazio = o padrão. */
  subject?: string | null;
};

export const DEFAULT_SCORE_MARK = 70;
const CHANNELS: readonly NotificationChannelId[] = ['email', 'in_app', 'whatsapp'];

/** Campo calculado da versão enviada, com o que o aviso precisa. */
export type ScoreAlertField = {
  code: string;
  label: string;
  sectionTitle: string;
  sectionOrder: number;
  order: number;
  settingsJson: Record<string, unknown> | null;
};

export type ScoreAlertItem = { label: string; value: number; limit: number };

export type ScoreAlert = {
  channel: NotificationChannelId;
  recipients: NotificationRecipientSpec[];
  sectionsBelow: ScoreAlertItem[];
  resultsBelow: ScoreAlertItem[];
  /** Arte própria do formulário (a do primeiro resultado do grupo que tiver uma), ou null = a geral. */
  backgroundImageId: string | null;
  /** Manda mesmo sem nada abaixo (resultado da auditoria). */
  always: boolean;
  /** Pergunta que identifica a auditoria (a do primeiro resultado do grupo que tiver uma). */
  labelFieldCode: string | null;
  /** Assunto próprio (o do primeiro resultado do grupo que tiver um), ou null = o padrão. */
  subject: string | null;
};

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreModeOf(field: ScoreAlertField): 'section' | 'result' | null {
  const mode = field.settingsJson?.scoreMode;
  return mode === 'section' || mode === 'result' ? mode : null;
}

/** `scoreAlert` válido e ligado, ou null. */
export function getScoreAlertSettings(settings: Record<string, unknown> | null): ScoreAlertSettings | null {
  const raw = settings?.scoreAlert;
  if (!raw || typeof raw !== 'object') return null;
  const alert = raw as ScoreAlertSettings;
  if (!alert.enabled) return null;
  if (!alert.channel || !CHANNELS.includes(alert.channel)) return null;
  if (!Array.isArray(alert.recipients) || alert.recipients.length === 0) return null;
  if (alert.trigger !== 'always' && !alert.sectionsBelow && finite(alert.resultBelow) === null) return null;
  return alert;
}

/**
 * O que avisar para um envio: um alerta por grupo (canal + destinatários), só quando há algo
 * abaixo. Seção sem nota (não percorrida ou sem resposta que conte) não entra.
 */
export function evaluateScoreAlerts(
  fields: ScoreAlertField[],
  valueByCode: ReadonlyMap<string, number | null>,
): ScoreAlert[] {
  const ordered = [...fields].sort((a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order);
  const sections = ordered.filter((field) => scoreModeOf(field) === 'section');
  const groups = new Map<string, ScoreAlert & { sectionCodes: Set<string> }>();

  for (const result of ordered) {
    if (scoreModeOf(result) !== 'result') continue;
    const alert = getScoreAlertSettings(result.settingsJson);
    if (!alert) continue;

    const key = `${alert.channel}:${JSON.stringify(alert.recipients)}`;
    const group =
      groups.get(key) ??
      {
        channel: alert.channel as NotificationChannelId,
        recipients: alert.recipients ?? [],
        sectionsBelow: [],
        resultsBelow: [],
        backgroundImageId: null,
        always: false,
        labelFieldCode: null,
        subject: null,
        sectionCodes: new Set<string>(),
      };
    groups.set(key, group);
    const always = alert.trigger === 'always';
    if (always) group.always = true;
    if (!group.labelFieldCode && typeof alert.labelFieldCode === 'string' && alert.labelFieldCode.trim()) {
      group.labelFieldCode = alert.labelFieldCode.trim();
    }
    if (!group.subject && typeof alert.subject === 'string') group.subject = trimmedOrNull(alert.subject);
    if (!group.backgroundImageId && typeof alert.backgroundImageId === 'string' && alert.backgroundImageId.trim()) {
      group.backgroundImageId = alert.backgroundImageId.trim();
    }

    // "Sempre": o resultado da auditoria também aponta as seções abaixo do limite.
    if (alert.sectionsBelow || always) {
      const mark = finite(result.settingsJson?.scoreMark) ?? DEFAULT_SCORE_MARK;
      for (const section of sections) {
        const value = valueByCode.get(section.code) ?? null;
        const limit = finite(section.settingsJson?.scoreLimit) ?? mark;
        if (value === null || value >= limit || group.sectionCodes.has(section.code)) continue;
        group.sectionCodes.add(section.code);
        group.sectionsBelow.push({ label: section.sectionTitle || section.label, value, limit });
      }
    }

    const minimum = finite(alert.resultBelow);
    const value = valueByCode.get(result.code) ?? null;
    if (minimum !== null && value !== null && value < minimum) {
      group.resultsBelow.push({ label: result.label, value, limit: minimum });
    }
  }

  return [...groups.values()]
    .filter((group) => group.always || group.sectionsBelow.length > 0 || group.resultsBelow.length > 0)
    .map(({ sectionCodes: _sectionCodes, ...alert }) => alert);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** Texto sem espaços nas pontas, ou null quando fica vazio. */
export function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Algo ficou abaixo (seção ou resultado)? */
export function isScoreAlertBelow(alert: ScoreAlert): boolean {
  return alert.sectionsBelow.length > 0 || alert.resultsBelow.length > 0;
}

/** "Auditoria abaixo do esperado" ou, no envio de sempre sem nada abaixo, "Auditoria dentro do esperado". */
export function scoreAlertHeading(alert: ScoreAlert): string {
  return isScoreAlertBelow(alert) ? 'Auditoria abaixo do esperado' : 'Auditoria dentro do esperado';
}

/**
 * Assunto da mensagem: o próprio do aviso (com `{unidade}` → a unidade, ou o nome do formulário quando
 * não há; `{formulario}` → o nome do formulário) ou o padrão "<situação> — <unidade ou formulário>".
 * Uma linha só (sem quebra) e no máximo 200 caracteres.
 */
export function scoreAlertSubject(alert: ScoreAlert, context: ScoreAlertContext): string {
  const unit = trimmedOrNull(context.unitLabel);
  const custom = trimmedOrNull(alert.subject);
  const subject = custom
    ? custom
        .replace(/\{\s*unidade\s*\}/gi, unit ?? context.formName)
        .replace(/\{\s*formul[aá]rio\s*\}/gi, context.formName)
    : `${scoreAlertHeading(alert)} — ${unit ?? context.formName}`;
  return subject.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Contexto da mensagem: formulário, quem respondeu, quando, link e o que identifica a auditoria. */
export type ScoreAlertContext = {
  formName: string;
  responderName: string | null;
  submittedAt: Date | null;
  link: string | null;
  /** Resposta da pergunta que identifica a auditoria (ex.: "Frango Tropical"), ou null. */
  unitLabel?: string | null;
};

/** Título e texto da mensagem (texto puro: vale para e-mail, WhatsApp e aviso no sistema). */
export function buildScoreAlertMessage(alert: ScoreAlert, context: ScoreAlertContext): { title: string; body: string } {
  const lines: string[] = [];
  const when = context.submittedAt
    ? context.submittedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    : null;
  const unit = trimmedOrNull(context.unitLabel);
  lines.push(unit ? `${unit} · ${context.formName}` : context.formName);
  // Nome em branco (só espaços) também cai no "sem identificação".
  const responder = context.responderName?.trim() ? context.responderName.trim() : 'sem identificação';
  lines.push(`Resposta: ${responder}${when ? ` — ${when}` : ''}`);

  if (alert.sectionsBelow.length > 0) {
    const count = alert.sectionsBelow.length;
    lines.push('', `${count} ${count === 1 ? 'seção ficou abaixo do limite' : 'seções ficaram abaixo do limite'}:`);
    for (const item of alert.sectionsBelow) {
      lines.push(`• ${item.label}: ${formatPercent(item.value)} (limite ${formatPercent(item.limit)})`);
    }
  }
  if (alert.resultsBelow.length > 0) {
    lines.push('', 'Resultado abaixo do mínimo:');
    for (const item of alert.resultsBelow) {
      lines.push(`• ${item.label}: ${formatPercent(item.value)} (mínimo ${formatPercent(item.limit)})`);
    }
  }
  if (!isScoreAlertBelow(alert)) lines.push('', 'Todas as seções dentro do limite.');
  if (context.link) lines.push('', `Ver a resposta: ${context.link}`);

  return { title: scoreAlertSubject(alert, context), body: lines.join('\n') };
}
