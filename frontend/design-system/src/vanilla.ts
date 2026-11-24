/**
 * @tijucas/ui para sistemas sem React: avisos (toasts), tema claro/escuro e o HTML do logo.
 * Usa as classes de css/components.css. Funciona com import, require ou <script> (window.TijucasUI).
 * `productLogoHtml` também roda no Node, para montar o logo em templates no servidor.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ShowToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

const CONTAINER_ID = 'tj-toasts';

function toastContainer(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return existing;
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'tj-toasts';
  document.body.appendChild(container);
  return container;
}

/** Mostra um aviso no canto da tela; some sozinho depois de `durationMs` (padrão 3,5 s). */
export function showToast({ title, description, variant = 'info', durationMs = 3500 }: ShowToastInput) {
  const toast = document.createElement('div');
  toast.className = `tj-toast tj-toast--${variant}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const text = document.createElement('div');
  text.className = 'tj-toast__text';
  const strong = document.createElement('strong');
  strong.className = 'tj-toast__title';
  strong.textContent = title;
  text.appendChild(strong);
  if (description) {
    const p = document.createElement('p');
    p.className = 'tj-toast__description';
    p.textContent = description;
    text.appendChild(p);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tj-toast__close';
  close.setAttribute('aria-label', 'Fechar aviso');
  close.textContent = 'x';

  toast.append(text, close);
  toastContainer().appendChild(toast);

  const timer = window.setTimeout(() => toast.remove(), durationMs);
  close.addEventListener('click', () => {
    window.clearTimeout(timer);
    toast.remove();
  });
}

export type Theme = 'light' | 'dark';

/** Liga o tema claro ou escuro (classe `dark` no <html>) e lembra a escolha no navegador. */
export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Navegação privada ou armazenamento bloqueado: o tema vale só nesta página.
  }
}

/** Tema atual: o escolhido antes, senão o do sistema operacional. */
export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // segue para a preferência do sistema
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Alterna claro/escuro e devolve o tema novo. */
export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  setTheme(next);
  return next;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const MARK_PATHS = [
  '<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="3" opacity="0.9"/>',
  '<path d="M32 51V21" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>',
  '<path d="M32 37 21.5 26.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>',
  '<path d="M32 31 42.5 20.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>',
  '<path d="M14 45.5c6 5 11.5 7 18 7s12-2 18-7" stroke="var(--color-secondary)" stroke-width="3.4" stroke-linecap="round"/>',
  '<circle cx="32" cy="19.5" r="3.6" fill="var(--color-secondary)"/>',
  '<circle cx="20.6" cy="25.6" r="3.6" fill="var(--color-secondary)"/>',
  '<circle cx="43.4" cy="19.6" r="3.6" fill="var(--color-secondary)"/>',
].join('');

/** SVG do símbolo do produto. Os traços herdam a cor do texto ao redor. */
export function productMarkSvg({ label, className = 'tj-logo__mark' }: { label?: string; className?: string } = {}) {
  const a11y = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return `<svg viewBox="0 0 64 64" fill="none" class="${escapeHtml(className)}" ${a11y}>${MARK_PATHS}</svg>`;
}

/** HTML do logo completo (símbolo + nome). Troque `accent` para outros produtos: "compras", "rh"… */
export function productLogoHtml({ prefix = 'tijuca', accent = 'flow' }: { prefix?: string; accent?: string } = {}) {
  return (
    `<span class="tj-logo">${productMarkSvg()}` +
    `<span class="tj-wordmark"><span class="tj-wordmark__prefix">${escapeHtml(prefix)}</span>` +
    `<span class="tj-wordmark__accent">${escapeHtml(accent)}</span></span></span>`
  );
}
