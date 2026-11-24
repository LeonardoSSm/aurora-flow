import { cn } from './cn';

describe('cn', () => {
  it('should join truthy classes and ignore falsy values', () => {
    const result = cn('base', false, undefined, null, 'active');
    expect(result).toBe('base active');
  });

  it('should return empty string when no class is provided', () => {
    const result = cn(undefined, null, false);
    expect(result).toBe('');
  });
});
