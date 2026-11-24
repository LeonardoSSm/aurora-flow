import {
  coerceAnswerToNumber,
  computeCalculatedFieldValues,
  formatHours,
  getFormulaDecimals,
  getFormulaSource,
  tryCompileFormula,
} from './formula.engine';

function compute(formula: string, values: Record<string, unknown>, decimals = 2): number | null {
  return computeCalculatedFieldValues([{ code: 'total', formula, decimals }], values).total;
}

describe('formula.engine', () => {
  describe('coerceAnswerToNumber', () => {
    it('lê o formato monetário brasileiro', () => {
      expect(coerceAnswerToNumber('R$ 1.500,00')).toBe(1500);
      expect(coerceAnswerToNumber('1.234.567,89')).toBe(1234567.89);
      expect(coerceAnswerToNumber('12,5')).toBe(12.5);
    });

    it('lê números, booleanos e listas', () => {
      expect(coerceAnswerToNumber(42)).toBe(42);
      expect(coerceAnswerToNumber(true)).toBe(1);
      expect(coerceAnswerToNumber(['a', 'b'])).toBe(2);
      expect(coerceAnswerToNumber('abc')).toBeNull();
    });
  });

  describe('compilação', () => {
    it('respeita a precedência dos operadores', () => {
      expect(compute('2 + 3 * 4', {})).toBe(14);
      expect(compute('(2 + 3) * 4', {})).toBe(20);
    });

    it('recusa fórmula malformada ou função desconhecida', () => {
      expect(tryCompileFormula('2 +').ok).toBe(false);
      expect(tryCompileFormula('DROP(1)').ok).toBe(false);
      expect(tryCompileFormula('{a} {b}').ok).toBe(false);
    });
  });

  describe('computeCalculatedFieldValues', () => {
    it('calcula entre dois campos', () => {
      expect(compute('{quantidade} * {preco}', { quantidade: 3, preco: '19,90' })).toBe(59.7);
    });

    it('trata campo vazio como zero quando algum campo foi preenchido', () => {
      expect(compute('{a} + {b}', { a: 10, b: null })).toBe(10);
    });

    it('fica em branco enquanto nada foi preenchido', () => {
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

    it('devolve null na divisão por zero e em fórmula inválida', () => {
      expect(compute('{a} / {b}', { a: 10, b: 0 })).toBeNull();
      expect(compute('{a} * ', { a: 5 })).toBeNull();
    });

    it('aplica funções e o condicional com curto-circuito', () => {
      expect(compute('SOMA({a}; {b}; 5)', { a: 1, b: 2 })).toBe(8);
      expect(compute('SE({b} = 0; 0; {a} / {b})', { a: 10, b: 0 })).toBe(0);
      expect(compute('ARRED({a} / 3; 1)', { a: 10 })).toBe(3.3);
    });
  });

  describe('SOMAPRODUTO — colunas de uma tabela de produtos', () => {
    const tabela = [
      { produto: 'Caneta', values: { Quantidade: 10, 'Valor unitario': 2.5 } },
      { produto: 'Caderno', values: { Quantidade: 3, 'Valor unitario': 15 } },
    ];

    it('soma o produto de duas colunas, linha a linha — mesmo resultado do frontend', () => {
      // 10*2.5 + 3*15 = 70. O backend recalcula do zero na submissão; se este número
      // divergir do que o frontend mostrou, o motor está dessincronizado entre os dois.
      expect(compute('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")', { tabela })).toBe(
        70,
      );
    });

    it('com uma única coluna, soma a coluna direto', () => {
      expect(compute('SOMAPRODUTO({tabela}; "Quantidade")', { tabela })).toBe(13);
    });

    it('aceita o alias em inglês SUMPRODUCT', () => {
      expect(compute('SUMPRODUCT({tabela}; "Quantidade"; "Valor unitario")', { tabela })).toBe(
        70,
      );
    });

    it('trata célula ausente ou não-numérica de uma coluna como zero', () => {
      const parcial = [
        { produto: 'Caneta', values: { Quantidade: 10 } },
        { produto: 'Caderno', values: { Quantidade: 3, 'Valor unitario': 'grátis' } },
      ];
      expect(
        compute('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")', { tabela: parcial }),
      ).toBe(0);
    });

    it('fica em branco quando a tabela nunca foi preenchida (nem 0)', () => {
      expect(compute('SOMAPRODUTO({tabela}; "Quantidade")', {})).toBeNull();
    });

    it('recusa quando o campo referenciado não é uma tabela de produtos', () => {
      expect(compute('SOMAPRODUTO({a}; "Quantidade")', { a: 42 })).toBeNull();
    });

    it('exige ao menos uma coluna', () => {
      expect(tryCompileFormula('SOMAPRODUTO({tabela})').ok).toBe(false);
    });

    it('recusa combinar colunas com operador em vez de separar por ";"', () => {
      // Erro real de usuário: SOMAPRODUTO({tabela}; "Quantidade" + "Valor unitario") em vez
      // de SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario"). Sem essa checagem na
      // compilação, a fórmula "compilava" e só dava null na avaliação — sempre em branco,
      // sem explicar por quê.
      const result = tryCompileFormula('SOMAPRODUTO({tabela}; "Quantidade" + "Valor unitario")');
      expect(result.ok).toBe(false);
    });
  });

  describe('SOMAQUOCIENTE — divisão entre colunas de uma tabela de produtos', () => {
    const tabela = [
      { produto: 'Caneta', values: { Valor: 100, Quantidade: 10 } },
      { produto: 'Caderno', values: { Valor: 40, Quantidade: 4 } },
    ];

    it('soma o quociente de duas colunas, linha a linha — mesmo resultado do frontend', () => {
      // 100/10 + 40/4 = 20. Divisão não é distributiva (Σ(a/b) ≠ Σa/Σb), diferente de
      // soma/subtração — por isso essa função também precisa ler a linha inteira.
      expect(compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', { tabela })).toBe(20);
    });

    it('linha com denominador zero não entra na soma', () => {
      const comZero = [
        { produto: 'Caneta', values: { Valor: 100, Quantidade: 10 } },
        { produto: 'Brinde', values: { Valor: 0, Quantidade: 0 } },
      ];
      expect(
        compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', { tabela: comZero }),
      ).toBe(10);
    });

    it('fica em branco quando a tabela nunca foi preenchida (nem 0)', () => {
      expect(compute('SOMAQUOCIENTE({tabela}; "Valor"; "Quantidade")', {})).toBeNull();
    });

    it('recusa quando falta o denominador (exige exatamente 2 colunas)', () => {
      expect(tryCompileFormula('SOMAQUOCIENTE({tabela}; "Valor")').ok).toBe(false);
    });

    it('recusa combinar colunas com operador em vez de argumentos separados', () => {
      const result = tryCompileFormula(
        'SOMAQUOCIENTE({tabela}; "Valor" + "Extra"; "Quantidade")',
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('soma/subtração entre colunas — já dá com SOMAPRODUTO de coluna única fora da função', () => {
    it('soma e subtração são distributivas: Σ(a±b) = Σa ± Σb', () => {
      const tabela = [
        { produto: 'Caneta', values: { Recebido: 10, Devolvido: 2 } },
        { produto: 'Caderno', values: { Recebido: 5, Devolvido: 1 } },
      ];
      expect(
        compute('SOMAPRODUTO({tabela}; "Recebido") + SOMAPRODUTO({tabela}; "Devolvido")', {
          tabela,
        }),
      ).toBe(18);
      expect(
        compute('SOMAPRODUTO({tabela}; "Recebido") - SOMAPRODUTO({tabela}; "Devolvido")', {
          tabela,
        }),
      ).toBe(12);
    });
  });

  describe('leitura das settings', () => {
    it('usa os padrões quando a configuração está ausente', () => {
      expect(getFormulaDecimals(undefined)).toBe(2);
      expect(getFormulaDecimals({ formulaDecimals: 4 })).toBe(4);
      expect(getFormulaSource(null)).toBe('');
      expect(getFormulaSource({ formula: '{a} + 1' })).toBe('{a} + 1');
    });
  });

  describe('DURACAO — horas entre dois campos de Hora', () => {
    it('conta as horas, passando da meia-noite para o dia seguinte', () => {
      expect(compute('DURACAO({chegada}; {saida})', { chegada: '08:00', saida: '17:30' }, 4)).toBe(9.5);
      expect(compute('DURACAO({inicio}; {fim})', { inicio: '22:00', fim: '06:15' }, 4)).toBe(8.25);
    });

    it('fica em branco enquanto falta um dos horários', () => {
      expect(compute('DURACAO({inicio}; {fim})', { inicio: '08:00' }, 4)).toBeNull();
    });

    it('formata no relógio', () => {
      expect(formatHours(8.5)).toBe('8h30');
      expect(formatHours(0.3333)).toBe('0h20');
    });

    it('"Total de horas" vezes o valor da hora dá o valor em R$, sem perder centavo', () => {
      const hoursSettings = { formulaFormat: 'hours', formulaDecimals: 4 };
      expect(getFormulaDecimals(hoursSettings)).toBe(10);
      const specs = [
        { code: 'total_horas', formula: 'DURACAO({inicio}; {fim})', decimals: getFormulaDecimals(hoursSettings) },
        { code: 'valor', formula: '{total_horas} * 100', decimals: 2 },
        { code: 'valor_250', formula: '{total_horas} * 250', decimals: 2 },
      ];
      const run = (inicio: string, fim: string) => computeCalculatedFieldValues(specs, { inicio, fim });
      expect(run('08:00', '09:00').valor).toBe(100);
      expect(run('08:00', '10:00').valor).toBe(200);
      expect(run('08:00', '09:30').valor).toBe(150);
      // 40 min = 0,6667 h com 4 casas → R$ 166,68; o certo é R$ 166,67.
      expect(run('08:00', '08:40').valor_250).toBe(166.67);
    });
  });
});
