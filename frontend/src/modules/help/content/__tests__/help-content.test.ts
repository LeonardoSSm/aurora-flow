import { describe, expect, it } from 'vitest';
import { COL_X, getPopulatedGroups, type DocBlock } from '../../../docs-kit';
import { HELP_DIAGRAMS } from '../../diagrams/help-diagrams';
import { helpArticleForRoute, helpLinkForRoute } from '../../help-routes';
import { HELP_ARTICLES, HELP_GROUPS, getHelpArticle, searchHelpArticles } from '..';

function helpBlocks(): DocBlock[] {
  return HELP_ARTICLES.flatMap((article) => article.primary.flatMap((s) => s.blocks));
}

describe('catálogo da Central de Ajuda', () => {
  it('não tem slugs duplicados', () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todo artigo tem conteúdo e pertence a um grupo declarado', () => {
    const known = new Set(HELP_GROUPS.map((g) => g.id));
    for (const article of HELP_ARTICLES) {
      expect(article.primary.length, `${article.slug}: sem conteúdo`).toBeGreaterThan(0);
      expect(known.has(article.group), `${article.slug}: grupo ${article.group}`).toBe(true);
    }
  });

  it('o manual não expõe jargão técnico ao usuário final', () => {
    // O manual é para quem usa o sistema, não para quem o mantém: nome de tabela,
    // de evento e de endpoint pertencem à documentação técnica.
    const proibidos = [
      'endpoints',
      'entities',
      'events',
      'files',
      'live',
    ] as const satisfies readonly DocBlock['kind'][];

    for (const block of helpBlocks()) {
      expect(
        proibidos.includes(block.kind as (typeof proibidos)[number]),
        `bloco "${block.kind}" não pertence ao manual do usuário`,
      ).toBe(false);
    }
  });

  it('nenhum artigo do manual declara aba secundária', () => {
    // A view do manual só passa o rótulo da aba primária; um artigo com `secondary`
    // teria conteúdo inalcançável.
    for (const article of HELP_ARTICLES) {
      expect(article.secondary, `${article.slug}`).toBeUndefined();
    }
  });

  it('campos exibidos como texto puro não carregam marcação inline', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.summary, `${article.slug}: summary`).not.toMatch(/`|\*\*/);
      for (const section of article.primary) {
        expect(section.title, `${article.slug}/${section.id}`).not.toMatch(/`|\*\*/);
      }
    }
    for (const block of helpBlocks()) {
      if (block.kind === 'table') {
        for (const column of block.columns) {
          expect(column).not.toMatch(/`|\*\*/);
        }
      }
    }
  });

  it('linhas de tabela têm a mesma quantidade de colunas do cabeçalho', () => {
    for (const block of helpBlocks()) {
      if (block.kind === 'table') {
        for (const row of block.rows) {
          expect(row.length, `tabela "${block.columns.join(' | ')}"`).toBe(block.columns.length);
        }
      }
    }
  });

  it('os grupos aparecem na ordem declarada e todos têm artigos', () => {
    const groups = getPopulatedGroups(HELP_GROUPS, HELP_ARTICLES);
    expect(groups.map((g) => g.id)).toEqual(HELP_GROUPS.map((g) => g.id));
  });
});

describe('diagramas do manual', () => {
  it('todo diagrama referenciado existe e todo diagrama definido é usado', () => {
    const referenciados = new Set(
      helpBlocks()
        .filter((b): b is Extract<DocBlock, { kind: 'diagram' }> => b.kind === 'diagram')
        .map((b) => b.id),
    );
    for (const id of referenciados) {
      expect(HELP_DIAGRAMS[id], `diagrama inexistente: ${id}`).toBeDefined();
    }
    for (const id of Object.keys(HELP_DIAGRAMS)) {
      expect(referenciados.has(id), `diagrama órfão: ${id}`).toBe(true);
    }
  });

  it('respeitam a regra de layout do docs-kit', () => {
    for (const [id, def] of Object.entries(HELP_DIAGRAMS)) {
      const nodeIds = new Set(def.nodes.map((n) => n.id));
      for (const node of def.nodes) {
        expect((COL_X as readonly number[]).includes(node.x), `${id}/${node.id}`).toBe(true);
      }
      for (const edge of def.edges) {
        expect(nodeIds.has(edge.source), `${id}: origem ${edge.source}`).toBe(true);
        expect(nodeIds.has(edge.target), `${id}: destino ${edge.target}`).toBe(true);
        if (edge.label) expect(edge.label.length, `${id}/${edge.id}`).toBeLessThanOrEqual(14);
      }
      const maiorY = Math.max(...def.nodes.map((n) => n.y)) + 82;
      expect(maiorY, `${id}: mais alto que o container`).toBeLessThanOrEqual(def.height);
    }
  });
});

describe('ajuda contextual', () => {
  it('todo destino do mapa de rotas aponta para um artigo existente', () => {
    const rotas = [
      '/inicio',
      '/dashboard',
      '/formularios',
      '/builder',
      '/respostas',
      '/registros',
      '/kanban',
      '/solicitacoes',
      '/aprovacoes',
      '/flows',
      '/integracoes',
      '/administracao',
    ];
    for (const rota of rotas) {
      const slug = helpArticleForRoute(rota);
      expect(slug, `${rota}: sem artigo mapeado`).not.toBeNull();
      expect(getHelpArticle(slug as string), `${rota} → ${slug}`).toBeDefined();
    }
  });

  it('casa por prefixo, inclusive em rotas com parâmetro', () => {
    expect(helpArticleForRoute('/kanban/abc-123')).toBe('acompanhar-solicitacoes');
    expect(helpArticleForRoute('/flows/nova')).toBe('fluxos-automaticos');
  });

  it('cai no índice quando a rota não tem artigo', () => {
    expect(helpArticleForRoute('/rota-que-nao-existe')).toBeNull();
    expect(helpLinkForRoute('/rota-que-nao-existe')).toBe('/ajuda');
    expect(helpLinkForRoute('/aprovacoes')).toBe('/ajuda/aprovar-ou-reprovar');
  });
});

describe('busca do manual', () => {
  it('encontra por termo prático', () => {
    expect(searchHelpArticles('publicar').map((a) => a.slug)).toContain('publicar-e-compartilhar');
    expect(searchHelpArticles('prazo').map((a) => a.slug)).toContain('prazos-e-sla');
  });

  it('ignora acentuação e caixa', () => {
    expect(searchHelpArticles('PERMISSAO').map((a) => a.slug)).toEqual(
      searchHelpArticles('permissão').map((a) => a.slug),
    );
  });

  it('devolve vazio para termo inexistente e busca em branco', () => {
    expect(searchHelpArticles('zzzzinexistente')).toEqual([]);
    expect(searchHelpArticles('  ')).toEqual([]);
  });
});
