import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusFirstInvalidField, markFieldInvalid } from './field-a11y';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('markFieldInvalid', () => {
  it('marca e desmarca aria-invalid nos controles do campo (não no input de arquivo)', () => {
    document.body.innerHTML = `<div id="f"><input id="a" /><select id="b"></select><input id="c" type="file" /></div>`;
    const node = document.getElementById('f');

    markFieldInvalid(node, true);
    expect(document.getElementById('a')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('b')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('c')?.hasAttribute('aria-invalid')).toBe(false);

    markFieldInvalid(node, false);
    expect(document.getElementById('a')?.hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('focusFirstInvalidField', () => {
  it('põe o foco no primeiro campo com erro', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    document.body.innerHTML = `
      <div><input id="ok" /></div>
      <div data-field-invalid="true"><input id="primeiro" /></div>
      <div data-field-invalid="true"><input id="segundo" /></div>`;

    focusFirstInvalidField();

    expect(document.activeElement?.id).toBe('primeiro');
  });
});
