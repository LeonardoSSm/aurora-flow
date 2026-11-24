/**
 * Empacotamento de blocos numa grade livre de 12 colunas.
 *
 * Usado em dois lugares que precisam da mesma regra: a sugestão automática do
 * painel do formulário, que nasce sem layout salvo nenhum, e o backfill da
 * migração que introduziu a grade livre. Os dois preenchem da esquerda para a
 * direita e quebram linha quando estourariam as 12 colunas — o mesmo que uma
 * pessoa faria arrastando os blocos manualmente.
 */

export const GRID_COLS = 12;

type TamanhoPadrao = { w: number; h: number };

/** kpi é compacto (quatro por linha); os outros três formatos são gráfico, mais largos. */
const TAMANHO_PADRAO_POR_TIPO: Record<string, TamanhoPadrao> = {
  kpi: { w: 3, h: 3 },
  categorias: { w: 6, h: 5 },
  serie: { w: 6, h: 5 },
  ranking: { w: 6, h: 5 },
};

export function tamanhoPadrao(kind: string): TamanhoPadrao {
  return TAMANHO_PADRAO_POR_TIPO[kind] ?? { w: 6, h: 4 };
}

export function empacotar<T extends { kind: string }>(
  itens: T[],
): Array<T & { x: number; y: number; w: number; h: number }> {
  let x = 0;
  let y = 0;
  let alturaLinha = 0;

  return itens.map((item) => {
    const { w, h } = tamanhoPadrao(item.kind);
    if (x + w > GRID_COLS) {
      x = 0;
      y += alturaLinha;
      alturaLinha = 0;
    }
    const posicionado = { ...item, x, y, w, h };
    x += w;
    alturaLinha = Math.max(alturaLinha, h);
    return posicionado;
  });
}
