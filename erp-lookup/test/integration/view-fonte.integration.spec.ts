import type { AppConfig, ConfigBanco } from '../../src/config/app-config';
import { BancoIndisponivelError, MysqlService } from '../../src/db/mysql.service';
import { ViewFonte } from '../../src/fontes/view.fonte';

const BANCO: ConfigBanco = {
  host: process.env.ERP_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.ERP_DB_PORT ?? 3307),
  database: 'tijuca_lookup',
  user: 'tijuca_lookup',
  password: process.env.ERP_DB_PASSWORD ?? 'tijuca-lookup-dev',
  connectionLimit: 2,
};

const config: AppConfig = {
  porta: 0,
  queryTimeoutMs: 5000,
  fonteExemploHabilitada: true,
  db: BANCO,
};

describe('ViewFonte contra o MySQL de desenvolvimento (dev/seed.sql)', () => {
  let db: MysqlService;
  let fonte: ViewFonte;

  beforeAll(() => {
    db = new MysqlService(config);
    fonte = new ViewFonte(
      db,
      { id: 'exemplo', label: 'Exemplo', modo: 'pesquisa', view: 'vw_exemplo' },
      config.queryTimeoutMs,
    );
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('o banco responde', async () => {
    await expect(db.ping()).resolves.toBe('ok');
  });

  it('pesquisa ignora acento e maiúscula', async () => {
    await expect(fonte.pesquisar('ACUCAR', 20)).resolves.toEqual([
      { value: '001', label: '001 — Açúcar cristal' },
    ]);
  });

  it('pesquisa pelo código também', async () => {
    const items = await fonte.pesquisar('006', 20);
    expect(items.map((item) => item.value)).toEqual(['006']);
  });

  it('não devolve o que a view filtra (inativo)', async () => {
    await expect(fonte.pesquisar('inativo', 20)).resolves.toEqual([]);
    await expect(fonte.resolver('003')).resolves.toBeNull();
  });

  it('% e _ digitados são literais, não curingas', async () => {
    const porcento = await fonte.pesquisar('100%', 20);
    expect(porcento.map((item) => item.value)).toEqual(['004']);

    const sublinhado = await fonte.pesquisar('a_a', 20);
    expect(sublinhado.map((item) => item.value)).toEqual(['005']);

    // Sem o escape, "_" casaria com qualquer caractere e "f_r" acharia "Farinha"/"Fermento".
    await expect(fonte.pesquisar('f_r', 20)).resolves.toEqual([]);
  });

  it('texto com aspas e SQL é só texto', async () => {
    await expect(fonte.pesquisar("' OR 1=1 -- ", 20)).resolves.toEqual([]);
  });

  it('ordena pelo label e respeita o limite', async () => {
    const items = await fonte.pesquisar('0', 3);
    expect(items.map((item) => item.value)).toEqual(['001', '002', '004']);
  });

  it('resolve um código existente', async () => {
    await expect(fonte.resolver('002')).resolves.toEqual({
      value: '002',
      label: '002 — Café torrado',
    });
  });

  it('o usuário da API só enxerga as views, não as tabelas do ERP', async () => {
    await expect(db.consultar('SELECT * FROM erp_demo.itens_exemplo', [])).rejects.toBeInstanceOf(
      BancoIndisponivelError,
    );
  });

  it('consulta lenta é cortada pelo timeout', async () => {
    const inicio = Date.now();
    await expect(db.consultar('SELECT SLEEP(5)', [], 500)).rejects.toBeInstanceOf(
      BancoIndisponivelError,
    );
    expect(Date.now() - inicio).toBeLessThan(3000);
  });
});

describe('MysqlService com o banco fora', () => {
  it('ping responde "down" e consulta lança BancoIndisponivelError', async () => {
    const fora = new MysqlService({
      ...config,
      db: { ...BANCO, host: '127.0.0.1', port: 1 },
    });
    await expect(fora.ping()).resolves.toBe('down');
    await expect(fora.consultar('SELECT 1', [])).rejects.toBeInstanceOf(BancoIndisponivelError);
    await fora.onModuleDestroy();
  });
});
