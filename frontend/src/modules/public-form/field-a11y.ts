/**
 * Acessibilidade dos erros do formulário público: o campo com erro fica marcado como
 * inválido para o leitor de tela e, ao barrar o avanço, o foco vai para o primeiro erro.
 */

const FOCUSABLE =
  'input:not([type="hidden"]):not([type="file"]), select, textarea, [role="combobox"], button[aria-haspopup], [role="button"][tabindex]';

/** Ref de callback (sem hook): marca/desmarca `aria-invalid` nos controles do campo. */
export function markFieldInvalid(node: HTMLElement | null, invalid: boolean): void {
  if (!node) return;
  node.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
    if (invalid) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  });
}

/** Depois que os erros aparecem na tela, rola até o primeiro e põe o foco nele. */
export function focusFirstInvalidField(root: ParentNode = document): void {
  const run = () => {
    const field = root.querySelector<HTMLElement>('[data-field-invalid="true"]');
    if (!field) return;
    field.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    field.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run());
  else run();
}
