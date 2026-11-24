import { SERVICES, type ServiceState } from './topology';

/** Rótulo e cores de cada estado (README do handoff, tabelas "Nó" e "Detalhes"). */
export const STATE_META: Record<
  ServiceState,
  { label: string; dot: string; badgeBg: string; badgeFg: string; singular: string; plural: string }
> = {
  ativo: { label: 'Ativo', dot: '#10b981', badgeBg: '#d1fae5', badgeFg: '#065f46', singular: 'ativo', plural: 'ativos' },
  demanda: { label: 'Sob demanda', dot: '#9aaabb', badgeBg: '#f0f6ff', badgeFg: '#6b7a8d', singular: 'sob demanda', plural: 'sob demanda' },
  degradado: { label: 'Degradado', dot: '#f59e0b', badgeBg: '#fef3c7', badgeFg: '#92400e', singular: 'degradado', plural: 'degradados' },
  falha: { label: 'Fora do ar', dot: '#f43f5e', badgeBg: '#ffe4e6', badgeFg: '#9f1239', singular: 'fora do ar', plural: 'fora do ar' },
};

export type StatusById = Record<string, ServiceState | undefined>;
export type MessagesById = Record<string, string | undefined>;

// ─── Contadores da barra ────────────────────────────────────────────────────────

const COUNT_ORDER: ServiceState[] = ['ativo', 'degradado', 'falha', 'demanda'];

/** "9 ativos", "1 ativo", "2 fora do ar"… só os estados com contagem > 0, nesta ordem. */
export function stateCounts(statusById: StatusById): Array<{ state: ServiceState; count: number; text: string }> {
  return COUNT_ORDER.flatMap((state) => {
    const count = SERVICES.filter((s) => statusById[s.id] === state).length;
    if (count === 0) return [];
    const meta = STATE_META[state];
    return [{ state, count, text: `${count} ${count === 1 ? meta.singular : meta.plural}` }];
  });
}

// ─── Galo Sentinela ─────────────────────────────────────────────────────────────

export type GaloPose = 'ok' | 'pensativo' | 'apresentando' | 'feliz';

export type GaloMessage = { pose: GaloPose; title: string; text: string };

/** Impacto de cada serviço em linguagem de negócio, para compor a fala do Galo. */
export const IMPACT: Record<string, { falha: string; degradado: string }> = {
  frontend: { falha: 'a tela do sistema não abre', degradado: 'a tela do sistema está lenta' },
  backend: { falha: 'o sistema está indisponível', degradado: 'a API está com pouca memória ou disco' },
  postgres: { falha: 'o sistema está indisponível', degradado: 'o banco de dados está lento' },
  rabbitmq: {
    falha: 'fluxos e notificações estão atrasados',
    degradado: 'o RabbitMQ está acumulando mensagens',
  },
  'evolution-api': {
    falha: 'as notificações por WhatsApp pararam',
    degradado: 'as notificações por WhatsApp estão lentas',
  },
  'erp-lookup': {
    falha: 'os campos Lista do ERP estão sem dados',
    degradado: 'o erp-lookup responde devagar',
  },
  'postgres-exporter': {
    falha: 'o Grafana está sem métricas do banco',
    degradado: 'as métricas do banco estão atrasadas',
  },
  prometheus: { falha: 'o Grafana está sem métricas', degradado: 'a coleta de métricas está lenta' },
  grafana: { falha: 'os painéis do Grafana estão fora do ar', degradado: 'os painéis do Grafana estão lentos' },
  pgadmin: { falha: 'o console do banco não abre', degradado: 'o console do banco está lento' },
  'erp-mysql-dev': { falha: 'o ERP de teste está fora', degradado: 'o ERP de teste está lento' },
};

/** Sem eles, nada funciona: a frase "formulários continuam funcionando" não vale. */
const CORE_SERVICE_IDS = ['frontend', 'backend', 'postgres'];

const DISPLAY_NAME: Record<string, string> = { pgadmin: 'pgAdmin', 'erp-mysql-dev': 'ERP de teste' };

const NUMBER_WORDS = ['Zero', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Onze'];

function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "a", "a e b", "a, b e c". */
export function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

function sentence(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : '';
}

function impactsOf(ids: string[], state: 'falha' | 'degradado'): string[] {
  return [...new Set(ids.map((id) => IMPACT[id]?.[state] ?? `${id} ${state === 'falha' ? 'está fora do ar' : 'está lento'}`))];
}

/**
 * Pose e fala do Galo para os estados atuais. `checking`: verificação disparada pelo
 * botão em andamento (ou a primeira carga); `celebrate`: até 4 s depois de uma
 * verificação manual sem problemas.
 */
export function galoMessage(
  statusById: StatusById,
  options: { checking?: boolean; celebrate?: boolean; unavailable?: boolean } = {},
): GaloMessage {
  if (options.checking) {
    return {
      pose: 'apresentando',
      title: 'Verificando…',
      text: `Conferindo os ${SERVICES.length} containers e as conexões entre eles.`,
    };
  }
  if (options.unavailable) {
    return {
      pose: 'pensativo',
      title: 'Não consegui verificar os serviços.',
      text: 'A checagem de status não respondeu. Tente “Verificar agora” em instantes.',
    };
  }

  const idsIn = (state: ServiceState) => SERVICES.filter((s) => statusById[s.id] === state).map((s) => s.id);
  const down = idsIn('falha');
  const slow = idsIn('degradado');

  if (down.length > 0) {
    const coreDown = down.some((id) => CORE_SERVICE_IDS.includes(id));
    const parts = [sentence(joinPt(impactsOf(down, 'falha')))];
    if (slow.length > 0) parts.push(`Além disso, ${joinPt(impactsOf(slow, 'degradado'))}.`);
    if (!coreDown) parts.push('Formulários e aprovações continuam funcionando.');
    return {
      pose: 'pensativo',
      title: `${countWord(down.length)} serviço${down.length === 1 ? '' : 's'} fora do ar.`,
      text: parts.join(' '),
    };
  }

  if (slow.length > 0) {
    return {
      pose: 'pensativo',
      title: `${countWord(slow.length)} serviço${slow.length === 1 ? ' lento' : 's lentos'}.`,
      text: `${sentence(joinPt(impactsOf(slow, 'degradado')))} O sistema segue no ar.`,
    };
  }

  const active = idsIn('ativo').length;
  if (options.celebrate) {
    return {
      pose: 'feliz',
      title: 'Tudo certo por aqui!',
      text: `Os ${active} serviços principais responderam ao health check.`,
    };
  }

  const onDemand = idsIn('demanda')
    .map((id) => DISPLAY_NAME[id] ?? id)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const onDemandText = onDemand.length
    ? `${joinPt(onDemand)} ${onDemand.length === 1 ? 'está' : 'estão'} sob demanda. `
    : '';
  return {
    pose: 'ok',
    title: 'Serviços principais ativos.',
    text: `${onDemandText}Selecione um serviço para inspecionar suas conexões.`,
  };
}

/** Há algo fora do ar ou degradado (o Galo não comemora). */
export function hasProblems(statusById: StatusById): boolean {
  return SERVICES.some((s) => statusById[s.id] === 'falha' || statusById[s.id] === 'degradado');
}
