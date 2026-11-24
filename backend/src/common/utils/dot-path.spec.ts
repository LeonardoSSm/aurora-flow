import { resolveEmailList, resolvePath, toEmailList } from './dot-path';

describe('resolvePath', () => {
  it('resolves a nested object path', () => {
    expect(resolvePath({ header: { numeroPedido: '123' } }, 'header.numeroPedido')).toBe('123');
  });

  it('resolves an array index segment', () => {
    expect(resolvePath({ items: [{ codigo: 'A1' }] }, 'items.0.codigo')).toBe('A1');
  });

  it('returns undefined when an intermediate segment is missing', () => {
    expect(resolvePath({ header: {} }, 'header.numeroPedido')).toBeUndefined();
  });

  it('returns undefined when an intermediate value is not an object', () => {
    expect(resolvePath({ header: 'x' }, 'header.numeroPedido')).toBeUndefined();
  });

  it('returns undefined for an empty path', () => {
    expect(resolvePath({ header: {} }, '')).toBeUndefined();
  });

  it('returns undefined when the root is null/undefined', () => {
    expect(resolvePath(null, 'header.numeroPedido')).toBeUndefined();
    expect(resolvePath(undefined, 'header.numeroPedido')).toBeUndefined();
  });
});

describe('resolveEmailList', () => {
  it('resolves an array of plain email strings', () => {
    expect(resolveEmailList({ aprovadores: ['A@x.com', 'b@x.com'] }, 'aprovadores')).toEqual([
      'a@x.com',
      'b@x.com',
    ]);
  });

  it('resolves an array of objects with an email key', () => {
    expect(
      resolveEmailList(
        { aprovadores: [{ nome: 'A', email: 'a@x.com' }, { nome: 'B', email: 'B@x.com' }] },
        'aprovadores',
      ),
    ).toEqual(['a@x.com', 'b@x.com']);
  });

  it('resolves a comma/semicolon separated string', () => {
    expect(resolveEmailList({ aprovadores: 'a@x.com, b@x.com; c@x.com' }, 'aprovadores')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });

  it('dedupes case-insensitively', () => {
    expect(resolveEmailList({ aprovadores: ['a@x.com', 'A@x.com'] }, 'aprovadores')).toEqual([
      'a@x.com',
    ]);
  });

  it('returns an empty array when the path resolves to nothing', () => {
    expect(resolveEmailList({}, 'aprovadores')).toEqual([]);
  });
});

describe('toEmailList', () => {
  it('normalizes a single e-mail string (ex.: valor de um campo de e-mail)', () => {
    expect(toEmailList('  Gestor@Empresa.com ')).toEqual(['gestor@empresa.com']);
  });

  it('returns an empty array for empty or non-string values', () => {
    expect(toEmailList('')).toEqual([]);
    expect(toEmailList(null)).toEqual([]);
    expect(toEmailList(42)).toEqual([]);
  });
});
