import { hasOrphanedSectionRules } from './form-definition.utils';

function makeSection(overrides: Partial<Parameters<typeof hasOrphanedSectionRules>[0][number]> = {}) {
  return {
    id: 's1',
    nextSectionId: null,
    nextIsSubmit: true,
    branches: [],
    fields: [{ id: 'f1', options: [{ id: 'o1' }] }],
    ...overrides,
  };
}

describe('hasOrphanedSectionRules', () => {
  it('returns false for sections with no branches and submit fallbacks', () => {
    const sections = [makeSection({ id: 's1' }), makeSection({ id: 's2' })];
    expect(hasOrphanedSectionRules(sections)).toBe(false);
  });

  it('returns false when nextIsSubmit/branches are missing (legacy/mocked data)', () => {
    const sections = [{ id: 's1', fields: [] } as unknown as ReturnType<typeof makeSection>];
    expect(hasOrphanedSectionRules(sections)).toBe(false);
  });

  it('returns true when nextSectionId points at a section that no longer exists', () => {
    const sections = [makeSection({ id: 's1', nextIsSubmit: false, nextSectionId: 'ghost' })];
    expect(hasOrphanedSectionRules(sections)).toBe(true);
  });

  it('returns false when a branch resolves to a real field/option/section', () => {
    const sections = [
      makeSection({
        id: 's1',
        branches: [
          {
            fieldId: 'f1',
            optionId: 'o1',
            checkboxValue: null,
            targetSectionId: 's2',
            targetIsSubmit: false,
          },
        ],
      }),
      makeSection({ id: 's2' }),
    ];
    expect(hasOrphanedSectionRules(sections)).toBe(false);
  });

  it('returns true when a branch field id no longer resolves', () => {
    const sections = [
      makeSection({
        branches: [
          {
            fieldId: 'ghost-field',
            optionId: null,
            checkboxValue: null,
            targetSectionId: null,
            targetIsSubmit: true,
          },
        ],
      }),
    ];
    expect(hasOrphanedSectionRules(sections)).toBe(true);
  });

  it('returns true when a branch option id no longer resolves for that field', () => {
    const sections = [
      makeSection({
        branches: [
          {
            fieldId: 'f1',
            optionId: 'ghost-option',
            checkboxValue: null,
            targetSectionId: null,
            targetIsSubmit: true,
          },
        ],
      }),
    ];
    expect(hasOrphanedSectionRules(sections)).toBe(true);
  });

  it('returns true when a branch target section no longer resolves', () => {
    const sections = [
      makeSection({
        branches: [
          {
            fieldId: 'f1',
            optionId: 'o1',
            checkboxValue: null,
            targetSectionId: 'ghost-section',
            targetIsSubmit: false,
          },
        ],
      }),
    ];
    expect(hasOrphanedSectionRules(sections)).toBe(true);
  });
});
