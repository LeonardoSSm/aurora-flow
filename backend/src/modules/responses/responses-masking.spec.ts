import type { FormFieldEntity } from '../../database/entities/form-field.entity';
import type { SubmissionItemEntity } from '../../database/entities/submission-item.entity';
import { maskSensitiveValues } from './responses.service';

function makeField(overrides: Partial<FormFieldEntity> = {}): FormFieldEntity {
  return {
    id: 'field-id',
    code: 'campo',
    isSensitive: false,
    ...overrides,
  } as FormFieldEntity;
}

function makeItem(overrides: Partial<SubmissionItemEntity> = {}): SubmissionItemEntity {
  return {
    id: 'item-id',
    fieldCode: 'campo',
    valueText: 'valor secreto',
    valueNumber: 42,
    valueBoolean: null,
    valueJson: null,
    ...overrides,
  } as SubmissionItemEntity;
}

describe('maskSensitiveValues', () => {
  it('hasSensitiveAccess=true (admin/manager): retorna items sem mascaramento', () => {
    const items = [makeItem({ fieldCode: 'cpf', valueText: '123.456.789-00' })];
    const fields = [makeField({ code: 'cpf', isSensitive: true })];

    const result = maskSensitiveValues(items, fields, true);

    expect(result).toBe(items);
    expect(result[0].valueText).toBe('123.456.789-00');
  });

  it('hasSensitiveAccess=true: retorna items sem mascaramento (segundo caso)', () => {
    const items = [makeItem({ fieldCode: 'senha', valueText: 'segredo' })];
    const fields = [makeField({ code: 'senha', isSensitive: true })];

    const result = maskSensitiveValues(items, fields, true);

    expect(result).toBe(items);
    expect(result[0].valueText).toBe('segredo');
  });

  it('hasSensitiveAccess=false: mascara valueText de campo sensível com ***', () => {
    const items = [makeItem({ fieldCode: 'cpf', valueText: '123.456.789-00' })];
    const fields = [makeField({ code: 'cpf', isSensitive: true })];

    const result = maskSensitiveValues(items, fields, false);

    expect(result[0].valueText).toBe('***');
  });

  it('hasSensitiveAccess=false: mascara valueNumber de campo sensível com null', () => {
    const items = [makeItem({ fieldCode: 'salario', valueText: null, valueNumber: 5000 })];
    const fields = [makeField({ code: 'salario', isSensitive: true })];

    const result = maskSensitiveValues(items, fields, false);

    expect(result[0].valueNumber).toBeNull();
    expect(result[0].valueText).toBe('***');
  });

  it('hasSensitiveAccess=false: mascara campos sensíveis (viewer)', () => {
    const items = [makeItem({ fieldCode: 'rg', valueText: '12.345.678-9' })];
    const fields = [makeField({ code: 'rg', isSensitive: true })];

    const result = maskSensitiveValues(items, fields, false);

    expect(result[0].valueText).toBe('***');
    expect(result[0].valueNumber).toBeNull();
  });

  it('campo não sensível: não é mascarado mesmo sem hasSensitiveAccess', () => {
    const items = [makeItem({ fieldCode: 'nome', valueText: 'Maria' })];
    const fields = [makeField({ code: 'nome', isSensitive: false })];

    const result = maskSensitiveValues(items, fields, false);

    expect(result[0].valueText).toBe('Maria');
  });

  it('sem campos sensíveis: retorna items sem mascaramento mesmo sem hasSensitiveAccess', () => {
    const items = [makeItem(), makeItem({ id: 'item-2', fieldCode: 'outro', valueText: 'x' })];
    const fields = [
      makeField({ code: 'campo', isSensitive: false }),
      makeField({ id: 'f2', code: 'outro', isSensitive: false }),
    ];

    const result = maskSensitiveValues(items, fields, false);

    expect(result).toBe(items);
  });

  it('múltiplos items: apenas sensíveis são mascarados', () => {
    const items = [
      makeItem({ id: 'i1', fieldCode: 'nome', valueText: 'Ana' }),
      makeItem({ id: 'i2', fieldCode: 'cpf', valueText: '111.222.333-44' }),
      makeItem({ id: 'i3', fieldCode: 'email', valueText: 'ana@example.com' }),
    ];
    const fields = [
      makeField({ code: 'nome', isSensitive: false }),
      makeField({ id: 'f2', code: 'cpf', isSensitive: true }),
      makeField({ id: 'f3', code: 'email', isSensitive: false }),
    ];

    const result = maskSensitiveValues(items, fields, false);

    expect(result[0].valueText).toBe('Ana');
    expect(result[1].valueText).toBe('***');
    expect(result[2].valueText).toBe('ana@example.com');
  });

  it('não modifica o item original ao mascarar (imutável)', () => {
    const item = makeItem({ fieldCode: 'cpf', valueText: '000.000.000-00' });
    const fields = [makeField({ code: 'cpf', isSensitive: true })];

    const result = maskSensitiveValues([item], fields, false);

    expect(result[0]).not.toBe(item);
    expect(item.valueText).toBe('000.000.000-00');
  });

  it('campo sensível sem valueText: mascara como *** e valueNumber como null', () => {
    const item = makeItem({ fieldCode: 'score', valueText: null, valueNumber: 100 });
    const fields = [makeField({ code: 'score', isSensitive: true })];

    const result = maskSensitiveValues([item], fields, false);

    expect(result[0].valueText).toBe('***');
    expect(result[0].valueNumber).toBeNull();
    expect(result[0].valueBoolean).toBeNull();
    expect(result[0].valueJson).toBeNull();
  });
});
