import { describe, expect, it } from 'vitest';
import {
  auditActionLabel,
  auditEntityLabel,
  auditModuleLabel,
  formatAuditPayload,
} from './audit-labels';

describe('formatAuditPayload', () => {
  it('nunca mostra "[object Object]": objeto e lista viram contagem', () => {
    const text = formatAuditPayload({
      grants: [{ code: 'a' }, { code: 'b' }],
      settings: { a: 1, b: 2, c: 3 },
      previous: null,
    });
    expect(text).not.toContain('[object Object]');
    expect(text).toBe('grants: 2 itens · settings: 3 campos · previous: —');
  });

  it('lista simples aparece por extenso; booleano em português; texto longo é cortado', () => {
    expect(formatAuditPayload({ tags: ['a', 'b'], ok: true })).toBe('tags: a, b · ok: sim');
    const long = formatAuditPayload({ name: 'x'.repeat(100) });
    expect(long.length).toBeLessThan(70);
    expect(long.endsWith('…')).toBe(true);
  });

  it('mostra só os primeiros campos', () => {
    expect(formatAuditPayload({ a: 1, b: 2, c: 3, d: 4 })).toBe('a: 1 · b: 2 · c: 3');
    expect(formatAuditPayload(null)).toBe('');
  });
});

describe('rótulos da auditoria', () => {
  it('traduz módulo, entidade e ação; código desconhecido passa como veio', () => {
    expect(auditModuleLabel('solicitations')).toBe('Solicitações');
    expect(auditEntityLabel('solicitation')).toBe('solicitação');
    expect(auditActionLabel('kanban_move')).toBe('Mudança de fase');
    expect(auditActionLabel('algo_novo')).toBe('algo_novo');
  });
});
