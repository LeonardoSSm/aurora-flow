import { parseErpLookupSettings, toPublicErpLookupSettings } from './erp-lookup.settings';

const CONECTOR = '6f1c2b8e-3d4a-4f5b-9c7d-1e2f3a4b5c6d';

describe('parseErpLookupSettings', () => {
  it('aplica os padrões: modo pesquisa, 3 caracteres, login desligado', () => {
    expect(parseErpLookupSettings({ erpConnectorId: CONECTOR, fonte: 'clientes' })).toEqual({
      erpConnectorId: CONECTOR,
      fonte: 'clientes',
      modo: 'pesquisa',
      minCaracteres: 3,
      exigirLogin: false,
      placeholder: null,
    });
  });

  it('lê o que foi configurado', () => {
    expect(
      parseErpLookupSettings({
        erpConnectorId: CONECTOR,
        fonte: ' filiais ',
        modo: 'lista',
        minCaracteres: 4,
        exigirLogin: true,
        placeholder: ' Escolha a filial ',
      }),
    ).toMatchObject({
      fonte: 'filiais',
      modo: 'lista',
      minCaracteres: 4,
      exigirLogin: true,
      placeholder: 'Escolha a filial',
    });
  });

  it('mínimo de caracteres fica entre 2 (limite da API) e 20', () => {
    expect(
      parseErpLookupSettings({ erpConnectorId: CONECTOR, fonte: 'x', minCaracteres: 1 })
        ?.minCaracteres,
    ).toBe(2);
    expect(
      parseErpLookupSettings({ erpConnectorId: CONECTOR, fonte: 'x', minCaracteres: 99 })
        ?.minCaracteres,
    ).toBe(20);
  });

  it('só liga o login com true de verdade', () => {
    expect(
      parseErpLookupSettings({ erpConnectorId: CONECTOR, fonte: 'x', exigirLogin: 'true' })
        ?.exigirLogin,
    ).toBe(false);
  });

  it('null quando falta conector válido ou lista (campo ainda em montagem)', () => {
    expect(parseErpLookupSettings(null)).toBeNull();
    expect(parseErpLookupSettings({ fonte: 'clientes' })).toBeNull();
    expect(parseErpLookupSettings({ erpConnectorId: 'nao-e-uuid', fonte: 'clientes' })).toBeNull();
    expect(parseErpLookupSettings({ erpConnectorId: CONECTOR, fonte: '  ' })).toBeNull();
  });
});

describe('toPublicErpLookupSettings', () => {
  it('tira conector e lista e mantém o que o formulário precisa para desenhar o campo', () => {
    const publico = toPublicErpLookupSettings({
      erpConnectorId: CONECTOR,
      fonte: 'clientes',
      modo: 'pesquisa',
      minCaracteres: 3,
      exigirLogin: false,
      placeholder: 'Busque o cliente',
      helpText: 'Ajuda',
    });

    expect(publico).toEqual({
      modo: 'pesquisa',
      minCaracteres: 3,
      exigirLogin: false,
      placeholder: 'Busque o cliente',
      helpText: 'Ajuda',
    });
  });

  it('campo sem configuração ainda sai com os padrões', () => {
    expect(toPublicErpLookupSettings(null)).toEqual({
      modo: 'pesquisa',
      minCaracteres: 3,
      exigirLogin: false,
      placeholder: null,
    });
  });
});
