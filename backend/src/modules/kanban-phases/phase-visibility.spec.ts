import { canSeePhase, normalizePhaseVisibility } from './phase-visibility';

describe('phase-visibility', () => {
  describe('normalizePhaseVisibility', () => {
    it('sem nada escolhido vira null (todos veem)', () => {
      expect(normalizePhaseVisibility(undefined)).toBeNull();
      expect(normalizePhaseVisibility(null)).toBeNull();
      expect(normalizePhaseVisibility({ roleCodes: [' '], areaIds: [], userIds: [] })).toBeNull();
    });

    it('tira repetições e espaços, e completa listas ausentes', () => {
      expect(normalizePhaseVisibility({ roleCodes: ['logistica', ' logistica ', 'financeiro'] })).toEqual({
        roleCodes: ['logistica', 'financeiro'],
        areaIds: [],
        userIds: [],
      });
    });
  });

  describe('canSeePhase', () => {
    const phase = { visibleTo: { roleCodes: ['logistica'], areaIds: ['area-1'], userIds: ['user-1'] } };
    const viewer = { sub: 'outro', role: 'vendedor', areaId: null };

    it('fase sem restrição aparece para todos', () => {
      expect(canSeePhase({ visibleTo: null }, viewer, false)).toBe(true);
    });

    it('basta um critério casar: perfil, área ou usuário', () => {
      expect(canSeePhase(phase, viewer, false)).toBe(false);
      expect(canSeePhase(phase, { ...viewer, role: 'logistica' }, false)).toBe(true);
      expect(canSeePhase(phase, { ...viewer, areaId: 'area-1' }, false)).toBe(true);
      expect(canSeePhase(phase, { ...viewer, sub: 'user-1' }, false)).toBe(true);
    });

    it('quem gerencia fases vê todas', () => {
      expect(canSeePhase(phase, viewer, true)).toBe(true);
    });
  });
});
