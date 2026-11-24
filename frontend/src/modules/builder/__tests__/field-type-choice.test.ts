import { describe, expect, it } from 'vitest';
import { parsePastedOptions } from '../components/paste-options';
import { createDraftField } from '../state/draft.helpers';
import {
  applyFieldTypeChoice,
  fieldTypeChoiceLabel,
  fieldTypeChoiceOf,
  fieldTypePickerOptions,
  isDropdownField,
  sanitizeFieldSettings,
} from '../types';

describe('Lista suspensa no seletor de tipo', () => {
  it('aparece logo depois da seleção múltipla', () => {
    const values = fieldTypePickerOptions.map((option) => option.value);
    const index = values.indexOf('multi_select');
    expect(values.slice(index + 1, index + 3)).toEqual(['dropdown_single', 'dropdown_multi']);
  });

  it('vira a seleção com displayAs e volta para botões ao trocar', () => {
    expect(applyFieldTypeChoice('dropdown_single', {})).toEqual({
      fieldType: 'single_select',
      settingsJson: { displayAs: 'dropdown' },
    });
    expect(applyFieldTypeChoice('dropdown_multi', {})).toEqual({
      fieldType: 'multi_select',
      settingsJson: { displayAs: 'dropdown' },
    });
    expect(applyFieldTypeChoice('single_select', { displayAs: 'dropdown' })).toEqual({
      fieldType: 'single_select',
      settingsJson: {},
    });
    expect(applyFieldTypeChoice('number', { displayAs: 'dropdown' }).settingsJson.displayAs).toBeUndefined();
  });

  it('o seletor reconhece o campo salvo', () => {
    expect(fieldTypeChoiceOf('single_select', { displayAs: 'dropdown' })).toBe('dropdown_single');
    expect(fieldTypeChoiceOf('multi_select', { displayAs: 'dropdown' })).toBe('dropdown_multi');
    expect(fieldTypeChoiceOf('single_select', {})).toBe('single_select');
    expect(fieldTypeChoiceOf('short_text', { displayAs: 'dropdown' })).toBe('short_text');
    expect(fieldTypeChoiceLabel('single_select', { displayAs: 'dropdown' })).toBe('Lista Suspensa');
    expect(isDropdownField({ fieldType: 'multi_select', settingsJson: { displayAs: 'dropdown' } })).toBe(true);
  });

  it('displayAs sobrevive à limpeza da configuração só na seleção', () => {
    expect(sanitizeFieldSettings('single_select', { displayAs: 'dropdown' })).toEqual({ displayAs: 'dropdown' });
    expect(sanitizeFieldSettings('multi_select', { displayAs: 'buttons' })).toEqual({});
  });

  it('o campo novo criado pelo menu já vem como lista suspensa', () => {
    const field = createDraftField([], 'dropdown_single');
    expect(field.fieldType).toBe('single_select');
    expect(field.settingsJson).toEqual({ displayAs: 'dropdown' });
    expect(field.label).toBe('Lista Suspensa');
    expect(createDraftField([], 'number').settingsJson).toEqual({});
  });
});

describe('parsePastedOptions', () => {
  it('uma por linha, sem vazias, repetidas ou marcadores de lista', () => {
    expect(parsePastedOptions('- Alfa\n\n• Beta\n1. Gama\n2) Delta\nalfa\n  Épsilon  ')).toEqual([
      'Alfa',
      'Beta',
      'Gama',
      'Delta',
      'Épsilon',
    ]);
  });

  it('ignora o que já existe', () => {
    expect(parsePastedOptions('Opção 1\nNova', ['opção 1'])).toEqual(['Nova']);
  });
});
