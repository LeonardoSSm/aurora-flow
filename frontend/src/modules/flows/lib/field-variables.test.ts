import { describe, expect, it } from 'vitest';
import { fieldVariables } from './field-variables';

describe('fieldVariables', () => {
  it('um campo comum vira uma variável', () => {
    expect(fieldVariables([{ code: 'nome', label: 'Nome', fieldType: 'short_text' }])).toEqual([
      { name: 'nome', label: 'Nome' },
    ]);
  });

  it('campo "Lista do ERP" ganha também {{campo_codigo}}', () => {
    expect(fieldVariables([{ code: 'cliente', label: 'Cliente', fieldType: 'erp_lookup' }])).toEqual([
      { name: 'cliente', label: 'Cliente' },
      { name: 'cliente_codigo', label: 'Cliente (código no ERP)' },
    ]);
  });

  it('seleção ganha {{campo_valor}} (o {{campo}} sai com o rótulo da opção)', () => {
    expect(fieldVariables([{ code: 'motivo', label: 'Motivo', fieldType: 'single_select' }])).toEqual([
      { name: 'motivo', label: 'Motivo' },
      { name: 'motivo_valor', label: 'Motivo (valor interno)' },
    ]);
  });

  it('não duplica quando já existe um campo chamado <campo>_codigo', () => {
    expect(
      fieldVariables([
        { code: 'cliente', label: 'Cliente', fieldType: 'erp_lookup' },
        { code: 'cliente_codigo', label: 'Código digitado', fieldType: 'short_text' },
      ]).map((variable) => variable.name),
    ).toEqual(['cliente', 'cliente_codigo']);
  });
});
