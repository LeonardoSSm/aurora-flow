import {
  NotificationChannelError,
  classifyError,
  classifyHttpStatus,
  maskAddress,
  sanitizeErrorMessage,
} from './notification-errors';

describe('notification-errors', () => {
  describe('classifyHttpStatus', () => {
    it.each([
      [429, 'rate_limited'],
      [408, 'timeout'],
      [401, 'not_configured'],
      [403, 'not_configured'],
      [500, 'transient'],
      [502, 'transient'],
      [503, 'transient'],
      [400, 'permanent'],
      [404, 'permanent'],
      [422, 'permanent'],
      [200, 'unknown'],
    ])('HTTP %i → %s', (status, category) => {
      expect(classifyHttpStatus(status)).toBe(category);
    });
  });

  describe('classifyError', () => {
    it('devolve NotificationChannelError como está', () => {
      const original = new NotificationChannelError('x', 'permanent');
      expect(classifyError(original)).toBe(original);
    });

    it('axios com resposta 429 → rate_limited com Retry-After em segundos', () => {
      const result = classifyError({
        isAxiosError: true,
        response: { status: 429, headers: { 'retry-after': '7' } },
      });
      expect(result.category).toBe('rate_limited');
      expect(result.retryAfterMs).toBe(7000);
      expect(result.httpStatus).toBe(429);
    });

    it('axios com resposta 400 → permanent; 503 → transient', () => {
      expect(classifyError({ isAxiosError: true, response: { status: 400 } }).category).toBe('permanent');
      expect(classifyError({ isAxiosError: true, response: { status: 503 } }).category).toBe('transient');
    });

    it('axios sem resposta: timeout vs. rede', () => {
      expect(classifyError({ isAxiosError: true, code: 'ECONNABORTED' }).category).toBe('timeout');
      expect(classifyError({ isAxiosError: true, code: 'ETIMEDOUT' }).category).toBe('timeout');
      expect(classifyError({ isAxiosError: true, code: 'ECONNRESET' }).category).toBe('transient');
      expect(classifyError({ isAxiosError: true, code: 'ENOTFOUND' }).category).toBe('transient');
      expect(classifyError({ isAxiosError: true }).category).toBe('transient');
    });

    it('nodemailer: EAUTH, EENVELOPE e códigos SMTP', () => {
      expect(classifyError({ code: 'EAUTH' }).category).toBe('not_configured');
      expect(classifyError({ code: 'EENVELOPE' }).category).toBe('invalid_recipient');
      expect(classifyError({ responseCode: 550 }).category).toBe('invalid_recipient');
      expect(classifyError({ responseCode: 421 }).category).toBe('transient');
      expect(classifyError({ responseCode: 554 }).category).toBe('permanent');
      expect(classifyError({ code: 'ETIMEDOUT' }).category).toBe('timeout');
      expect(classifyError({ code: 'ECONNECTION' }).category).toBe('transient');
    });

    it('AbortError e mensagens de timeout → timeout', () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      expect(classifyError(abort).category).toBe('timeout');
      expect(classifyError(new Error('Operation timed out')).category).toBe('timeout');
    });

    it('qualquer outra coisa → unknown (retentável, mas auditável)', () => {
      expect(classifyError(new Error('boom')).category).toBe('unknown');
      expect(classifyError('texto solto').category).toBe('unknown');
      expect(classifyError(undefined).category).toBe('unknown');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('remove e-mails, telefones e URLs', () => {
      const out = sanitizeErrorMessage(
        'Falha para joao.silva@empresa.com.br (+55 85 99999-1234) em https://api.x.com/v1?token=abc',
      );
      expect(out).not.toContain('joao.silva');
      expect(out).not.toContain('99999');
      expect(out).not.toContain('api.x.com');
      expect(out).toContain('[email]');
      expect(out).toContain('[number]');
      expect(out).toContain('[url]');
    });

    it('remove cabeçalhos de autenticação e pares chave=valor de segredos', () => {
      const out = sanitizeErrorMessage(
        'Authorization: Bearer abc.def.ghi apikey=SEGREDO123 password: hunter2 token=xyz',
      );
      expect(out).not.toMatch(/abc\.def\.ghi/);
      expect(out).not.toContain('SEGREDO123');
      expect(out).not.toContain('hunter2');
      expect(out).not.toContain('xyz');
    });

    it('remove tokens longos e limita o tamanho', () => {
      const token = 'A'.repeat(40);
      expect(sanitizeErrorMessage(`erro ${token}`)).not.toContain(token);
      const long = sanitizeErrorMessage('x '.repeat(500), 50);
      expect(long.length).toBe(50);
      expect(long.endsWith('…')).toBe(true);
    });

    it('trata null/undefined', () => {
      expect(sanitizeErrorMessage(null)).toBe('');
      expect(sanitizeErrorMessage(undefined)).toBe('');
    });
  });

  describe('maskAddress', () => {
    it('mascara e-mail mantendo o domínio', () => {
      expect(maskAddress('maria.souza@empresa.com')).toBe('ma***@empresa.com');
      expect(maskAddress('a@b.com')).toBe('a***@b.com');
    });

    it('mascara telefone mantendo os 4 últimos dígitos', () => {
      expect(maskAddress('5585999991234')).toBe('***1234');
      expect(maskAddress('+55 (85) 99999-1234')).toBe('***1234');
    });

    it('trata vazio', () => {
      expect(maskAddress('')).toBe('');
      expect(maskAddress(null)).toBe('');
      expect(maskAddress('123')).toBe('***');
    });
  });
});
