import { describe, expect, it } from 'vitest';
import {
  CARD_DISPLAY_MAX_FIELDS,
  DEFAULT_CARD_DISPLAY,
  addField,
  cardNumber,
  displayOrDefault,
  formatElapsed,
  moveField,
  normalizeDraft,
  removeField,
  renameField,
  sameCardDisplay,
  toggleIndicator,
  type CardDisplay,
} from './card-display';

const empty: CardDisplay = { indicators: [], fields: [] };

describe('card-display (editor)', () => {
  it('sem configuração vale o card de sempre', () => {
    expect(displayOrDefault(undefined)).toBe(DEFAULT_CARD_DISPLAY);
    expect(displayOrDefault(empty)).toBe(empty);
  });

  it('liga e desliga indicador', () => {
    const on = toggleIndicator(empty, 'requester');
    expect(on.indicators).toEqual(['requester']);
    expect(toggleIndicator(on, 'requester').indicators).toEqual([]);
  });

  it('adiciona campo sem repetir e respeita o limite', () => {
    let draft = addField(empty, 'cidade');
    draft = addField(draft, 'cidade');
    expect(draft.fields).toEqual([{ fieldCode: 'cidade', label: null }]);
    for (let index = 0; index < CARD_DISPLAY_MAX_FIELDS + 2; index += 1) draft = addField(draft, `c${index}`);
    expect(draft.fields).toHaveLength(CARD_DISPLAY_MAX_FIELDS);
  });

  it('reordena, renomeia e tira campo', () => {
    let draft: CardDisplay = { indicators: [], fields: [{ fieldCode: 'a', label: null }, { fieldCode: 'b', label: null }] };
    draft = moveField(draft, 'b', -1);
    expect(draft.fields.map((field) => field.fieldCode)).toEqual(['b', 'a']);
    expect(moveField(draft, 'b', -1)).toBe(draft);
    draft = renameField(draft, 'a', 'Rótulo');
    expect(draft.fields[1].label).toBe('Rótulo');
    expect(removeField(draft, 'b').fields.map((field) => field.fieldCode)).toEqual(['a']);
  });

  it('normaliza como o backend grava: indicadores na ordem do editor, rótulo vazio vira null', () => {
    expect(
      normalizeDraft({
        indicators: ['requester', 'priority'],
        fields: [{ fieldCode: 'a', label: '   ' }, { fieldCode: 'b', label: ' NF ' }],
      }),
    ).toEqual({
      indicators: ['priority', 'requester'],
      fields: [
        { fieldCode: 'a', label: null },
        { fieldCode: 'b', label: 'NF' },
      ],
    });
  });

  it('compara configurações ignorando ordem de clique e espaços', () => {
    expect(
      sameCardDisplay(
        { indicators: ['requester', 'priority'], fields: [] },
        { indicators: ['priority', 'requester'], fields: [] },
      ),
    ).toBe(true);
    expect(sameCardDisplay(empty, DEFAULT_CARD_DISPLAY)).toBe(false);
  });

  it('número curto e tempo decorrido', () => {
    expect(cardNumber('a1b2c3d4-0000-0000-0000-000000000000')).toBe('#A1B2C3D4');
    const now = new Date('2026-11-13T12:00:00Z');
    expect(formatElapsed('2026-11-13T11:55:00Z', now)).toBe('5 min');
    expect(formatElapsed('2026-11-13T09:50:00Z', now)).toBe('2 h 10 min');
    expect(formatElapsed('2026-11-10T08:00:00Z', now)).toBe('3 d 4 h');
    expect(formatElapsed('2026-11-12T12:00:00Z', now)).toBe('1 d');
  });
});
