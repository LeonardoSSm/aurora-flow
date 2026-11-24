import type { MysqlService } from '../db/mysql.service';
import { ViewFonte } from './view.fonte';

function criar(rows: unknown[] = []) {
  const consultar = jest.fn().mockResolvedValue(rows);
  const db = { consultar } as unknown as MysqlService;
  const fonte = new ViewFonte(
    db,
    { id: 'clientes', label: 'Clientes', modo: 'pesquisa', view: 'vw_clientes' },
    5000,
  );
  return { fonte, consultar };
}

describe('ViewFonte', () => {
  it('pesquisa com LIKE parametrizado, escape explícito, limite e tempo máximo', async () => {
    const { fonte, consultar } = criar([{ value: '001', label: 'Cliente A' }]);

    const items = await fonte.pesquisar("acme' OR 1=1", 20);

    expect(items).toEqual([{ value: '001', label: 'Cliente A' }]);
    const [sql, params] = consultar.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('/*+ MAX_EXECUTION_TIME(5000) */');
    expect(sql).toContain('FROM `vw_clientes`');
    expect(sql).toContain("WHERE busca LIKE ? ESCAPE '!'");
    expect(sql).toContain('ORDER BY label LIMIT 20');
    // O texto digitado só vai como parâmetro, nunca dentro do SQL.
    expect(sql).not.toContain('acme');
    expect(params).toEqual(["%acme' OR 1=1%"]);
  });

  it('sem texto (modo lista) não filtra', async () => {
    const { fonte, consultar } = criar();

    await fonte.pesquisar('', 500);

    const [sql, params] = consultar.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });

  it('recusa limite que não é inteiro positivo', async () => {
    const { fonte, consultar } = criar();

    await expect(fonte.pesquisar('cli', 0)).rejects.toThrow('Limite inválido');
    await expect(fonte.pesquisar('cli', 2.5)).rejects.toThrow('Limite inválido');
    expect(consultar).not.toHaveBeenCalled();
  });

  it('resolve pelo código e devolve null quando não acha', async () => {
    const { fonte, consultar } = criar([]);

    await expect(fonte.resolver('999')).resolves.toBeNull();
    const [sql, params] = consultar.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE value = ? LIMIT 1');
    expect(params).toEqual(['999']);
  });

  it('converte código numérico vindo da view em texto', async () => {
    const { fonte } = criar([{ value: 42, label: 'Quarenta e dois' }]);

    await expect(fonte.resolver('42')).resolves.toEqual({ value: '42', label: 'Quarenta e dois' });
  });

  it('recusa nome de view que poderia injetar SQL', () => {
    const db = { consultar: jest.fn() } as unknown as MysqlService;
    expect(
      () =>
        new ViewFonte(db, { id: 'x', label: 'X', modo: 'lista', view: 'vw; DROP TABLE y' }, 5000),
    ).toThrow('Nome de view inválido');
  });
});
