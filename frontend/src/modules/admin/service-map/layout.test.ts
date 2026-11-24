import { describe, expect, it } from 'vitest';
import { computeLayout, EDGE_COLORS } from './layout';
import { COLUMNS, SERVICE_EDGES, SERVICES, type ServiceState } from './topology';

const allActive: Record<string, ServiceState> = Object.fromEntries(
  SERVICES.map((s) => [s.id, 'ativo' as ServiceState]),
);

function layout(statusById: Record<string, ServiceState | undefined> = allActive, selectedId: string | null = null) {
  return computeLayout(SERVICES, SERVICE_EDGES, statusById, selectedId, COLUMNS);
}

function edge(result: ReturnType<typeof layout>, source: string, target: string) {
  const found = result.edges.find((e) => e.source === source && e.target === target);
  if (!found) throw new Error(`aresta ${source} → ${target} não existe`);
  return found;
}

describe('computeLayout — grade', () => {
  it('o canvas mede 792×338 (4 colunas de 214px, 4 linhas de 84px, 26px de topo)', () => {
    const result = layout();
    expect(result.width).toBe(792);
    expect(result.height).toBe(338);
  });

  it('posiciona os nós pela coluna e linha e os títulos das colunas a cada 214px', () => {
    const result = layout();
    expect(result.nodes.find((n) => n.id === 'frontend')).toMatchObject({ x: 0, y: 26 });
    expect(result.nodes.find((n) => n.id === 'postgres')).toMatchObject({ x: 642, y: 110 });
    expect(result.nodes.find((n) => n.id === 'grafana')).toMatchObject({ x: 0, y: 278 });
    expect(result.columns).toEqual([
      { label: 'Clientes', x: 0 },
      { label: 'Aplicação', x: 214 },
      { label: 'Serviços', x: 428 },
      { label: 'Dados', x: 642 },
    ]);
  });
});

describe('computeLayout — caminhos', () => {
  it('frontend → backend: colunas vizinhas na mesma altura é uma linha reta', () => {
    const e = edge(layout(), 'frontend', 'backend');
    expect(e.d).toBe('M150 56 H214');
    expect(e.arrow).toBe('M206 51.5 L214 56 L206 60.5 Z');
  });

  it('backend → postgres: pula a coluna Serviços por uma faixa 12px acima do alvo', () => {
    expect(edge(layout(), 'backend', 'postgres').d).toBe('M364 56 H396 V98 H610 V140 H642');
  });

  it('prometheus → backend: mesma coluna, vertical do topo da origem à base do alvo, seta para cima', () => {
    const e = edge(layout(), 'prometheus', 'backend');
    expect(e.d).toBe('M289 278 V86');
    expect(e.arrow).toBe('M284 94 L289 86 L294 94 Z');
  });

  it('desloca métricas +10 e ferramentas −10 no vão compartilhado', () => {
    const result = layout();
    // Coluna vizinha com degrau: o trecho vertical fica em sx + 32 + off.
    expect(edge(result, 'postgres-exporter', 'postgres').d).toBe('M578 308 H620 V140 H642');
    // Pulando colunas: a faixa sobe off/2 e o trecho final usa tx − 32 + off.
    expect(edge(result, 'pgadmin', 'postgres').d).toBe('M150 224 H172 V93 H600 V140 H642');
    expect(edge(result, 'erp-lookup', 'erp-mysql-dev').d).toBe('M578 224 H642');
  });
});

describe('computeLayout — cor e tracejado', () => {
  it('sem problemas: azul para aplicação, âmbar para métricas, cinza para ferramentas, tudo sólido com fluxo', () => {
    const result = layout();
    expect(edge(result, 'frontend', 'backend')).toMatchObject({ stroke: EDGE_COLORS.app, dash: null, flow: true });
    expect(edge(result, 'grafana', 'prometheus')).toMatchObject({ stroke: '#F5A623', dash: null, flow: true });
    expect(edge(result, 'erp-lookup', 'erp-mysql-dev')).toMatchObject({ stroke: '#9aaabb', dash: null });
    expect(edge(result, 'frontend', 'backend').strokeWidth).toBe(1.5);
  });

  it('qualquer ponta fora do ar: vermelho tracejado e sem fluxo', () => {
    const result = layout({ ...allActive, 'evolution-api': 'falha' });
    for (const e of [edge(result, 'backend', 'evolution-api'), edge(result, 'evolution-api', 'postgres')]) {
      expect(e).toMatchObject({ stroke: '#f43f5e', dash: '5 4', flow: false });
    }
    expect(edge(result, 'backend', 'rabbitmq')).toMatchObject({ stroke: '#1A3C8F', dash: null });
  });

  it('qualquer ponta sob demanda: cinza tracejado; falha ganha de sob demanda', () => {
    const result = layout({ ...allActive, pgadmin: 'demanda', 'erp-mysql-dev': 'demanda' });
    expect(edge(result, 'pgadmin', 'postgres')).toMatchObject({ stroke: '#9aaabb', dash: '5 4', flow: false });
    expect(edge(result, 'erp-lookup', 'erp-mysql-dev')).toMatchObject({ stroke: '#9aaabb', dash: '5 4' });

    const both = layout({ ...allActive, pgadmin: 'demanda', postgres: 'falha' });
    expect(edge(both, 'pgadmin', 'postgres').stroke).toBe('#f43f5e');
  });

  it('degradado não muda a aresta', () => {
    const result = layout({ ...allActive, rabbitmq: 'degradado' });
    expect(edge(result, 'backend', 'rabbitmq')).toMatchObject({ stroke: '#1A3C8F', dash: null, flow: true });
  });
});

describe('computeLayout — seleção', () => {
  it('sem seleção, tudo com opacidade 1', () => {
    const result = layout();
    expect(result.nodes.every((n) => n.opacity === 1 && !n.dimmed)).toBe(true);
    expect(result.edges.every((e) => e.opacity === 1 && !e.highlighted)).toBe(true);
  });

  it('com o backend selecionado: arestas dele acesas e mais grossas, as outras a .18 e sem fluxo', () => {
    const result = layout(allActive, 'backend');
    expect(edge(result, 'frontend', 'backend')).toMatchObject({ opacity: 1, strokeWidth: 2, highlighted: true, flow: true });
    expect(edge(result, 'prometheus', 'backend')).toMatchObject({ opacity: 1, highlighted: true });
    expect(edge(result, 'grafana', 'prometheus')).toMatchObject({ opacity: 0.18, strokeWidth: 1.5, flow: false });
  });

  it('com o backend selecionado: nós sem ligação com ele a .4', () => {
    const result = layout(allActive, 'backend');
    const opacity = Object.fromEntries(result.nodes.map((n) => [n.id, n.opacity]));
    for (const id of ['backend', 'frontend', 'postgres', 'rabbitmq', 'evolution-api', 'erp-lookup', 'prometheus']) {
      expect(opacity[id]).toBe(1);
    }
    for (const id of ['grafana', 'pgadmin', 'postgres-exporter', 'erp-mysql-dev']) {
      expect(opacity[id]).toBe(0.4);
    }
    expect(result.nodes.find((n) => n.id === 'backend')?.selected).toBe(true);
  });
});
