import { maskErpLookupSearch } from './erp-lookup.log';

describe('maskErpLookupSearch', () => {
  it('esconde o texto pesquisado na URL e na query da pesquisa da Lista do ERP', () => {
    const req = {
      url: '/api/v1/public/forms/f1/fields/cliente/lookup?q=Jo%C3%A3o%20Silva&x=1',
      query: { q: 'João Silva', x: '1' },
    };

    expect(maskErpLookupSearch(req)).toEqual({
      url: '/api/v1/public/forms/f1/fields/cliente/lookup?q=***&x=1',
      query: { q: '***', x: '1' },
    });
  });

  it('não mexe nas outras requisições', () => {
    const req = { url: '/api/v1/solicitations?q=compra', query: { q: 'compra' } };

    expect(maskErpLookupSearch(req)).toEqual({
      url: '/api/v1/solicitations?q=compra',
      query: { q: 'compra' },
    });
  });

  it('pesquisa sem texto (modo lista) passa como está', () => {
    const req = { url: '/api/v1/public/forms/f1/fields/filial/lookup', query: {} };

    expect(maskErpLookupSearch(req)).toEqual(req);
  });
});
