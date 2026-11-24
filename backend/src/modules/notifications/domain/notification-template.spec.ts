import {
  escapeHtml,
  extractTemplateVariables,
  hasMalformedTokens,
  renderTemplate,
  sanitizeText,
  toSingleLine,
} from './notification-template';

describe('notification-template', () => {
  describe('renderTemplate', () => {
    it('substitui variáveis simples e com caminho', () => {
      const out = renderTemplate('Olá {{nome}}, pedido {{payload.header.numero}}.', {
        nome: 'Maria',
        'payload.header.numero': 42,
      });
      expect(out.text).toBe('Olá Maria, pedido 42.');
      expect(out.usedVariables).toEqual(['nome', 'payload.header.numero']);
      expect(out.missingVariables).toEqual([]);
      expect(out.truncated).toBe(false);
    });

    it('aceita espaços dentro das chaves', () => {
      expect(renderTemplate('{{  nome  }}', { nome: 'X' }).text).toBe('X');
    });

    it('variável inexistente vira vazio e é reportada (sem lançar)', () => {
      const out = renderTemplate('Oi {{ausente}}!', {});
      expect(out.text).toBe('Oi !');
      expect(out.missingVariables).toEqual(['ausente']);
    });

    it('valor nulo/indefinido vira vazio mas conta como existente', () => {
      const out = renderTemplate('[{{a}}][{{b}}]', { a: null, b: undefined });
      expect(out.text).toBe('[][]');
      expect(out.missingVariables).toEqual([]);
    });

    it('converte número e booleano para texto', () => {
      expect(renderTemplate('{{n}}/{{b}}', { n: 3.5, b: false }).text).toBe('3.5/false');
    });

    it('PASSADA ÚNICA: um valor contendo {{x}} não é reinterpretado', () => {
      const out = renderTemplate('{{nome}}', { nome: '{{segredo}}', segredo: 'SENHA' });
      expect(out.text).toBe('{{segredo}}');
      expect(out.text).not.toContain('SENHA');
    });

    it('não acessa o protótipo (__proto__, constructor, toString)', () => {
      const out = renderTemplate('{{__proto__}}|{{constructor}}|{{toString}}|{{hasOwnProperty}}', {});
      expect(out.text).toBe('|||');
      expect(out.missingVariables).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty']);
    });

    it('não executa código nem expressões: só nomes são tokens', () => {
      const out = renderTemplate('{{1+1}} {{process.exit()}} ${7*7} {{a.b}}', { 'a.b': 'ok' });
      expect(out.text).toBe('{{1+1}} {{process.exit()}} ${7*7} ok');
    });

    it('não gera HTML: tags ficam literais (o escape é do adapter)', () => {
      const out = renderTemplate('{{x}}', { x: '<script>alert(1)</script>' });
      expect(out.text).toBe('<script>alert(1)</script>');
    });

    it('remove caracteres de controle e de direção, mantém quebra de linha e emoji composto', () => {
      const family = '👨‍👩‍👧';
      const out = renderTemplate(`a\u0000b‮c​d\r\ne ${family}`, {});
      expect(out.text).toBe(`abcd\ne ${family}`);
    });

    it('trunca com reticências no limite', () => {
      const out = renderTemplate('abcdefghij', {}, { maxLength: 5 });
      expect(out.text).toBe('abcd…');
      expect(out.text.length).toBe(5);
      expect(out.truncated).toBe(true);
    });

    it('não trunca quando cabe exatamente', () => {
      const out = renderTemplate('abcde', {}, { maxLength: 5 });
      expect(out.text).toBe('abcde');
      expect(out.truncated).toBe(false);
    });

    it('faz trim da saída', () => {
      expect(renderTemplate('  {{a}}  ', { a: ' x ' }).text).toBe('x');
    });

    it('lida com modelo vazio/nulo', () => {
      expect(renderTemplate('', {}).text).toBe('');
      expect(renderTemplate(undefined as never, {}).text).toBe('');
    });
  });

  describe('extractTemplateVariables', () => {
    it('lista nomes únicos em ordem de aparição', () => {
      expect(extractTemplateVariables('{{a}} {{b.c}} {{a}} {{ d }}')).toEqual(['a', 'b.c', 'd']);
    });
    it('ignora tokens malformados', () => {
      expect(extractTemplateVariables('{{ 1x }} {{a b}} {{ok}}')).toEqual(['ok']);
    });
  });

  describe('hasMalformedTokens', () => {
    it.each(['{{nome', 'nome}}', '{{ a b }}', '{{1x}}', '{{a}} e {{', '{{}}'])(
      'detecta "%s"',
      (template) => {
        // "nome}}" não tem abertura: não é malformado para o contador de aberturas
        const expected = template !== 'nome}}';
        expect(hasMalformedTokens(template)).toBe(expected);
      },
    );
    it('aceita modelos bem formados e sem variáveis', () => {
      expect(hasMalformedTokens('Olá {{nome}} {{a.b}}')).toBe(false);
      expect(hasMalformedTokens('sem variáveis')).toBe(false);
      expect(hasMalformedTokens('')).toBe(false);
    });
  });

  describe('helpers de saída', () => {
    it('escapeHtml neutraliza tags e aspas', () => {
      expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
        '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
      );
    });
    it('toSingleLine remove quebras (anti header-injection)', () => {
      expect(toSingleLine('Assunto\r\nBcc: alguem@x.com')).toBe('Assunto Bcc: alguem@x.com');
    });
    it('sanitizeText normaliza CRLF', () => {
      expect(sanitizeText('a\r\nb\rc')).toBe('a\nb\nc');
    });
  });
});
