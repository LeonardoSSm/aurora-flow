import type { ConfigService } from '@nestjs/config';
import { lerConfig } from './app-config';
import { validateEnv } from './validate-env';

function config(valores: Record<string, string>): ConfigService {
  return { get: (chave: string) => valores[chave] } as unknown as ConfigService;
}

describe('lerConfig', () => {
  it('trata valor vazio (como o docker-compose manda) como não configurado', () => {
    const lida = lerConfig(
      config({
        LOOKUP_API_TOKEN: '',
        ERP_DB_HOST: '',
        ERP_DB_NAME: 'tijuca_lookup',
        ERP_DB_USER: 'u',
      }),
    );

    expect(lida.token).toBeUndefined();
    expect(lida.db).toBeUndefined();
  });

  it('monta o banco com os padrões quando host, banco e usuário existem', () => {
    const lida = lerConfig(
      config({ ERP_DB_HOST: '10.0.0.5', ERP_DB_NAME: 'tijuca_lookup', ERP_DB_USER: 'u' }),
    );

    expect(lida.porta).toBe(3100);
    expect(lida.queryTimeoutMs).toBe(5000);
    expect(lida.fonteExemploHabilitada).toBe(false);
    expect(lida.db).toEqual({
      host: '10.0.0.5',
      port: 3306,
      database: 'tijuca_lookup',
      user: 'u',
      password: '',
      connectionLimit: 10,
    });
  });
});

describe('validateEnv', () => {
  it('aceita variáveis vazias', () => {
    expect(() => validateEnv({ LOOKUP_API_TOKEN: '', ERP_DB_PORT: '' })).not.toThrow();
  });

  it('recusa token curto e porta que não é número', () => {
    expect(() => validateEnv({ LOOKUP_API_TOKEN: 'curto' })).toThrow('Configuração inválida');
    expect(() => validateEnv({ ERP_DB_PORT: 'abc' })).toThrow('Configuração inválida');
  });
});
