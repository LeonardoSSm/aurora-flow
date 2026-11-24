import { moeda, moedaUnitaria, quantidade, rotulo, secao, tabela, texto } from './formato';

/** Intl separa "R$" do valor com espaço não separável. */
const NBSP = String.fromCharCode(160);

describe('formato', () => {
  it('texto: apara, vazio vira null e entidades HTML do ERP viram acento', () => {
    expect(texto('  abc ')).toBe('abc');
    expect(texto('   ')).toBeNull();
    expect(texto(null)).toBeNull();
    expect(texto(42)).toBe('42');
    expect(texto('n&atilde;o atingiu o m&iacute;nimo &amp; &Ccedil;&#65;&#x42;')).toBe(
      'não atingiu o mínimo & ÇAB',
    );
    expect(texto('&inexistente; &#0;')).toBe('&inexistente; &#0;');
  });

  it('moeda, unitário (até 4 casas) e quantidade no formato brasileiro', () => {
    expect(moeda(1234.5)).toBe(`R$${NBSP}1.234,50`);
    expect(moeda('10')).toBe(`R$${NBSP}10,00`);
    expect(moeda(null)).toBeNull();
    expect(moedaUnitaria(1.23456)).toBe(`R$${NBSP}1,2346`);
    expect(moedaUnitaria(111)).toBe(`R$${NBSP}111,00`);
    expect(quantidade(1500.125)).toBe('1.500,125');
  });

  it('rotulo: código conhecido vira texto; desconhecido aparece como código', () => {
    expect(rotulo(1, { '1': 'OK' })).toBe('OK');
    expect(rotulo(7, { '1': 'OK' })).toBe('código 7');
    expect(rotulo(null, { '1': 'OK' })).toBeNull();
  });

  it('secao sem campos preenchidos some', () => {
    expect(secao('Vazia', [null, null])).toBeNull();
    expect(secao('X', [null, { label: 'a', valor: '1' }])).toEqual({
      titulo: 'X',
      campos: [{ label: 'a', valor: '1' }],
    });
  });

  it('tabela some sem linhas e esconde coluna vazia em todas as linhas', () => {
    const colunas = [
      { chave: 'a', label: 'A' },
      { chave: 'b', label: 'B' },
    ];
    expect(tabela('T', colunas, [])).toBeNull();
    expect(tabela('T', colunas, [{ a: '1', b: null }], { a: 'Total', b: 'x' })).toEqual({
      titulo: 'T',
      colunas: [{ chave: 'a', label: 'A' }],
      linhas: [{ a: '1' }],
      total: { a: 'Total' },
    });
  });
});
