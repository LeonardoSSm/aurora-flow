import { describe, expect, it } from 'vitest';
import {
  coerceAnswerToNumber,
  computeCalculatedFieldValues,
  extractFormulaRefs,
  extractSumProductColumnRefs,
  findFormulaCycle,
  formatCalculatedValue,
  getFormulaDecimals,
  tryCompileFormula,
  validateFormulaSource,
} from './formula';

function compute(formula: string, values: Record<string, unknown>, decimals = 2) {
  return computeCalculatedFieldValues([{ code: 'total', formula, decimals }], values).total;
}

describe('coerceAnswerToNumber', () => {
  it('lê o formato monetário brasileiro', () => {
    expect(coerceAnswerToNumber('R$ 1.500,00')).toBe(1500);
    expect(coerceAnswerToNumber('1.234.567,89')).toBe(1234567.89);
    expect(coerceAnswerToNumber('12,5')).toBe(12.5);
  });

  it('lê números simples e booleanos', () => {
    expect(coerceAnswerToNumber(42)).toBe(42);
    expect(coerceAnswerToNumber('42.75')).toBe(42.75);
    expect(coerceAnswerToNumber(true)).toBe(1);
    expect(coerceAnswerToNumber(false)).toBe(0);
  });

  it('conta as opções de múltipla escolha', () => {
    expect(coerceAnswerToNumber(['a', 'b', 'c'])).toBe(3);
    expect(coerceAnswerToNumber([])).toBeNull();
  });

  it('devolve null para o que não é número', () => {
    expect(coerceAnswerToNumber('')).toBeNull();
    expect(coerceAnswerToNumber('abc')).toBeNull();
    expect(coerceAnswerToNumber(null)).toBeNull();
  });
});

describe('compilação da fórmula', () => {
  it('respeita a precedência dos operadores', () => {
    expect(compute('2 + 3 * 4', {})).toBe(14);
    expect(compute('(2 + 3) * 4', {})).toBe(20);
    expect(compute('2 ^ 3 ^ 2', {})).toBe(512);
    expect(compute('-3 + 10', {})).toBe(7);
  });

  it('recusa fórmula malformada', () => {
    expect(tryCompileFormula('2 +').ok).toBe(false);
    expect(tryCompileFormula('{a} {b}').ok).toBe(false);
    expect(tryCompileFormula('SOMA(1; 2').ok).toBe(false);
    expect(tryCompileFormula('DROP(1)').ok).toBe(false);
    expect(tryCompileFormula('{a').ok).toBe(false);
  });

  it('extrai os campos referenciados mesmo com a fórmula incompleta', () => {
    expect(extractFormulaRefs('{quantidade} * {preco} +')).toEqual(['quantidade', 'preco']);
  });
});

describe('computeCalculatedFieldValues', () => {
  it('calcula entre dois campos', () => {
    expect(compute('{quantidade} * {preco}', { quantidade: 3, preco: '19,90' })).toBe(59.7);
  });

  it('trata campo vazio como zero, desde que algum campo esteja preenchido', () => {
    expect(compute('{a} + {b}', { a: 10, b: null })).toBe(10);
  });

  it('fica em branco enquanto nenhum campo do cálculo foi preenchido', () => {
    expect(compute('{a} + {b}', { a: null, b: null })).toBeNull();
  });

  it('calcula entre cálculos, na ordem das dependências', () => {
    const values = computeCalculatedFieldValues(
      [
        { code: 'subtotal', formula: '{quantidade} * {preco}', decimals: 2 },
        { code: 'desconto', formula: '{subtotal} * {percentual} / 100', decimals: 2 },
        { code: 'total', formula: '{subtotal} - {desconto}', decimals: 2 },
      ],
      { quantidade: 10, preco: 25, percentual: 10 },
    );

    expect(values.subtotal).toBe(250);
    expect(values.desconto).toBe(25);
    expect(values.total).toBe(225);
  });

  it('não trava com referência circular', () => {
    const values = computeCalculatedFieldValues(
      [
        { code: 'a', formula: '{b} + 1' },
        { code: 'b', formula: '{a} + 1' },
      ],
      {},
    );

    expect(values.a).toBeNull();
    expect(values.b).toBeNull();
  });

  it('devolve null na divisão por zero', () => {
    expect(compute('{a} / {b}', { a: 10, b: 0 })).toBeNull();
  });

  it('aplica funções e condicional com curto-circuito', () => {
    expect(compute('SOMA({a}; {b}; 5)', { a: 1, b: 2 })).toBe(8);
    expect(compute('MEDIA({a}; {b})', { a: 4, b: 6 })).toBe(5);
    expect(compute('SE({b} = 0; 0; {a} / {b})', { a: 10, b: 0 })).toBe(0);
    expect(compute('ARRED({a} / 3; 1)', { a: 10 })).toBe(3.3);
    expect(compute('MAX({a}; {b})', { a: 7, b: 3 })).toBe(7);
  });

  it('arredonda conforme as casas configuradas', () => {
    expect(compute('{a} / 3', { a: 10 }, 0)).toBe(3);
    expect(compute('{a} / 3', { a: 10 }, 4)).toBe(3.3333);
  });

  it('ignora fórmula inválida em vez de quebrar o formulário', () => {
    expect(compute('{a} * ', { a: 5 })).toBeNull();
  });
});

describe('SOMAPRODUTO — colunas de uma tabela de produtos', () => {
  const tabela = [
    { produto: 'Caneta', values: { Quantidade: 10, 'Valor unitario': 2.5 } },
    { produto: 'Caderno', values: { Quantidade: 3, 'Valor unitario': 15 } },
  ];

  it('soma o produto de duas colunas, linha a linha', () => {
    // 10*2.5 + 3*15 = 25 + 45 = 70
    expect(compute('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")', { tabela })).toBe(70);
  });

  it('com uma única coluna, soma a coluna direto', () => {
    expect(compute('SOMAPRODUTO({tabela}; "Quantidade")', { tabela })).toBe(13);
  });

  it('aceita o alias em inglês SUMPRODUCT', () => {
    expect(compute('SUMPRODUCT({tabela}; "Quantidade"; "Valor unitario")', { tabela })).toBe(70);
  });

  it('trata célula ausente ou não-numérica de uma coluna como zero', () => {
    const parcial = [
      { produto: 'Caneta', values: { Quantidade: 10 } }, // sem "Valor unitario"
      { produto: 'Caderno', values: { Quantidade: 3, 'Valor unitario': 'grátis' } },
    ];
    expect(
      compute('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")', { tabela: parcial }),
    ).toBe(0);
  });

  it('combina com outras operações da fórmula', () => {
    // Total do pedido com 10% de acréscimo.
    expect(
      compute('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario") * 1.1', { tabela }),
    ).toBe(77);
  });

  it('fica em branco quando a tabela nunca foi preenchida (nem 0)', () => {
    expect(compute('SOMAPRODUTO({tabela}; "Quantidade")', {})).toBeNull();
  });

  it('soma zero quando a tabela foi preenchida mas as colunas citadas estão vazias', () => {
    const semColunas = [{ produto: 'Caneta', values: {} }];
    expect(compute('SOMAPRODUTO({tabela}; "Quantidade")', { tabela: semColunas })).toBe(0);
  });

  it('recusa quando o 1º argumento não é uma referência de campo', () => {
    expect(compute('SOMAPRODUTO(5; "Quantidade")', {})).toBeNull();
  });

  it('recusa quando o nome de coluna não está entre aspas (lido como função desconhecida)', () => {
    expect(tryCompileFormula('SOMAPRODUTO({tabela}; Quantidade)').ok).toBe(false);
  });

  it('recusa quando o campo referenciado não é uma tabela de produtos', () => {
    expect(compute('SOMAPRODUTO({a}; "Quantidade")', { a: 42 })).toBeNull();
  });

  it('exige ao menos uma coluna', () => {
    expect(tryCompileFormula('SOMAPRODUTO({tabela})').ok).toBe(false);
  });

  it('recusa combinar colunas com operador em vez de separar por ";"', () => {
    // Erro real de usuário: SOMAPRODUTO({tabela}; "Quantidade" + "Valor unitario") em vez de
    // SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario"). Sem essa checagem na compilação,
    // a fórmula "compilava" e só dava null na avaliação — sempre em branco, sem explicar por quê,
    // e o testador do builder também revertia pro input genérico da tabela inteira.
    const result = tryCompileFormula('SOMAPRODUTO({tabela}; "Quantidade" + "Valor unitario")');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('entre aspas');
    }
  });
});

describe('SOMAQUOCIENTE — divisão entre colunas de uma tabela de produtos', () => {
  const tabela = [
    { produto: 'Caneta', values: { Valor: 100, Quantidade: 10 } },
    { produto: 'Caderno', values: { Valor: 40, Quantidade: 4 } },
  ];

  it('soma o quociente de duas colunas, linha a linha', () => {
    // 100/10 + 40/4 = 10 + 10 = 20. Repare que Σ(a/b) ≠ Σa/Σb: (100+40)/(10+4) = 10, diferente.
    expect(compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', { tabela })).toBe(20);
  });

  it('linha com denominador zero não entra na soma', () => {
    const comZero = [
      { produto: 'Caneta', values: { Valor: 100, Quantidade: 10 } },
      { produto: 'Brinde', values: { Valor: 0, Quantidade: 0 } },
    ];
    expect(compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', { tabela: comZero })).toBe(
      10,
    );
  });

  it('trata célula ausente ou não-numérica como zero', () => {
    const parcial = [
      { produto: 'Caneta', values: { Valor: 100 } }, // sem "Quantidade"
      { produto: 'Caderno', values: { Valor: 'grátis', Quantidade: 4 } },
    ];
    expect(
      compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', { tabela: parcial }),
    ).toBe(0);
  });

  it('fica em branco quando a tabela nunca foi preenchida (nem 0)', () => {
    expect(compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', {})).toBeNull();
  });

  it('soma zero quando a tabela foi preenchida mas as colunas citadas estão vazias', () => {
    const semColunas = [{ produto: 'Caneta', values: {} }];
    expect(
      compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', { tabela: semColunas }),
    ).toBe(0);
  });

  it('combina com outras operações da fórmula', () => {
    expect(compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade") * 2', { tabela })).toBe(40);
  });

  it('recusa quando o 1º argumento não é uma referência de campo', () => {
    expect(compute('SOMAQUOCIENTE(5; "Valor"; "Quantidade")', {})).toBeNull();
  });

  it('recusa quando falta o denominador (exige exatamente 2 colunas)', () => {
    expect(tryCompileFormula('SOMAQUOCIENTE({tabela}; "Valor")').ok).toBe(false);
  });

  it('recusa combinar colunas com operador em vez de argumentos separados', () => {
    const result = tryCompileFormula('SOMAQUOCIENTE({tabela}; "Valor" + "Extra"; "Quantidade")');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('entre aspas');
    }
  });
});

describe('soma/subtração entre colunas — já dá com SOMAPRODUTO de coluna única fora da função', () => {
  it('soma é distributiva: SOMAPRODUTO(a) + SOMAPRODUTO(b) = soma linha a linha de (a + b)', () => {
    const tabela = [
      { produto: 'Caneta', values: { Recebido: 10, Devolvido: 2 } },
      { produto: 'Caderno', values: { Recebido: 5, Devolvido: 1 } },
    ];
    expect(
      compute(
        'SOMAPRODUTO({tabela}; "Recebido") + SOMAPRODUTO({tabela}; "Devolvido")',
        { tabela },
      ),
    ).toBe(18);
  });

  it('subtração é distributiva: SOMAPRODUTO(a) - SOMAPRODUTO(b) = soma linha a linha de (a - b)', () => {
    const tabela = [
      { produto: 'Caneta', values: { Recebido: 10, Devolvido: 2 } },
      { produto: 'Caderno', values: { Recebido: 5, Devolvido: 1 } },
    ];
    expect(
      compute(
        'SOMAPRODUTO({tabela}; "Recebido") - SOMAPRODUTO({tabela}; "Devolvido")',
        { tabela },
      ),
    ).toBe(12);
  });
});

describe('extractSumProductColumnRefs — pra o testador de valores de exemplo do builder', () => {
  it('extrai o par tabela/coluna de uma chamada simples', () => {
    expect(extractSumProductColumnRefs('SOMAPRODUTO({tabela}; "Quantidade")')).toEqual([
      { tableCode: 'tabela', column: 'Quantidade' },
    ]);
  });

  it('extrai todas as colunas de uma chamada com várias', () => {
    expect(
      extractSumProductColumnRefs('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")'),
    ).toEqual([
      { tableCode: 'tabela', column: 'Quantidade' },
      { tableCode: 'tabela', column: 'Valor unitario' },
    ]);
  });

  it('extrai colunas de mais de uma tabela na mesma fórmula', () => {
    expect(
      extractSumProductColumnRefs(
        'SOMAPRODUTO({pedidos}; "Qtd") + SOMAPRODUTO({devolucoes}; "Qtd")',
      ),
    ).toEqual([
      { tableCode: 'pedidos', column: 'Qtd' },
      { tableCode: 'devolucoes', column: 'Qtd' },
    ]);
  });

  it('não duplica a mesma coluna citada mais de uma vez', () => {
    expect(
      extractSumProductColumnRefs(
        'SOMAPRODUTO({tabela}; "Quantidade") + SOMAPRODUTO({tabela}; "Quantidade")',
      ),
    ).toEqual([{ tableCode: 'tabela', column: 'Quantidade' }]);
  });

  it('ignora argumento que não é uma referência de campo ou não é string', () => {
    expect(extractSumProductColumnRefs('SOMAPRODUTO(5; "Quantidade")')).toEqual([]);
  });

  it('também extrai as colunas de uma chamada SOMAQUOCIENTE', () => {
    expect(
      extractSumProductColumnRefs('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")'),
    ).toEqual([
      { tableCode: 'tabela', column: 'Valor' },
      { tableCode: 'tabela', column: 'Quantidade' },
    ]);
  });

  it('devolve lista vazia para fórmula sem SOMAPRODUTO', () => {
    expect(extractSumProductColumnRefs('{a} + {b}')).toEqual([]);
  });

  it('devolve lista vazia para fórmula inválida, sem lançar erro', () => {
    expect(extractSumProductColumnRefs('SOMAPRODUTO({tabela}; "Quantidade"')).toEqual([]);
  });
});

describe('validateFormulaSource', () => {
  it('aponta campo inexistente', () => {
    expect(validateFormulaSource('{a} + {z}', { knownCodes: ['a', 'b'] })).toContain('{z}');
  });

  it('bloqueia auto-referência', () => {
    expect(validateFormulaSource('{total} + 1', { fieldCode: 'total' })).toContain('próprio campo');
  });

  it('aceita fórmula válida', () => {
    expect(validateFormulaSource('{a} + {b}', { fieldCode: 'total', knownCodes: ['a', 'b'] })).toBeNull();
  });
});

describe('findFormulaCycle', () => {
  it('encontra o ciclo entre cálculos', () => {
    const cycle = findFormulaCycle([
      { code: 'a', formula: '{b} + 1' },
      { code: 'b', formula: '{a} + 1' },
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('a');
    expect(cycle).toContain('b');
  });

  it('aceita cadeia sem ciclo', () => {
    expect(
      findFormulaCycle([
        { code: 'subtotal', formula: '{qtd} * {preco}' },
        { code: 'total', formula: '{subtotal} * 1.1' },
      ]),
    ).toBeNull();
  });
});

describe('formatCalculatedValue', () => {
  it('formata em pt-BR com prefixo e sufixo', () => {
    expect(formatCalculatedValue(1234.5, { formulaDecimals: 2, formulaPrefix: 'R$ ' })).toBe(
      'R$ 1.234,50',
    );
    expect(formatCalculatedValue(15, { formulaDecimals: 0, formulaSuffix: '%' })).toBe('15%');
  });

  it('devolve string vazia sem valor', () => {
    expect(formatCalculatedValue(null, {})).toBe('');
  });
});

describe('DURACAO — horas entre dois campos de Hora', () => {
  it('conta as horas entre início e fim', () => {
    expect(compute('DURACAO({chegada}; {saida})', { chegada: '08:00', saida: '17:30' }, 4)).toBe(9.5);
    expect(compute('DURACAO({chegada}; {saida}) - 1', { chegada: '08:00', saida: '17:30' }, 4)).toBe(8.5);
  });

  it('passa da meia-noite contando o dia seguinte', () => {
    expect(compute('DURACAO({inicio}; {fim})', { inicio: '22:00', fim: '06:15' }, 4)).toBe(8.25);
  });

  it('fica em branco enquanto falta um dos horários', () => {
    expect(compute('DURACAO({inicio}; {fim})', { inicio: '08:00' }, 4)).toBeNull();
    expect(compute('DURACAO({inicio}; {fim})', {}, 4)).toBeNull();
  });

  it('campo Hora entra em horas numa conta comum', () => {
    expect(compute('({saida} - {chegada}) * 30', { chegada: '08:00', saida: '10:30' })).toBe(75);
  });

  it('"Total de horas" vezes o valor da hora dá o valor em R$, sem perder centavo', () => {
    const hoursSettings = { formulaFormat: 'hours' as const, formulaDecimals: 4 };
    expect(getFormulaDecimals(hoursSettings)).toBe(10);
    const specs = [
      { code: 'total_horas', formula: 'DURACAO({inicio}; {fim})', decimals: getFormulaDecimals(hoursSettings) },
      { code: 'valor', formula: '{total_horas} * {valor_hora}', decimals: 2 },
    ];
    const valor = (inicio: string, fim: string, valorHora: string) =>
      computeCalculatedFieldValues(specs, { inicio, fim, valor_hora: valorHora }).valor;
    expect(valor('08:00', '09:00', '100')).toBe(100);
    expect(valor('08:00', '10:00', '100')).toBe(200);
    expect(valor('08:00', '09:30', 'R$ 100,00')).toBe(150);
    // 40 min = 0,6667 h com 4 casas → R$ 166,68; o certo é R$ 166,67.
    expect(valor('08:00', '08:40', '250')).toBe(166.67);
  });
});

describe('formatCalculatedValue em horas', () => {
  it('mostra no relógio', () => {
    expect(formatCalculatedValue(8.5, { formulaFormat: 'hours' })).toBe('8h30');
    expect(formatCalculatedValue(0.3333, { formulaFormat: 'hours', formulaDecimals: 4 })).toBe('0h20');
    expect(formatCalculatedValue(26, { formulaFormat: 'hours' })).toBe('26h00');
    expect(formatCalculatedValue(-1.25, { formulaFormat: 'hours' })).toBe('-1h15');
  });
});
