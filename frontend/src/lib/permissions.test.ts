import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('returns false when the permission map is missing', () => {
    expect(hasPermission(undefined, 'forms.view')).toBe(false);
    expect(hasPermission(null, 'forms.view')).toBe(false);
  });

  it('returns false when the code is absent (implicit none)', () => {
    expect(hasPermission({}, 'forms.view')).toBe(false);
  });

  it('returns false for scope "none"', () => {
    expect(hasPermission({ 'forms.view': 'none' }, 'forms.view')).toBe(false);
  });

  it('returns true for any granted scope with the default minScope', () => {
    expect(hasPermission({ 'forms.view': 'own' }, 'forms.view')).toBe(true);
    expect(hasPermission({ 'forms.view': 'assigned' }, 'forms.view')).toBe(true);
    expect(hasPermission({ 'forms.view': 'area' }, 'forms.view')).toBe(true);
    expect(hasPermission({ 'forms.view': 'all' }, 'forms.view')).toBe(true);
  });

  it('ranks "area" and "all" above "own"/"assigned" when minScope is elevated', () => {
    expect(hasPermission({ 'forms.view': 'own' }, 'forms.view', 'area')).toBe(false);
    expect(hasPermission({ 'forms.view': 'area' }, 'forms.view', 'area')).toBe(true);
    expect(hasPermission({ 'forms.view': 'all' }, 'forms.view', 'area')).toBe(true);
  });

  it('treats "own" and "assigned" as equal rank', () => {
    expect(hasPermission({ 'forms.view': 'assigned' }, 'forms.view', 'own')).toBe(true);
    expect(hasPermission({ 'forms.view': 'own' }, 'forms.view', 'assigned')).toBe(true);
  });
});
