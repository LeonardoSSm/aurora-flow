import type { MysqlService } from '../db/mysql.service';
import { PedidosFonte } from './pedidos.fonte';

/** Intl separa "R$" do valor com espaço não separável. */
const NBSP = String.fromCharCode(160);

function criar(rows: unknown[] = []) {
  const consultar = jest.fn().mockResolvedValue(rows);
  const fonte = new PedidosFonte({ consultar } as unknown as MysqlService, 5000);
  return { fonte, consultar };
}

const PEDIDO = {
  value: 123,
  cliente: 'Mercado Bom',
  empresa: 'Tijuca Alimentos',
  data_saida: '20/06/2026',
  cancelado: 0,
};

describe('PedidosFonte', () => {
  it('pesquisa pelo número exato, com parâmetro e tempo máximo', async () => {
    const { fonte, consultar } = criar([PEDIDO]);

    await expect(fonte.pesquisar(' 123 ')).resolves.toEqual([
      { value: '123', label: 'Pedido 123 — Mercado Bom — Tijuca Alimentos — saída 20/06/2026' },
    ]);
    const [sql, params] = consultar.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('/*+ MAX_EXECUTION_TIME(5000) */');
    expect(sql).toContain('WHERE p.idPedido = ?');
    expect(sql).toContain('LEFT JOIN clientes');
    // Data zero do ERP (0000-00-00) não pode virar "00/00/0000" no texto.
    expect(sql).toContain("IF(p.dataSaida > '1000-01-01'");
    // "Não cancelado" também é data zero (coluna NOT NULL): IS NOT NULL marcaria todos.
    expect(sql).toContain("p.datahoraCancelamento > '1000-01-01' AS cancelado");
    expect(sql).not.toContain('IS NOT NULL');
    expect(params).toEqual([123]);
  });

  it('cancelado aparece marcado', async () => {
    const { fonte } = criar([{ ...PEDIDO, cancelado: 1 }]);

    const [item] = await fonte.pesquisar('123');

    expect(item.label).toBe(
      'Pedido 123 — Mercado Bom — Tijuca Alimentos — saída 20/06/2026 — CANCELADO',
    );
  });

  it('partes vazias (sem cliente, sem data) somem do texto', async () => {
    const { fonte } = criar([
      { value: 7, cliente: null, empresa: ' ', data_saida: null, cancelado: 0 },
    ]);

    await expect(fonte.resolver('7')).resolves.toEqual({ value: '7', label: 'Pedido 7' });
  });

  it.each(['abc', '12a', '-5', '1.5', '99999999999', '2147483648'])(
    '"%s" não é número de pedido: nenhum resultado e não vai ao banco',
    async (texto) => {
      const { fonte, consultar } = criar([PEDIDO]);

      await expect(fonte.pesquisar(texto)).resolves.toEqual([]);
      await expect(fonte.resolver(texto)).resolves.toBeNull();
      expect(consultar).not.toHaveBeenCalled();
    },
  );

  it('pedido inexistente → nenhum resultado / null', async () => {
    const { fonte } = criar([]);

    await expect(fonte.pesquisar('999')).resolves.toEqual([]);
    await expect(fonte.resolver('999')).resolves.toBeNull();
  });
});

describe('PedidosFonte.detalhar', () => {
  const CABECALHO = {
    pedido: 3240310,
    pedido_totvs: '532115',
    status: 1,
    tem_data_cancelamento: 0,
    data_cancelamento: null,
    motivo_cancelamento: '',
    sincronismo: 5,
    data_entrega: '20/06/2026',
    tipo_venda: 1,
    cliente_fantasia: 'Mercado Bom',
    cliente_razao: 'Mercado Bom LTDA',
    cliente_status: 1,
    cliente_endereco: 'RUA A 125',
    cliente_numero: '125',
    cliente_bairro: 'Centro',
    cliente_cidade: 'Fortaleza',
    cliente_uf: 'CE',
    cliente_cep: '60541704',
    empresa_fantasia: '',
    empresa_razao: 'Tijuca Alimentos',
    valor_pedido: 444,
    valor_total: 439.6,
    desconto_financeiro: 4.4,
    desconto_total: 0,
    analise_avaria: 2,
    motivo_pendencia: '0|0|0|0|0|',
  };
  const ITEM = {
    numero_item: null,
    produto_codigo: '3268',
    produto: 'OVO JUMBO',
    unidade: 'CC',
    qtde_solicitada: 0,
    qtde_faturada: 4,
    peso_bruto: null,
    unitario_venda: 111,
    unitario_faturamento: null,
    valor_total: 444,
    qtde_quebra: 10,
    valor_quebra: 6.17,
  };

  /** consultar devolve, em ordem: cabeçalho, itens, romaneios, descontos. */
  function criarDetalhes(cabecalho: unknown[], itens: unknown[] = [], romaneios: unknown[] = []) {
    const consultar = jest
      .fn()
      .mockResolvedValueOnce(cabecalho)
      .mockResolvedValueOnce(itens)
      .mockResolvedValueOnce(romaneios)
      .mockResolvedValueOnce([]);
    const fonte = new PedidosFonte({ consultar } as unknown as MysqlService, 5000);
    return { fonte, consultar };
  }

  it('consulta cada parte pela chave do pedido, sem agrupar tabelas inteiras', async () => {
    const { fonte, consultar } = criarDetalhes([CABECALHO], [ITEM]);

    await fonte.detalhar('3240310');

    expect(consultar).toHaveBeenCalledTimes(4);
    for (const [sql, params] of consultar.mock.calls as Array<[string, unknown[]]>) {
      expect(sql).toMatch(/^SELECT \/\*\+ MAX_EXECUTION_TIME\(5000\) \*\//);
      expect(sql).toMatch(/WHERE (p|i|ri|fd)\.idPedido = \?/);
      expect(sql).not.toContain('GROUP BY');
      expect(sql).not.toContain('IS NOT NULL');
      expect(params).toEqual([3240310]);
    }
    const [cabecalhoSql] = consultar.mock.calls[0] as [string];
    expect(cabecalhoSql).toContain("p.datahoraCancelamento > '1000-01-01'");
    expect(cabecalhoSql).toContain("IF(p.dataSaida > '1000-01-01'");
  });

  it('monta resumo, seções e tabela de itens formatados; vazios somem', async () => {
    const { fonte } = criarDetalhes([CABECALHO], [ITEM]);

    const detalhes = await fonte.detalhar('3240310');

    expect(detalhes?.titulo).toBe('Pedido 3240310');
    expect(detalhes?.alertas).toEqual([]);
    expect(detalhes?.resumo).toEqual([
      { label: 'Cliente', valor: 'Mercado Bom' },
      { label: 'Valor total', valor: `R$${NBSP}439,60` },
      { label: 'Entrega', valor: '20/06/2026' },
      { label: 'Situação', valor: 'OK' },
      { label: 'Tipo de venda', valor: 'Venda' },
      { label: 'Empresa', valor: 'Tijuca Alimentos' },
    ]);
    const secoes = Object.fromEntries((detalhes?.secoes ?? []).map((s) => [s.titulo, s.campos]));
    expect(secoes['Cliente']).toContainEqual({
      label: 'Endereço',
      valor: 'RUA A 125, Centro, Fortaleza/CE, CEP 60541-704',
      largo: true,
    });
    expect(secoes['Valores']).toEqual([
      { label: 'Valor do pedido', valor: `R$${NBSP}444,00` },
      { label: 'Desconto financeiro', valor: `R$${NBSP}4,40` },
      { label: 'Valor total', valor: `R$${NBSP}439,60` },
    ]);
    // Análise de avaria 2 não tem significado documentado; pendência "0|0|..." é vazio.
    expect(secoes['Avarias']).toBeUndefined();
    expect(secoes['Observações']).toBeUndefined();
    // Sem romaneios nem descontos: só a tabela de itens.
    expect(detalhes?.tabelas).toHaveLength(1);
    const [itens] = detalhes?.tabelas ?? [];
    expect(itens.colunas.map((c) => c.chave)).toEqual([
      'item',
      'codigo',
      'produto',
      'unidade',
      'qtde_faturada',
      'unitario_venda',
      'valor_total',
      'quebra',
    ]);
    expect(itens.linhas[0]).toMatchObject({
      item: '1',
      qtde_faturada: '4',
      unitario_venda: `R$${NBSP}111,00`,
      quebra: `10 — R$${NBSP}6,17`,
    });
    expect(itens.total).toBeUndefined();
  });

  it('cancelado, cliente desativado, sincronismo pendente e divergência viram alertas', async () => {
    const { fonte } = criarDetalhes(
      [
        {
          ...CABECALHO,
          status: 2,
          tem_data_cancelamento: 1,
          data_cancelamento: '10/06/2026 15:07',
          motivo_cancelamento: 'Valor n&atilde;o atingiu o m&iacute;nimo',
          cliente_status: 2,
          sincronismo: 0,
        },
      ],
      [ITEM, { ...ITEM, numero_item: 2, unitario_faturamento: 100, valor_total: 444 }],
    );

    const detalhes = await fonte.detalhar('3240310');

    expect(detalhes?.alertas).toEqual([
      {
        tipo: 'perigo',
        texto: 'Pedido cancelado em 10/06/2026 15:07. Motivo: Valor não atingiu o mínimo',
      },
      { tipo: 'aviso', texto: 'Cliente desativado no ERP.' },
      { tipo: 'aviso', texto: 'Sincronismo com o TOTVS pendente.' },
      {
        tipo: 'aviso',
        texto: `Item 2: total R$${NBSP}444,00 difere de quantidade × valor unitário (R$${NBSP}400,00).`,
      },
    ]);
    expect(detalhes?.resumo).toContainEqual({ label: 'Situação', valor: 'Cancelado' });
    expect(detalhes?.tabelas[0].total).toMatchObject({
      item: 'Total',
      qtde_faturada: '8',
      valor_total: `R$${NBSP}888,00`,
    });
  });

  it('romaneios: "1" é retornado', async () => {
    const { fonte } = criarDetalhes(
      [CABECALHO],
      [],
      [{ romaneio: 127160, sequencia: 13, expedicao: 1, data_entrega: '20/06/2026', status: 1 }],
    );

    const detalhes = await fonte.detalhar('3240310');

    expect(detalhes?.tabelas).toEqual([
      expect.objectContaining({
        titulo: 'Romaneios',
        linhas: [
          {
            romaneio: '127160',
            expedicao: '1',
            sequencia: '13',
            data_entrega: '20/06/2026',
            situacao: 'Retornado',
          },
        ],
      }),
    ]);
  });

  it('pedido inexistente para no cabeçalho; texto inválido nem vai ao banco', async () => {
    const { fonte, consultar } = criarDetalhes([]);

    await expect(fonte.detalhar('999')).resolves.toBeNull();
    expect(consultar).toHaveBeenCalledTimes(1);
    await expect(fonte.detalhar('12a')).resolves.toBeNull();
    expect(consultar).toHaveBeenCalledTimes(1);
  });
});

describe('PedidosFonte.consultarTabela', () => {
  /** 1ª consulta: existência do pedido; 2ª: itens (as duas em paralelo). */
  function criarTabela(existe: unknown[], itens: unknown[]) {
    const consultar = jest.fn().mockResolvedValueOnce(existe).mockResolvedValueOnce(itens);
    const fonte = new PedidosFonte({ consultar } as unknown as MysqlService, 5000);
    return { fonte, consultar };
  }

  it('expõe a tabela de itens, com o pedido como parâmetro e id_item como chave', () => {
    const { fonte } = criarTabela([], []);

    const [itens] = fonte.tabelas();

    expect(itens).toMatchObject({
      id: 'itens',
      parametros: [{ nome: 'pedidoId', tipo: 'numero', obrigatorio: true }],
      chaveLinha: 'id_item',
      maxLinhas: 500,
    });
    expect(itens.colunas.map((coluna) => coluna.chave)).toContain('qtde_solicitada');
  });

  it('itens tipados, pela chave do pedido e com tempo máximo', async () => {
    const { fonte, consultar } = criarTabela(
      [{ existe: 1 }],
      [
        {
          id_item: 9001,
          numero_item: 1,
          produto_codigo: 'OV-30',
          produto: 'Ovos brancos &ndash; 30',
          unidade: 'CX',
          qtde_solicitada: '10.000',
          valor_total: '255.50',
          peso_bruto: null,
        },
      ],
    );

    const resultado = await fonte.consultarTabela('itens', { pedidoId: '3240310' });

    expect(resultado?.linhas).toEqual([
      {
        chave: '9001',
        valores: expect.objectContaining({
          numero_item: '1',
          produto_codigo: 'OV-30',
          unidade: 'CX',
          qtde_solicitada: 10,
          valor_total: 255.5,
          peso_bruto: null,
        }),
      },
    ]);
    const [sqlExiste, paramsExiste] = consultar.mock.calls[0] as [string, unknown[]];
    const [sqlItens, paramsItens] = consultar.mock.calls[1] as [string, unknown[]];
    expect(sqlExiste).toContain('FROM ve_pedidos WHERE idPedido = ?');
    expect(sqlExiste).toContain('MAX_EXECUTION_TIME(5000)');
    expect(sqlItens).toContain('WHERE i.idPedido = ?');
    expect(paramsExiste).toEqual([3240310]);
    expect(paramsItens).toEqual([3240310]);
  });

  it('pedido existe sem itens → linhas vazias; pedido inexistente → null', async () => {
    await expect(
      criarTabela([{ existe: 1 }], []).fonte.consultarTabela('itens', { pedidoId: '1' }),
    ).resolves.toMatchObject({ linhas: [] });
    await expect(
      criarTabela([], []).fonte.consultarTabela('itens', { pedidoId: '1' }),
    ).resolves.toBeNull();
  });

  it('número fora do intervalo de pedido nem vai ao banco', async () => {
    const { fonte, consultar } = criarTabela([], []);

    await expect(fonte.consultarTabela('itens', { pedidoId: '2147483648' })).resolves.toBeNull();
    expect(consultar).not.toHaveBeenCalled();
  });
});
