/**
 * Motor de fórmulas dos campos calculados.
 *
 * Cópia de `backend/src/common/formula/formula.engine.ts` (que por sua vez
 * espelha `frontend/src/modules/forms/formula.ts`) — o app mostra o resultado
 * enquanto o formulário é preenchido, mas quem grava é o backend, que recalcula
 * tudo. Mudança de comportamento em uma das cópias exige a mesma nas outras.
 */
export const DEFAULT_FORMULA_DECIMALS = 2;

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; code: string }
  | { kind: 'string'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

export type FormulaNode =
  | { type: 'number'; value: number }
  | { type: 'ref'; code: string }
  | { type: 'string'; value: string }
  | { type: 'unary'; op: '-' | '+'; operand: FormulaNode }
  | { type: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
  | { type: 'call'; name: string; args: FormulaNode[] };

export type CompiledFormula = {
  source: string;
  node: FormulaNode;
  refs: string[];
};

export type FormulaLookup = (code: string) => number | null;
/** Valor cru (não coagido a número) de um campo — usado só por SOMAPRODUTO, que precisa
 * enxergar o array de linhas de uma tabela de produtos em vez do de-para escalar comum. */
export type FormulaRawLookup = (code: string) => unknown;

type FormulaFunction = {
  minArgs: number;
  maxArgs: number;
  apply?: (args: number[]) => number;
};

const INFINITE_ARGS = Number.POSITIVE_INFINITY;

const FUNCTIONS: Record<string, FormulaFunction> = {
  SOMA: { minArgs: 1, maxArgs: INFINITE_ARGS, apply: (args) => args.reduce((t, v) => t + v, 0) },
  MEDIA: {
    minArgs: 1,
    maxArgs: INFINITE_ARGS,
    apply: (args) => args.reduce((t, v) => t + v, 0) / args.length,
  },
  MIN: { minArgs: 1, maxArgs: INFINITE_ARGS, apply: (args) => Math.min(...args) },
  MAX: { minArgs: 1, maxArgs: INFINITE_ARGS, apply: (args) => Math.max(...args) },
  ABS: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.abs(value) },
  ARRED: { minArgs: 1, maxArgs: 2, apply: ([value, decimals]) => roundTo(value, decimals ?? 0) },
  TETO: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.ceil(value) },
  PISO: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.floor(value) },
  RAIZ: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([value]) => {
      if (value < 0) throw new FormulaError('Raiz de número negativo.');
      return Math.sqrt(value);
    },
  },
  POT: { minArgs: 2, maxArgs: 2, apply: ([base, exponent]) => base ** exponent },
  // SE/E/OU são avaliadas com curto-circuito no interpretador.
  SE: { minArgs: 3, maxArgs: 3 },
  E: { minArgs: 1, maxArgs: INFINITE_ARGS },
  OU: { minArgs: 1, maxArgs: INFINITE_ARGS },
  NAO: { minArgs: 1, maxArgs: 1, apply: ([value]) => (value === 0 ? 1 : 0) },
  // SOMAPRODUTO e SOMAQUOCIENTE não recebem números prontos como as demais — o 1º
  // argumento é a referência da tabela e os seguintes são nomes de coluna em texto;
  // avaliadas à parte (evaluateSumProduct/evaluateSumQuotient), que leem o array cru
  // da tabela via rawLookup.
  SOMAPRODUTO: { minArgs: 2, maxArgs: INFINITE_ARGS },
  // Soma (Σ) e subtração (Σa - Σb) entre colunas já dá pra fazer combinando
  // SOMAPRODUTO de uma coluna só com + / - fora da função — soma é distributiva:
  // Σ(a - b) = Σa - Σb. Divisão não é (Σ(a/b) ≠ Σa / Σb), por isso precisa de uma
  // função própria que veja a linha inteira, como o SOMAPRODUTO.
  SOMAQUOCIENTE: { minArgs: 3, maxArgs: 3 },
  // Pontuação por seção e resultado geral — avaliadas à parte (evaluateConformity etc.), porque
  // precisam saber o que está em branco em vez de ler branco como zero.
  CONFORMIDADE: { minArgs: 1, maxArgs: INFINITE_ARGS },
  ATINGIRAM: { minArgs: 2, maxArgs: INFINITE_ARGS },
  MEDIAPREENCHIDOS: { minArgs: 1, maxArgs: INFINITE_ARGS },
  // Horas entre dois horários — avaliada à parte (evaluateDuration): horário em branco deixa o
  // resultado em branco em vez de contar como meia-noite.
  DURACAO: { minArgs: 2, maxArgs: 2 },
};

const FUNCTION_ALIASES: Record<string, string> = {
  SUM: 'SOMA',
  AVG: 'MEDIA',
  AVERAGE: 'MEDIA',
  MINIMO: 'MIN',
  MAXIMO: 'MAX',
  MODULO: 'ABS',
  ROUND: 'ARRED',
  ARREDONDAR: 'ARRED',
  CEIL: 'TETO',
  CEILING: 'TETO',
  FLOOR: 'PISO',
  SQRT: 'RAIZ',
  POW: 'POT',
  POTENCIA: 'POT',
  IF: 'SE',
  AND: 'E',
  OR: 'OU',
  NOT: 'NAO',
  SUMPRODUCT: 'SOMAPRODUTO',
  DURATION: 'DURACAO',
  HORAS: 'DURACAO',
};

function normalizeFunctionName(raw: string): string {
  const upper = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  return FUNCTION_ALIASES[upper] ?? upper;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '{') {
      const end = source.indexOf('}', index);
      if (end === -1) {
        throw new FormulaError('Referência de campo sem "}" de fechamento.');
      }
      const code = source.slice(index + 1, end).trim();
      if (!code) {
        throw new FormulaError('Referência de campo vazia — use {codigo_do_campo}.');
      }
      tokens.push({ kind: 'ref', code });
      index = end + 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = source.indexOf(char, index + 1);
      if (end === -1) {
        throw new FormulaError('Texto sem aspas de fechamento.');
      }
      tokens.push({ kind: 'string', value: source.slice(index + 1, end) });
      index = end + 1;
      continue;
    }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] ?? ''))) {
      let end = index;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      const raw = source.slice(index, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new FormulaError(`Número inválido: "${raw}".`);
      }
      tokens.push({ kind: 'number', value });
      index = end;
      continue;
    }

    if (/[A-Za-z_À-ɏ]/.test(char)) {
      let end = index;
      while (end < source.length && /[A-Za-z0-9_À-ɏ]/.test(source[end])) end += 1;
      tokens.push({ kind: 'name', value: source.slice(index, end) });
      index = end;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      index += 1;
      continue;
    }

    // `;` também separa argumentos, como nas planilhas em pt-BR.
    if (char === ',' || char === ';') {
      tokens.push({ kind: 'comma' });
      index += 1;
      continue;
    }

    if ('+-*/%^<>=!'.includes(char)) {
      const pair = source.slice(index, index + 2);
      if (['==', '!=', '<>', '<=', '>='].includes(pair)) {
        tokens.push({ kind: 'op', value: pair });
        index += 2;
        continue;
      }
      if (char === '!') {
        throw new FormulaError('Operador inválido: "!". Use "<>" para diferente.');
      }
      tokens.push({ kind: 'op', value: char });
      index += 1;
      continue;
    }

    throw new FormulaError(`Caractere não reconhecido na fórmula: "${char}".`);
  }

  return tokens;
}

function parseTokens(tokens: Token[]): FormulaNode {
  let position = 0;

  function matchOp(...values: string[]): string | null {
    const token = tokens[position];
    if (token?.kind === 'op' && values.includes(token.value)) {
      position += 1;
      return token.value;
    }
    return null;
  }

  function parseExpression(): FormulaNode {
    let node = parseAdditive();
    const op = matchOp('=', '==', '<>', '!=', '<', '<=', '>', '>=');
    if (op) {
      node = { type: 'binary', op, left: node, right: parseAdditive() };
    }
    return node;
  }

  function parseAdditive(): FormulaNode {
    let node = parseMultiplicative();
    for (;;) {
      const op = matchOp('+', '-');
      if (!op) return node;
      node = { type: 'binary', op, left: node, right: parseMultiplicative() };
    }
  }

  function parseMultiplicative(): FormulaNode {
    let node = parseUnary();
    for (;;) {
      const op = matchOp('*', '/', '%');
      if (!op) return node;
      node = { type: 'binary', op, left: node, right: parseUnary() };
    }
  }

  function parseUnary(): FormulaNode {
    const op = matchOp('-', '+');
    if (op) {
      return { type: 'unary', op: op as '-' | '+', operand: parseUnary() };
    }
    return parsePower();
  }

  function parsePower(): FormulaNode {
    const base = parsePrimary();
    if (!matchOp('^')) return base;
    return { type: 'binary', op: '^', left: base, right: parseUnary() };
  }

  function parseCallArgs(name: string, rawName: string): FormulaNode {
    if (tokens[position]?.kind !== 'lparen') {
      throw new FormulaError(`Faltou "(" depois da função ${rawName}.`);
    }
    position += 1;

    const args: FormulaNode[] = [];
    if (tokens[position]?.kind === 'rparen') {
      position += 1;
    } else {
      for (;;) {
        args.push(parseExpression());
        const separator = tokens[position];
        if (separator?.kind === 'comma') {
          position += 1;
          continue;
        }
        if (separator?.kind === 'rparen') {
          position += 1;
          break;
        }
        throw new FormulaError(`Faltou ")" para fechar a função ${rawName}.`);
      }
    }

    const definition = FUNCTIONS[name];
    if (args.length < definition.minArgs || args.length > definition.maxArgs) {
      throw new FormulaError(
        definition.minArgs === definition.maxArgs
          ? `A função ${name} espera ${definition.minArgs} argumento(s).`
          : `A função ${name} espera de ${definition.minArgs} a ${definition.maxArgs} argumentos.`,
      );
    }

    // Verificado aqui (na compilação) e não só na avaliação: um argumento de coluna que não
    // é um texto literal — ex.: `"Quantidade" + "Coluna 2"` em vez de `"Quantidade"; "Coluna 2"`
    // — "compila" mas nunca calcula nada, sempre em branco, sem avisar ninguém. Rejeitar aqui
    // vira um erro visível no editor, no lugar de um resultado silenciosamente errado.
    if (name === 'SOMAPRODUTO' || name === 'SOMAQUOCIENTE') {
      const [tableArg, ...columnArgs] = args;
      if (tableArg.type !== 'ref') {
        throw new FormulaError(
          `O 1º argumento de ${name} precisa ser uma referência de campo: {codigo_da_tabela}.`,
        );
      }
      if (columnArgs.some((arg) => arg.type !== 'string')) {
        throw new FormulaError(
          name === 'SOMAPRODUTO'
            ? 'As colunas do SOMAPRODUTO vão direto entre aspas, separadas por ";" — ex.: ' +
                'SOMAPRODUTO({tabela}; "Quantidade"; "Coluna 2"). Não dá para combinar textos com +.'
            : 'As colunas do SOMAQUOCIENTE vão direto entre aspas — ex.: SOMAQUOCIENTE({tabela}; ' +
                '"Numerador"; "Denominador"). Não dá para combinar textos com operadores.',
        );
      }
    }

    return { type: 'call', name, args };
  }

  function parsePrimary(): FormulaNode {
    const token = tokens[position];
    if (!token) {
      throw new FormulaError('Fórmula incompleta.');
    }
    position += 1;

    if (token.kind === 'number') return { type: 'number', value: token.value };
    if (token.kind === 'ref') return { type: 'ref', code: token.code };
    if (token.kind === 'string') return { type: 'string', value: token.value };

    if (token.kind === 'lparen') {
      const node = parseExpression();
      if (tokens[position]?.kind !== 'rparen') {
        throw new FormulaError('Faltou fechar um parêntese.');
      }
      position += 1;
      return node;
    }

    if (token.kind === 'name') {
      const name = normalizeFunctionName(token.value);
      if (!FUNCTIONS[name]) {
        throw new FormulaError(
          `Função desconhecida: "${token.value}". Para usar um campo escreva {codigo_do_campo}.`,
        );
      }
      return parseCallArgs(name, token.value);
    }

    throw new FormulaError('Fórmula inválida: verifique operadores e parênteses.');
  }

  const node = parseExpression();
  if (position < tokens.length) {
    throw new FormulaError('Fórmula inválida: verifique operadores e parênteses.');
  }
  return node;
}

function collectRefs(node: FormulaNode, target: Set<string>): void {
  switch (node.type) {
    case 'ref':
      target.add(node.code);
      return;
    case 'unary':
      collectRefs(node.operand, target);
      return;
    case 'binary':
      collectRefs(node.left, target);
      collectRefs(node.right, target);
      return;
    case 'call':
      for (const arg of node.args) collectRefs(arg, target);
      return;
    default:
  }
}

export function compileFormula(source: string): CompiledFormula {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new FormulaError('Escreva uma fórmula.');
  }
  const node = parseTokens(tokenize(trimmed));
  const refs = new Set<string>();
  collectRefs(node, refs);
  return { source: trimmed, node, refs: Array.from(refs) };
}

export type FormulaCompileResult =
  | { ok: true; formula: CompiledFormula }
  | { ok: false; error: string };

export function tryCompileFormula(source: string): FormulaCompileResult {
  try {
    return { ok: true, formula: compileFormula(source) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof FormulaError ? error.message : 'Fórmula inválida.',
    };
  }
}

function evaluateBinary(
  node: Extract<FormulaNode, { type: 'binary' }>,
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  const left = evaluateNode(node.left, lookup, rawLookup, scoresLookup);
  const right = evaluateNode(node.right, lookup, rawLookup, scoresLookup);

  switch (node.op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) throw new FormulaError('Divisão por zero.');
      return left / right;
    case '%':
      if (right === 0) throw new FormulaError('Divisão por zero.');
      return left % right;
    case '^':
      return left ** right;
    case '=':
    case '==':
      return left === right ? 1 : 0;
    case '<>':
    case '!=':
      return left !== right ? 1 : 0;
    case '<':
      return left < right ? 1 : 0;
    case '<=':
      return left <= right ? 1 : 0;
    case '>':
      return left > right ? 1 : 0;
    case '>=':
      return left >= right ? 1 : 0;
    default:
      throw new FormulaError(`Operador não suportado: "${node.op}".`);
  }
}

/**
 * SOMAPRODUTO({tabela}; "Coluna1"; "Coluna2"; ...) — soma, por linha preenchida da tabela de
 * produtos, o produto das colunas indicadas (uma só coluna soma a coluna direto). É a única
 * função que enxerga o array cru de linhas em vez de um número já coagido: as demais nem
 * fariam sentido aqui, já que uma tabela sempre tem 0..N linhas dinâmicas, definidas por quem
 * responde — não um valor único.
 */
function evaluateSumProduct(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
): number {
  const [tableArg, ...columnArgs] = args;
  if (tableArg.type !== 'ref') {
    throw new FormulaError(
      'O 1º argumento de SOMAPRODUTO precisa ser uma referência de campo: {codigo_da_tabela}.',
    );
  }
  const columns = columnArgs.map((arg) => {
    if (arg.type !== 'string') {
      throw new FormulaError(
        'Os nomes de coluna em SOMAPRODUTO vão entre aspas, ex.: SOMAPRODUTO({tabela}; "Quantidade").',
      );
    }
    return arg.value;
  });

  // SOMAPRODUTO lê a tabela pelo array cru (rawLookup), não pelo `lookup` escalar — mas
  // ainda precisa passar por `lookup` para participar do rastreamento de "algum campo
  // referenciado está preenchido" (computeCalculatedFieldValues.anyFilled); sem essa
  // chamada o cálculo nunca sairia do estado em branco, mesmo com a tabela cheia.
  lookup(tableArg.code);
  const raw = rawLookup(tableArg.code);
  if (raw === null || raw === undefined) return 0;
  if (!Array.isArray(raw)) {
    throw new FormulaError(`SOMAPRODUTO: "{${tableArg.code}}" não é uma tabela de produtos.`);
  }

  let total = 0;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const values = (row as { values?: Record<string, unknown> }).values;
    let product = 1;
    for (const column of columns) {
      const cell = values?.[column];
      product *= typeof cell === 'number' && Number.isFinite(cell) ? cell : 0;
    }
    total += product;
  }
  return total;
}

/**
 * SOMAQUOCIENTE({tabela}; "Numerador"; "Denominador") — soma, por linha preenchida da
 * tabela de produtos, o quociente das duas colunas indicadas. Diferente da soma/subtração
 * (que dá pra fazer combinando SOMAPRODUTO de coluna única com + / - fora da função, já que
 * soma é distributiva), a divisão não é: Σ(a/b) ≠ Σa / Σb — por isso essa função também
 * precisa enxergar a linha inteira, como o SOMAPRODUTO. Linha com denominador zero ou
 * não-numérico não entra na soma (conta como 0), em vez de estourar divisão por zero.
 */
function evaluateSumQuotient(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
): number {
  const [tableArg, numeratorArg, denominatorArg] = args;
  if (tableArg.type !== 'ref' || numeratorArg.type !== 'string' || denominatorArg.type !== 'string') {
    throw new FormulaError(
      'SOMAQUOCIENTE({tabela}; "Numerador"; "Denominador") espera a referência da tabela e ' +
        'dois nomes de coluna entre aspas.',
    );
  }

  lookup(tableArg.code);
  const raw = rawLookup(tableArg.code);
  if (raw === null || raw === undefined) return 0;
  if (!Array.isArray(raw)) {
    throw new FormulaError(`SOMAQUOCIENTE: "{${tableArg.code}}" não é uma tabela de produtos.`);
  }

  let total = 0;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const values = (row as { values?: Record<string, unknown> }).values;
    const numeratorCell = values?.[numeratorArg.value];
    const denominatorCell = values?.[denominatorArg.value];
    const numerator =
      typeof numeratorCell === 'number' && Number.isFinite(numeratorCell) ? numeratorCell : 0;
    const denominator =
      typeof denominatorCell === 'number' && Number.isFinite(denominatorCell) ? denominatorCell : 0;
    if (denominator === 0) continue;
    total += numerator / denominator;
  }
  return total;
}

/**
 * Pontos das opções de uma pergunta pontuada pelo campo calculado; `null` = a opção "não conta"
 * (ex.: Não se aplica) — fica fora da pontuação e do máximo possível.
 */
export type FormulaScoresLookup = (code: string) => Record<string, number | null> | undefined;

function chosenOptions(raw: unknown): unknown[] {
  return (Array.isArray(raw) ? raw : [raw]).filter(
    (value) => value !== null && value !== undefined && value !== '',
  );
}

/**
 * CONFORMIDADE({p1}; {p2}; ...) — % dos pontos obtidos sobre o máximo possível, só nas perguntas
 * respondidas. O máximo de uma pergunta é o maior ponto entre as opções dela (várias marcadas: a
 * soma dos pontos positivos). Pergunta em branco ou respondida com opção que "não conta" fica fora;
 * sem nenhuma que conte, a seção fica sem nota (em branco).
 */
function evaluateConformity(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  let obtained = 0;
  let possible = 0;
  for (const arg of args) {
    if (arg.type !== 'ref') {
      throw new FormulaError('CONFORMIDADE recebe só perguntas, ex.: CONFORMIDADE({p1}; {p2}).');
    }
    const scores = scoresLookup(arg.code);
    if (!scores) {
      throw new FormulaError(`CONFORMIDADE: dê pontos às opções de {${arg.code}}.`);
    }
    // Participa do "algum campo preenchido" do cálculo, como as demais referências.
    lookup(arg.code);
    const chosen = chosenOptions(rawLookup(arg.code));
    if (chosen.length === 0) continue;
    const points = Object.values(scores).filter((value): value is number => value !== null);
    if (Array.isArray(rawLookup(arg.code))) {
      const counted = chosen.map((value) => scores[String(value)]).filter((value) => value !== null);
      obtained += counted.reduce<number>((total, value) => total + (value ?? 0), 0);
      possible += points.filter((value) => value > 0).reduce((total, value) => total + value, 0);
      continue;
    }
    const score = scores[String(chosen[0])];
    if (score === null) continue;
    obtained += score ?? 0;
    possible += Math.max(0, ...points);
  }
  if (possible <= 0) throw new FormulaError('Nenhuma pergunta pontuada respondida.');
  return (obtained / possible) * 100;
}

/** Valores preenchidos dos argumentos: referência em branco fica de fora (não vira zero). */
function filledValues(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number[] {
  const values: number[] = [];
  for (const arg of args) {
    const value = arg.type === 'ref' ? lookup(arg.code) : evaluateNode(arg, lookup, rawLookup, scoresLookup);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  return values;
}

/**
 * ATINGIRAM(marco; {s1}; {s2}; ...) — % dos valores preenchidos que ficaram iguais ou acima do
 * marco (ex.: % das seções com conformidade >= 70). Seção sem nota (outro caminho do formulário)
 * fica fora da conta; nenhuma preenchida = em branco.
 */
function evaluateReachedMark(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  const [markArg, ...valueArgs] = args;
  const mark = evaluateNode(markArg, lookup, rawLookup, scoresLookup);
  const values = filledValues(valueArgs, lookup, rawLookup, scoresLookup);
  if (values.length === 0) throw new FormulaError('Nenhum valor preenchido.');
  return (values.filter((value) => value >= mark).length / values.length) * 100;
}

/** MEDIAPREENCHIDOS({s1}; {s2}; ...) — média só dos valores preenchidos (MEDIA conta branco como 0). */
function evaluateFilledAverage(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  const values = filledValues(args, lookup, rawLookup, scoresLookup);
  if (values.length === 0) throw new FormulaError('Nenhum valor preenchido.');
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * DURACAO({inicio}; {fim}) — horas entre dois horários ("08:30" vale 8,5 na conta). Fim antes do
 * início passa da meia-noite: conta até o dia seguinte (22:00 → 06:00 = 8 horas). Horário em
 * branco deixa o resultado em branco.
 */
function evaluateDuration(
  args: FormulaNode[],
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  const values = filledValues(args, lookup, rawLookup, scoresLookup);
  if (values.length < 2) throw new FormulaError('Preencha os dois horários.');
  const [start, end] = values;
  const hours = end - start;
  return hours < 0 ? hours + 24 : hours;
}

function evaluateCall(
  node: Extract<FormulaNode, { type: 'call' }>,
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  if (node.name === 'SE') {
    const condition = evaluateNode(node.args[0], lookup, rawLookup, scoresLookup);
    return evaluateNode(condition !== 0 ? node.args[1] : node.args[2], lookup, rawLookup, scoresLookup);
  }
  if (node.name === 'E') {
    for (const arg of node.args) {
      if (evaluateNode(arg, lookup, rawLookup, scoresLookup) === 0) return 0;
    }
    return 1;
  }
  if (node.name === 'OU') {
    for (const arg of node.args) {
      if (evaluateNode(arg, lookup, rawLookup, scoresLookup) !== 0) return 1;
    }
    return 0;
  }
  if (node.name === 'SOMAPRODUTO') {
    return evaluateSumProduct(node.args, lookup, rawLookup);
  }
  if (node.name === 'SOMAQUOCIENTE') {
    return evaluateSumQuotient(node.args, lookup, rawLookup);
  }
  if (node.name === 'CONFORMIDADE') {
    return evaluateConformity(node.args, lookup, rawLookup, scoresLookup);
  }
  if (node.name === 'ATINGIRAM') {
    return evaluateReachedMark(node.args, lookup, rawLookup, scoresLookup);
  }
  if (node.name === 'MEDIAPREENCHIDOS') {
    return evaluateFilledAverage(node.args, lookup, rawLookup, scoresLookup);
  }
  if (node.name === 'DURACAO') {
    return evaluateDuration(node.args, lookup, rawLookup, scoresLookup);
  }

  const apply = FUNCTIONS[node.name]?.apply;
  if (!apply) {
    throw new FormulaError(`Função desconhecida: "${node.name}".`);
  }
  return apply(node.args.map((arg) => evaluateNode(arg, lookup, rawLookup, scoresLookup)));
}

export function evaluateNode(
  node: FormulaNode,
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup,
  scoresLookup: FormulaScoresLookup,
): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'ref':
      // Campo ainda em branco entra no cálculo como zero.
      return lookup(node.code) ?? 0;
    case 'string':
      throw new FormulaError(
        'Texto só pode ser usado como argumento de coluna do SOMAPRODUTO/SOMAQUOCIENTE.',
      );
    case 'unary': {
      const value = evaluateNode(node.operand, lookup, rawLookup, scoresLookup);
      return node.op === '-' ? -value : value;
    }
    case 'binary':
      return evaluateBinary(node, lookup, rawLookup, scoresLookup);
    case 'call':
      return evaluateCall(node, lookup, rawLookup, scoresLookup);
    default:
      throw new FormulaError('Fórmula inválida.');
  }
}

/** Avalia a fórmula compilada; devolve `null` quando o cálculo não é possível. */
export function evaluateCompiledFormula(
  formula: CompiledFormula,
  lookup: FormulaLookup,
  rawLookup: FormulaRawLookup = () => undefined,
  scoresLookup: FormulaScoresLookup = () => undefined,
): number | null {
  try {
    const value = evaluateNode(formula.node, lookup, rawLookup, scoresLookup);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function roundTo(value: number, decimals: number): number {
  const safeDecimals = Math.min(Math.max(Math.trunc(decimals) || 0, 0), 10);
  const factor = 10 ** safeDecimals;
  // toPrecision compensa o erro binário (1.005 * 100 = 100.49999999999999).
  const scaled = Number((value * factor).toPrecision(12));
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded / factor;
}

/** Horário "HH:MM" (campo Hora) em horas — "08:30" vale 8,5; `null` quando não é um horário. */
export function timeToHours(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!match) return null;
  const [hours, minutes, seconds] = [match[1], match[2], match[3] ?? '0'].map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours + minutes / 60 + seconds / 3600;
}

/** Horas no formato do relógio — 8,5 vira "8h30"; negativo leva o sinal. */
export function formatHours(value: number): string {
  const totalMinutes = Math.round(Math.abs(value) * 60);
  const sign = value < 0 && totalMinutes > 0 ? '-' : '';
  return `${sign}${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, '0')}`;
}

/**
 * Converte a resposta crua de um campo em número. Aceita o formato monetário
 * brasileiro ("R$ 1.500,00"), booleanos (1/0) e múltipla escolha (quantidade de
 * opções marcadas).
 */
export function coerceAnswerToNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (Array.isArray(raw)) return raw.length > 0 ? raw.length : null;
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .replace(/R\$/gi, '')
    .replace(/%/g, '')
    .replace(/[\s ]/g, '');
  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized = cleaned;

  if (lastDot >= 0 && lastComma >= 0) {
    // O separador decimal é o que aparece por último.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = /^-?\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Pontos de cada opção, por pergunta: `{ codigo_da_pergunta: { valor_interno_da_opcao: pontos } }`. */
export type FormulaOptionScores = Record<string, Record<string, number | null>>;

export type CalculatedFieldSpec = {
  code: string;
  formula: string;
  decimals?: number | null;
  /**
   * Perguntas de escolha pontuadas por este cálculo: dentro da fórmula, `{pergunta}` vale os pontos
   * da opção escolhida (várias marcadas: a soma delas; opção sem pontos: 0) em vez do de-para comum.
   */
  optionScores?: FormulaOptionScores | null;
};

/** Pontos da resposta de uma pergunta de escolha; `null` quando ela está em branco. */
export function scoreOptionAnswer(raw: unknown, scores: Record<string, number | null>): number | null {
  const chosen = (Array.isArray(raw) ? raw : [raw]).filter(
    (value) => value !== null && value !== undefined && value !== '',
  );
  if (chosen.length === 0) return null;
  return chosen.reduce<number>((total, value) => total + (scores[String(value)] ?? 0), 0);
}

type ResolvedValue = { value: number | null; filled: boolean };

function filledOutcome(value: number | null): ResolvedValue {
  return { value, filled: value !== null };
}

/**
 * Calcula todos os campos de fórmula de uma vez, resolvendo as dependências
 * entre eles (um cálculo pode usar o resultado de outro) e cortando referências
 * circulares. Um campo cujas referências estão todas em branco fica em branco,
 * em vez de gravar zero.
 */
export function computeCalculatedFieldValues(
  specs: CalculatedFieldSpec[],
  rawValuesByCode: Record<string, unknown>,
): Record<string, number | null> {
  const specByCode = new Map(specs.map((spec) => [spec.code, spec]));
  const compiledByCode = new Map<string, CompiledFormula | null>();
  const resolvedByCode = new Map<string, ResolvedValue>();
  const visiting = new Set<string>();

  function compile(spec: CalculatedFieldSpec): CompiledFormula | null {
    if (!compiledByCode.has(spec.code)) {
      const result = tryCompileFormula(spec.formula ?? '');
      compiledByCode.set(spec.code, result.ok ? result.formula : null);
    }
    return compiledByCode.get(spec.code) ?? null;
  }

  function resolve(code: string): ResolvedValue {
    const cached = resolvedByCode.get(code);
    if (cached) return cached;

    const spec = specByCode.get(code);
    if (!spec) {
      // Campo Hora entra na conta em horas; os demais, pelo de-para comum.
      const raw = rawValuesByCode[code];
      const value = timeToHours(raw) ?? coerceAnswerToNumber(raw);
      const outcome: ResolvedValue = { value, filled: value !== null };
      resolvedByCode.set(code, outcome);
      return outcome;
    }

    if (visiting.has(code)) {
      // Referência circular: o campo fica em branco em vez de travar o envio.
      return { value: null, filled: false };
    }

    visiting.add(code);
    const compiled = compile(spec);
    let outcome: ResolvedValue = { value: null, filled: false };

    if (compiled) {
      let anyFilled = compiled.refs.length === 0;
      const value = evaluateCompiledFormula(
        compiled,
        (refCode) => {
          const scores = spec.optionScores?.[refCode];
          const dependency: ResolvedValue = scores
            ? filledOutcome(scoreOptionAnswer(rawValuesByCode[refCode], scores))
            : resolve(refCode);
          if (dependency.filled) anyFilled = true;
          return dependency.value;
        },
        (refCode) => rawValuesByCode[refCode],
        (refCode) => spec.optionScores?.[refCode],
      );
      const result =
        value === null || !anyFilled
          ? null
          : roundTo(value, spec.decimals ?? DEFAULT_FORMULA_DECIMALS);
      outcome = { value: result, filled: result !== null };
    }

    visiting.delete(code);
    resolvedByCode.set(code, outcome);
    return outcome;
  }

  const values: Record<string, number | null> = {};
  for (const spec of specs) {
    values[spec.code] = resolve(spec.code).value;
  }
  return values;
}

export function getFormulaDecimals(settings: Record<string, unknown> | null | undefined): number {
  // Em horas o resultado aparece no relógio (8h30) e vai para outras contas (horas × valor da
  // hora): guarda tudo, senão 40 min (0,6667) × R$ 250 sai R$ 166,68 em vez de R$ 166,67.
  if (settings?.formulaFormat === 'hours') return 10;
  const decimals = settings?.formulaDecimals;
  return typeof decimals === 'number' && Number.isFinite(decimals)
    ? Math.min(Math.max(Math.trunc(decimals), 0), 10)
    : DEFAULT_FORMULA_DECIMALS;
}

/** `optionScores` do campo calculado, só com pontos numéricos válidos; `null` quando não há nenhum. */
export function getFormulaOptionScores(
  settings: Record<string, unknown> | null | undefined,
): FormulaOptionScores | null {
  const raw = settings?.optionScores;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result: FormulaOptionScores = {};
  for (const [fieldCode, byOption] of Object.entries(raw as Record<string, unknown>)) {
    if (!byOption || typeof byOption !== 'object' || Array.isArray(byOption)) continue;
    const scores: Record<string, number | null> = {};
    for (const [optionValue, points] of Object.entries(byOption as Record<string, unknown>)) {
      if (points === null || (typeof points === 'number' && Number.isFinite(points))) {
        scores[optionValue] = points;
      }
    }
    result[fieldCode] = scores;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function getFormulaSource(settings: Record<string, unknown> | null | undefined): string {
  const formula = settings?.formula;
  return typeof formula === 'string' ? formula : '';
}

/** Valor formatado para exibição no campo calculado (pt-BR, com prefixo/sufixo). */
export function formatCalculatedValue(
  value: number | null,
  settings: Record<string, unknown> | null | undefined,
): string {
  if (value === null || !Number.isFinite(value)) return '';
  const decimals = getFormulaDecimals(settings);
  const body =
    settings?.formulaFormat === 'hours'
      ? formatHours(value)
      : value.toLocaleString('pt-BR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
  const prefix = typeof settings?.formulaPrefix === 'string' ? settings.formulaPrefix : '';
  const suffix = typeof settings?.formulaSuffix === 'string' ? settings.formulaSuffix : '';
  return `${prefix}${body}${suffix}`;
}
