import { buildFlowFieldValues, buildPhaseFieldValues } from './flow-field-values';

function item(fieldCode: string, values: Partial<Record<string, unknown>>) {
  return {
    fieldCode,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    ...values,
  } as never;
}

const ERP_ANSWER = {
  value: '000123',
  label: 'ACME LTDA',
  fonte: 'clientes',
  resolvidoEm: '2026-10-07T12:00:00.000Z',
};

describe('buildFlowFieldValues', () => {
  it('mantém a precedência de sempre: texto, número, booleano, json', () => {
    expect(
      buildFlowFieldValues([
        item('nome', { valueText: 'Ana' }),
        item('qtd', { valueNumber: 3 }),
        item('aceite', { valueBoolean: false }),
        item('itens', { valueJson: ['a', 'b'] }),
        item('vazio', {}),
      ]),
    ).toEqual({ nome: 'Ana', qtd: 3, aceite: false, itens: ['a', 'b'], vazio: null });
  });

  it('Lista do ERP: {{campo}} é o nome e {{campo_codigo}} é o código', () => {
    expect(
      buildFlowFieldValues([item('cliente', { valueText: 'ACME LTDA', valueJson: ERP_ANSWER })]),
    ).toEqual({ cliente: 'ACME LTDA', cliente_codigo: '000123' });
  });

  it('valueJson de outro formato não gera _codigo', () => {
    const fields = buildFlowFieldValues([
      item('anexo', { valueJson: { url: 'https://x/y.pdf', name: 'y.pdf' } }),
      item('produtos', { valueJson: [{ produto: 'Caneta', values: {} }] }),
      item('quase', { valueJson: { value: '1', label: 'Um' } }),
    ]);

    expect(Object.keys(fields).sort()).toEqual(['anexo', 'produtos', 'quase']);
  });

  it('não sobrescreve um campo de verdade chamado <campo>_codigo', () => {
    expect(
      buildFlowFieldValues([
        item('cliente', { valueText: 'ACME LTDA', valueJson: ERP_ANSWER }),
        item('cliente_codigo', { valueText: 'digitado pelo usuário' }),
      ]),
    ).toEqual({ cliente: 'ACME LTDA', cliente_codigo: 'digitado pelo usuário' });
  });

  it('respostas sobrescrevem a base; sem respostas, devolve a base', () => {
    expect(buildFlowFieldValues([item('nome', { valueText: 'Novo' })], { nome: 'Velho', x: 1 })).toEqual({
      nome: 'Novo',
      x: 1,
    });
    expect(buildFlowFieldValues(undefined, { x: 1 })).toEqual({ x: 1 });
  });
});

describe('buildPhaseFieldValues', () => {
  it('lê cada campo de fase pela mesma precedência das respostas, sem o "_codigo" do ERP', () => {
    expect(
      buildPhaseFieldValues([
        item('romaneio', { valueText: 'R-77' }),
        item('volumes', { valueNumber: 4 }),
        item('retirado_de_rota', { valueBoolean: false }),
        item('cliente', { valueJson: ERP_ANSWER }),
        item('vazio', {}),
      ]),
    ).toEqual({
      romaneio: 'R-77',
      volumes: 4,
      retirado_de_rota: false,
      cliente: ERP_ANSWER,
      vazio: null,
    });
  });

  it('sem valores salvos devolve um mapa vazio', () => {
    expect(buildPhaseFieldValues(undefined)).toEqual({});
  });
});
