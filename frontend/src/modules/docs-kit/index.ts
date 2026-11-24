export { DocBlockView, type DocBlockContext, type DocLiveRenderer } from './components/doc-blocks';
export { DocTable, type DocDensity } from './components/doc-table';
export { DocDiagram } from './diagrams/doc-diagram';
export {
  COL_X,
  type DiagramDef,
  type DiagramEdgeDef,
  type DiagramNodeDef,
  type DiagramNodeKind,
  type DiagramRegistry,
} from './diagrams/diagram.types';
export {
  buildSearchIndex,
  findArticle,
  getPopulatedGroups,
  normalize,
  searchArticles,
  type DocSearchIndex,
  type PopulatedGroup,
} from './search';
export type {
  DocArticle,
  DocBlock,
  DocCalloutTone,
  DocEndpoint,
  DocEntity,
  DocEntityColumn,
  DocGroup,
  DocSection,
  DocTabLabels,
} from './types';
export { DocsArticleView } from './views/docs-article-view';
export { DocsIndexView } from './views/docs-index-view';
