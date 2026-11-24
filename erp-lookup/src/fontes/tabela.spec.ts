import type { DefinicaoTabela } from './fonte.types';
import { MAX_CARACTERES_CELULA, montarResultado, TabelaInvalidaError, valorCelula } from './tabela';

const DEFINICAO: DefinicaoTabela = {
  id: 'itens',
  label: 'Itens',
  parametros: [],
  chaveLinha: 'id',
  maxLinhas: 3,
  colunas: [
    { chave: 'produto', label: 'Produto', tipo: 'texto' },
    { chave: 'qtde', label: 'Qtde', tipo: 'numero' },
    { chave: 'valor', label: 'Valor', tipo: 'moeda' },
    { chave: 'entrega', label: 'Entrega', tipo: 'data' },
    { chave: 'ativo', label: 'Ativo', tipo: 'booleano' },
  ],
};

describe('valorCelula', () => {
  it('número e moeda: DECIMAL em texto vira number; lixo vira null', () => {
    expect(valorCelula('10.500', 'numero')).toBe(10.5);
    expect(valorCelula(3, 'moeda')).toBe(3);
    expect(valorCelula('abc', 'numero')).toBeNull();
    expect(valorCelula('', 'moeda')).toBeNull();
    expect(valorCelula(null, 'numero')).toBeNull();
  });

  it('data: ISO sem hora; a data zero do ERP vira null', () => {
    expect(valorCelula('2026-06-20 14:30:00', 'data')).toBe('2026-06-20');
    expect(valorCelula(new Date('2026-06-20T00:00:00Z'), 'data')).toBe('2026-06-20');
    expect(valorCelula('0000-00-00', 'data')).toBeNull();
    expect(valorCelula('20/06/2026', 'data')).toBeNull();
  });

  it('texto: entidades HTML decodificadas, vazio vira null, corte em 1.000', () => {
    expect(valorCelula(' n&atilde;o ', 'texto')).toBe('não');
    expect(valorCelula('   ', 'texto')).toBeNull();
    expect(valorCelula(123, 'texto')).toBe('123');
    expect(valorCelula('x'.repeat(1500), 'texto')).toHaveLength(MAX_CARACTERES_CELULA);
  });

  it('booleano: 0/1 do MySQL', () => {
    expect(valorCelula(1, 'booleano')).toBe(true);
    expect(valorCelula('0', 'booleano')).toBe(false);
    expect(valorCelula(true, 'booleano')).toBe(true);
    expect(valorCelula('x', 'booleano')).toBeNull();
  });
});

describe('montarResultado', () => {
  const agora = new Date('2026-10-08T15:30:00.000Z');

  it('só as colunas declaradas, tipadas, na ordem do banco', () => {
    const resultado = montarResultado(
      DEFINICAO,
      [
        {
          id: 2,
          produto: 'Ovos',
          qtde: '10.000',
          valor: '25.5',
          entrega: '2026-06-20',
          ativo: 1,
          extra: 'x',
        },
        { id: 1, produto: null, qtde: null, valor: null, entrega: '0000-00-00', ativo: 0 },
      ],
      agora,
    );

    expect(resultado).toEqual({
      versao: 1,
      tabela: 'itens',
      consultadoEm: '2026-10-08T15:30:00.000Z',
      linhas: [
        {
          chave: '2',
          valores: { produto: 'Ovos', qtde: 10, valor: 25.5, entrega: '2026-06-20', ativo: true },
        },
        {
          chave: '1',
          valores: { produto: null, qtde: null, valor: null, entrega: null, ativo: false },
        },
      ],
    });
  });

  it('sem linhas → linhas vazias', () => {
    expect(montarResultado(DEFINICAO, [], agora).linhas).toEqual([]);
  });

  it('corta no máximo de linhas da definição', () => {
    const rows = [1, 2, 3, 4, 5].map((id) => ({ id }));
    expect(montarResultado(DEFINICAO, rows, agora).linhas).toHaveLength(3);
  });

  it('chave vazia ou repetida é erro, não linha', () => {
    expect(() => montarResultado(DEFINICAO, [{ id: null }], agora)).toThrow(TabelaInvalidaError);
    expect(() => montarResultado(DEFINICAO, [{ id: 'x'.repeat(181) }], agora)).toThrow(
      TabelaInvalidaError,
    );
    expect(() => montarResultado(DEFINICAO, [{ id: 1 }, { id: '1' }], agora)).toThrow(
      TabelaInvalidaError,
    );
  });
});
