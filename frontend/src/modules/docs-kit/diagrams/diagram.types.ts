/**
 * Formato dos diagramas renderizados por `DocDiagram` (@xyflow/react em modo
 * somente leitura). As posições são fixas e escritas à mão — o objetivo é um mapa
 * legível do caminho real que os dados percorrem, não um layout automático.
 *
 * REGRA DE LAYOUT: no máximo 4 colunas, sempre em `COL_X`. A coluna de conteúdo do
 * artigo tem ~1000px; um grafo mais largo faz o `fitView` reduzir o zoom e o texto
 * dos cards fica ilegível (com 5 colunas o zoom caía para 0,70 e o título do nó
 * renderizava a 9px). Precisando de mais etapas, use mais linhas — nunca uma quinta
 * coluna. O fluxo é sempre da esquerda para a direita; caminhos de volta existem
 * (retorno de decisão, consumo de fila) e são marcados com `dashed`.
 */

/** Colunas permitidas. Espaçamento = largura do nó (200) + 100 para o rótulo da aresta. */
export const COL_X = [0, 300, 600, 900] as const;

export type DiagramNodeKind =
  | 'entrada'
  | 'api'
  | 'servico'
  | 'fila'
  | 'banco'
  | 'externo'
  | 'evento'
  | 'decisao'
  | 'pessoa';

export type DiagramNodeDef = {
  id: string;
  kind: DiagramNodeKind;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
};

export type DiagramEdgeDef = {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** Caminho de exceção/falha — vermelho tracejado. */
  failure?: boolean;
  /** Caminho de volta ou opcional — tracejado, na cor neutra. */
  dashed?: boolean;
};

export type DiagramDef = {
  title: string;
  description: string;
  height: number;
  nodes: DiagramNodeDef[];
  edges: DiagramEdgeDef[];
};

/** Catálogo de diagramas de um conjunto de documentação, indexado pelo id usado nos blocos. */
export type DiagramRegistry = Record<string, DiagramDef>;
