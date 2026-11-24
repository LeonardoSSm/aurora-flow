import { describe, expect, it } from 'vitest';
import { galoMessage, joinPt, type StatusById, stateCounts } from './summary';
import { ON_DEMAND_SERVICE_IDS, SERVICES, type ServiceState } from './topology';

/** Tudo ativo, perfis opcionais sob demanda, mais o que o teste muda. */
function statuses(over: Record<string, ServiceState> = {}): StatusById {
  return Object.fromEntries(
    SERVICES.map((s) => [s.id, over[s.id] ?? (ON_DEMAND_SERVICE_IDS.includes(s.id) ? 'demanda' : 'ativo')]),
  );
}

const DEGRADACAO = { rabbitmq: 'degradado', 'erp-lookup': 'degradado' } as const;
const FALHA = { 'evolution-api': 'falha', 'postgres-exporter': 'falha' } as const;

describe('stateCounts', () => {
  it('operação normal: "9 ativos" e "2 sob demanda", nessa ordem', () => {
    expect(stateCounts(statuses()).map((c) => c.text)).toEqual(['9 ativos', '2 sob demanda']);
  });

  it('ordem ativos, degradados, fora do ar, sob demanda; singular com 1', () => {
    const mixed = statuses({ rabbitmq: 'degradado', backend: 'falha' });
    expect(stateCounts(mixed).map((c) => c.text)).toEqual(['7 ativos', '1 degradado', '1 fora do ar', '2 sob demanda']);
  });
});

describe('galoMessage', () => {
  it('tudo ok: pose ok, citando os serviços sob demanda', () => {
    expect(galoMessage(statuses())).toEqual({
      pose: 'ok',
      title: 'Serviços principais ativos.',
      text: 'ERP de teste e pgAdmin estão sob demanda. Selecione um serviço para inspecionar suas conexões.',
    });
  });

  it('verificando: pose apresentando', () => {
    expect(galoMessage(statuses(), { checking: true })).toMatchObject({
      pose: 'apresentando',
      title: 'Verificando…',
      text: 'Conferindo os 11 containers e as conexões entre eles.',
    });
  });

  it('logo depois de verificar sem problemas: pose feliz com o número de ativos', () => {
    expect(galoMessage(statuses(), { celebrate: true })).toMatchObject({
      pose: 'feliz',
      title: 'Tudo certo por aqui!',
      text: 'Os 9 serviços principais responderam ao health check.',
    });
  });

  it('degradação: título no plural e o impacto de cada serviço', () => {
    expect(galoMessage(statuses(DEGRADACAO))).toEqual({
      pose: 'pensativo',
      title: 'Dois serviços lentos.',
      text: 'O RabbitMQ está acumulando mensagens e o erp-lookup responde devagar. O sistema segue no ar.',
    });
  });

  it('falha fora do núcleo: impacto e a garantia de que formulários continuam', () => {
    expect(galoMessage(statuses(FALHA))).toEqual({
      pose: 'pensativo',
      title: 'Dois serviços fora do ar.',
      text:
        'As notificações por WhatsApp pararam e o Grafana está sem métricas do banco. Formulários e aprovações continuam funcionando.',
    });
  });

  it('banco fora: sem a frase de que formulários continuam; impactos repetidos aparecem uma vez', () => {
    const message = galoMessage(statuses({ postgres: 'falha', backend: 'falha' }));
    expect(message.title).toBe('Dois serviços fora do ar.');
    expect(message.text).toBe('O sistema está indisponível.');
  });

  it('falha e degradação juntas: a falha manda no título', () => {
    const message = galoMessage(statuses({ ...FALHA, rabbitmq: 'degradado' }));
    expect(message.title).toBe('Dois serviços fora do ar.');
    expect(message.text).toContain('Além disso, o RabbitMQ está acumulando mensagens.');
  });

  it('um serviço só: singular', () => {
    expect(galoMessage(statuses({ 'evolution-api': 'falha' })).title).toBe('Um serviço fora do ar.');
    expect(galoMessage(statuses({ rabbitmq: 'degradado' })).title).toBe('Um serviço lento.');
  });
});

describe('joinPt', () => {
  it('junta com vírgula e "e"', () => {
    expect(joinPt(['a'])).toBe('a');
    expect(joinPt(['a', 'b'])).toBe('a e b');
    expect(joinPt(['a', 'b', 'c'])).toBe('a, b e c');
  });
});
