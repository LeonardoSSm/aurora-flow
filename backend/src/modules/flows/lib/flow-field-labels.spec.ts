import { buildFieldLabels, fieldTemplateValue, type ChoiceOptionsByCode } from './flow-field-labels';
import { buildFlowTemplateVariables } from './flow-template-variables';
import type { FlowExecutionContext } from '../types/flow.types';

const OPTIONS: ChoiceOptionsByCode = new Map([
  ['motivo', new Map([['cliente_desistiu', 'Cliente desistiu'], ['pedido_duplicado', 'Pedido duplicado']])],
  ['setores', new Map([['log', 'Logística'], ['fin', 'Financeiro']])],
]);

describe('buildFieldLabels', () => {
  it('troca o valor interno da escolha pelo rótulo; o resto fica de fora', () => {
    expect(
      buildFieldLabels({ motivo: 'cliente_desistiu', pedido: '123', setores: ['log', 'fin'] }, OPTIONS),
    ).toEqual({ motivo: 'Cliente desistiu', setores: 'Logística, Financeiro' });
  });

  it('valor que não está nas opções (opção apagada) não ganha rótulo; vazio também não', () => {
    expect(buildFieldLabels({ motivo: 'antigo', setores: null }, OPTIONS)).toEqual({});
  });
});

describe('fieldTemplateValue ({{campo}} nos textos do fluxo)', () => {
  const ctx = {
    fields: { motivo: 'cliente_desistiu', pedido: '123' },
    fieldLabels: { motivo: 'Cliente desistiu' },
    metadata: { origem: 'webhook' },
  };

  it('{{motivo}} é o rótulo e {{motivo_valor}} o valor interno', () => {
    expect(fieldTemplateValue(ctx, 'motivo')).toBe('Cliente desistiu');
    expect(fieldTemplateValue(ctx, 'motivo_valor')).toBe('cliente_desistiu');
  });

  it('campo comum e metadado seguem como antes; _valor de campo sem opções não existe', () => {
    expect(fieldTemplateValue(ctx, 'pedido')).toBe('123');
    expect(fieldTemplateValue(ctx, 'origem')).toBe('webhook');
    expect(fieldTemplateValue(ctx, 'pedido_valor')).toBeUndefined();
  });

  it('campo de verdade chamado "<campo>_valor" ganha do atalho', () => {
    const own = { ...ctx, fields: { ...ctx.fields, motivo_valor: 'meu campo' } };
    expect(fieldTemplateValue(own, 'motivo_valor')).toBe('meu campo');
  });
});

describe('buildFlowTemplateVariables (nó de Notificação)', () => {
  it('a escolha entra pelo rótulo e com _valor', () => {
    const variables = buildFlowTemplateVariables({
      eventName: 'x',
      fields: { motivo: 'pedido_duplicado' },
      fieldLabels: { motivo: 'Pedido duplicado' },
    } as FlowExecutionContext);
    expect(variables.motivo).toBe('Pedido duplicado');
    expect(variables.motivo_valor).toBe('pedido_duplicado');
  });
});
