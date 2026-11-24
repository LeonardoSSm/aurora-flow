import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldSettings } from '../../forms/types';
import { FormulaEditor, type FormulaAvailableField } from './formula-editor';

const timeFields: FormulaAvailableField[] = [
  { code: 'chegada', label: 'Hora de chegada', fieldType: 'time' },
  { code: 'saida', label: 'Hora de saída', fieldType: 'time' },
];

function renderHours(formula: string, availableFields = timeFields) {
  const onChangeSettings = vi.fn();
  render(
    <FormulaEditor
      fieldCode="total"
      settings={{ formula, formulaFormat: 'hours', formulaDecimals: 4 } satisfies FieldSettings}
      availableFields={availableFields}
      onChangeSettings={onChangeSettings}
    />,
  );
  const formulaOf = () => onChangeSettings.mock.calls.at(-1)?.[0].formula;
  return { formulaOf };
}

describe('Total de horas no editor do cálculo', () => {
  it('escolher a chegada já completa a saída com o outro campo de Hora', () => {
    const { formulaOf } = renderHours('');
    fireEvent.change(screen.getByLabelText('Hora de início (ex.: chegada)'), { target: { value: 'chegada' } });
    expect(formulaOf()).toBe('DURACAO({chegada}; {saida})');
  });

  it('escolher num lado a hora do outro inverte os dois e mantém o que vem depois', () => {
    const { formulaOf } = renderHours('DURACAO({chegada}; {saida}) - 1');
    fireEvent.change(screen.getByLabelText('Hora de início (ex.: chegada)'), { target: { value: 'saida' } });
    expect(formulaOf()).toBe('DURACAO({saida}; {chegada}) - 1');
  });

  it('sem dois campos de Hora pede para criá-los antes', () => {
    renderHours('', timeFields.slice(0, 1));
    expect(screen.getByText(/Crie antes dois campos do tipo/)).toBeTruthy();
    expect(screen.queryByLabelText('Hora de início (ex.: chegada)')).toBeNull();
  });

  it('em horas não mostra casas decimais', () => {
    renderHours('DURACAO({chegada}; {saida})');
    expect(screen.queryByText('Casas decimais')).toBeNull();
  });
});
