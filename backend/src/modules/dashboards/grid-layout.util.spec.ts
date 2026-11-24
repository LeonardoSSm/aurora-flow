import { empacotar, tamanhoPadrao, GRID_COLS } from './grid-layout.util';

/**
 * Empacotamento da grade livre.
 *
 * O que importa aqui: cada bloco recebe um tamanho coerente com o formato, o
 * empacotamento nunca estoura as 12 colunas nem sobrepõe dois blocos, e a
 * ordem de entrada decide a ordem de leitura — da esquerda para a direita,
 * quebrando linha.
 */

describe('grid-layout.util — tamanhoPadrao', () => {
  it('kpi é mais compacto que os formatos de gráfico', () => {
    const kpi = tamanhoPadrao('kpi');
    const grafico = tamanhoPadrao('categorias');
    expect(kpi.w).toBeLessThan(grafico.w);
    expect(kpi.h).toBeLessThan(grafico.h);
  });

  it('categorias, serie e ranking têm o mesmo tamanho — todos são gráfico', () => {
    expect(tamanhoPadrao('categorias')).toEqual(tamanhoPadrao('serie'));
    expect(tamanhoPadrao('categorias')).toEqual(tamanhoPadrao('ranking'));
  });

  it('formato desconhecido cai num tamanho neutro, não quebra', () => {
    expect(tamanhoPadrao('formato-inventado')).toEqual({ w: 6, h: 4 });
  });
});

describe('grid-layout.util — empacotar', () => {
  it('nunca estoura as 12 colunas', () => {
    const itens = Array.from({ length: 6 }, (_, i) => ({ kind: 'kpi', id: i }));
    const posicionados = empacotar(itens);
    for (const item of posicionados) {
      expect(item.x + item.w).toBeLessThanOrEqual(GRID_COLS);
    }
  });

  it('quebra linha quando o próximo bloco não cabe na largura restante', () => {
    // kpi tem w=3: quatro cabem numa linha de 12, o quinto tem que quebrar.
    const itens = Array.from({ length: 5 }, (_, i) => ({ kind: 'kpi', id: i }));
    const posicionados = empacotar(itens);
    expect(posicionados.slice(0, 4).every((item) => item.y === 0)).toBe(true);
    expect(posicionados[4].y).toBeGreaterThan(0);
    expect(posicionados[4].x).toBe(0);
  });

  it('a altura da próxima linha respeita o bloco mais alto da linha anterior', () => {
    // Dois gráficos (w=6, h=5) preenchem a linha toda (6+6=12); o kpi (h=3)
    // que vem depois não cabe mais e quebra — a linha nova começa depois da
    // altura do gráfico (5), não da altura do próprio kpi (3), senão os
    // gráficos ficariam com o pé cortado pelo bloco de baixo.
    const itens = [{ kind: 'categorias' }, { kind: 'categorias' }, { kind: 'kpi' }];
    const posicionados = empacotar(itens);
    expect(posicionados[2].y).toBe(5);
    expect(posicionados[2].x).toBe(0);
  });

  it('não sobrepõe nenhum par de blocos', () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({
      kind: i % 2 === 0 ? 'kpi' : 'categorias',
      id: i,
    }));
    const posicionados = empacotar(itens);

    for (let i = 0; i < posicionados.length; i++) {
      for (let j = i + 1; j < posicionados.length; j++) {
        const a = posicionados[i];
        const b = posicionados[j];
        const separadosNoX = a.x + a.w <= b.x || b.x + b.w <= a.x;
        const separadosNoY = a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(separadosNoX || separadosNoY).toBe(true);
      }
    }
  });

  it('preserva os campos originais do item, só acrescenta x/y/w/h', () => {
    const [posicionado] = empacotar([{ kind: 'kpi', id: 'abc', extra: 'valor' }]);
    expect(posicionado).toMatchObject({ id: 'abc', extra: 'valor', x: 0, y: 0 });
  });

  it('lista vazia devolve lista vazia', () => {
    expect(empacotar([])).toEqual([]);
  });
});
