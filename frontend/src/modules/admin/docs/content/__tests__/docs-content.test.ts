import { describe, expect, it } from 'vitest';
import { COL_X } from '../../../../docs-kit';
import { TECHNICAL_DIAGRAMS } from '../../diagrams/diagram-defs';
import type { DocBlock, DocSection } from '../../../../docs-kit';
import { getPopulatedGroups } from '../../../../docs-kit';
import { DOC_ARTICLES, DOC_GROUPS, getArticle, searchTechnicalArticles } from '..';

function allBlocks(sections: DocSection[]): DocBlock[] {
  return sections.flatMap((section) => section.blocks);
}

function articleBlocks(): DocBlock[] {
  return DOC_ARTICLES.flatMap((article) => [
    ...allBlocks(article.primary),
    ...allBlocks(article.secondary ?? []),
  ]);
}

describe('catálogo da documentação', () => {
  it('não tem slugs duplicados', () => {
    const slugs = DOC_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todo artigo tem conteúdo nas duas abas', () => {
    for (const article of DOC_ARTICLES) {
      expect(article.primary.length, `${article.slug}: aba "Como funciona"`).toBeGreaterThan(0);
      expect(
        (article.secondary ?? []).length,
        `${article.slug}: aba "Referência técnica"`,
      ).toBeGreaterThan(0);
    }
  });

  it('todo artigo pertence a um grupo declarado', () => {
    const known = new Set(DOC_GROUPS.map((g) => g.id));
    for (const article of DOC_ARTICLES) {
      expect(known.has(article.group), `${article.slug}: grupo ${article.group}`).toBe(true);
    }
  });

  it('os ids de seção são únicos dentro de cada aba', () => {
    for (const article of DOC_ARTICLES) {
      for (const sections of [article.primary, article.secondary ?? []]) {
        const ids = sections.map((s) => s.id);
        expect(new Set(ids).size, `${article.slug}: ids repetidos`).toBe(ids.length);
      }
    }
  });

  it('todo diagrama referenciado existe e todo diagrama definido é usado', () => {
    const referenciados = new Set(
      articleBlocks()
        .filter((block): block is Extract<DocBlock, { kind: 'diagram' }> => block.kind === 'diagram')
        .map((block) => block.id),
    );

    for (const id of referenciados) {
      expect(TECHNICAL_DIAGRAMS[id], `diagrama inexistente: ${id}`).toBeDefined();
    }
    for (const id of Object.keys(TECHNICAL_DIAGRAMS)) {
      expect(referenciados.has(id as string), `diagrama órfão: ${id}`).toBe(true);
    }
  });

  it('os nós ficam nas colunas permitidas', () => {
    // Uma quinta coluna deixaria o grafo mais largo que a coluna do artigo, e o
    // fitView reduziria o zoom a ponto de o texto do card ficar ilegível.
    for (const [id, def] of Object.entries(TECHNICAL_DIAGRAMS)) {
      for (const node of def.nodes) {
        expect(
          (COL_X as readonly number[]).includes(node.x),
          `${id}/${node.id}: x=${node.x} fora de COL_X`,
        ).toBe(true);
      }
    }
  });

  it('os rótulos de aresta cabem no vão entre colunas', () => {
    // O vão é de 100px e o rótulo é centralizado na aresta: texto longo invade os
    // cards dos dois lados. ~14 caracteres é o limite prático a 12px.
    for (const [id, def] of Object.entries(TECHNICAL_DIAGRAMS)) {
      for (const edge of def.edges) {
        if (!edge.label) continue;
        expect(edge.label.length, `${id}/${edge.id}: "${edge.label}"`).toBeLessThanOrEqual(14);
      }
    }
  });

  it('os nós cabem na altura declarada do diagrama', () => {
    const ALTURA_NO = 82;
    for (const [id, def] of Object.entries(TECHNICAL_DIAGRAMS)) {
      const maiorY = Math.max(...def.nodes.map((n) => n.y)) + ALTURA_NO;
      expect(maiorY, `${id}: conteúdo mais alto que o container`).toBeLessThanOrEqual(def.height);
    }
  });

  it('as arestas dos diagramas apontam para nós existentes', () => {
    for (const [id, def] of Object.entries(TECHNICAL_DIAGRAMS)) {
      const nodeIds = new Set(def.nodes.map((n) => n.id));
      for (const edge of def.edges) {
        expect(nodeIds.has(edge.source), `${id}: origem ${edge.source}`).toBe(true);
        expect(nodeIds.has(edge.target), `${id}: destino ${edge.target}`).toBe(true);
      }
    }
  });

  it('campos exibidos como texto puro não carregam marcação inline', () => {
    // summary e títulos de seção não passam pelo renderizador de `código`/**negrito**.
    for (const article of DOC_ARTICLES) {
      expect(article.summary, `${article.slug}: summary`).not.toMatch(/`|\*\*/);
      for (const section of [...article.primary, ...article.secondary ?? []]) {
        expect(section.title, `${article.slug}/${section.id}`).not.toMatch(/`|\*\*/);
      }
    }
    // Cabeçalhos de tabela também são renderizados crus.
    for (const block of articleBlocks()) {
      if (block.kind === 'table') {
        for (const column of block.columns) {
          expect(column).not.toMatch(/`|\*\*/);
        }
      }
    }
  });

  it('linhas de tabela têm a mesma quantidade de colunas do cabeçalho', () => {
    for (const block of articleBlocks()) {
      if (block.kind === 'table') {
        for (const row of block.rows) {
          expect(row.length, `tabela "${block.columns.join(' | ')}"`).toBe(block.columns.length);
        }
      }
    }
  });

  it('getPopulatedGroups só devolve grupos com artigos, na ordem declarada', () => {
    const groups = getPopulatedGroups(DOC_GROUPS, DOC_ARTICLES);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.articles.length).toBeGreaterThan(0);
    }
    const ordem = DOC_GROUPS.map((g) => g.id).filter((id) => groups.some((g) => g.id === id));
    expect(groups.map((g) => g.id)).toEqual(ordem);
  });
});

describe('busca na documentação', () => {
  it('encontra por termo do corpo do texto', () => {
    const slugs = searchTechnicalArticles('idempotência').map((a) => a.slug);
    expect(slugs).toContain('fluxos');
  });

  it('ignora acentuação e caixa', () => {
    expect(searchTechnicalArticles('IDEMPOTENCIA').map((a) => a.slug)).toEqual(
      searchTechnicalArticles('idempotência').map((a) => a.slug),
    );
  });

  it('exige todos os termos', () => {
    const doisTermos = searchTechnicalArticles('escopo permissao');
    const umTermo = searchTechnicalArticles('escopo');
    expect(doisTermos.length).toBeLessThanOrEqual(umTermo.length);
  });

  it('prioriza casamento no título', () => {
    expect(searchTechnicalArticles('aprovações')[0]?.slug).toBe('aprovacoes');
  });

  it('devolve vazio para termo inexistente e para busca em branco', () => {
    expect(searchTechnicalArticles('zzzzinexistente')).toEqual([]);
    expect(searchTechnicalArticles('   ')).toEqual([]);
  });

  it('getArticle resolve por slug', () => {
    expect(getArticle('fluxos')?.title).toBe('Fluxos (motor de automação)');
    expect(getArticle('nao-existe')).toBeUndefined();
  });
});
