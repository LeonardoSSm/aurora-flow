import { afterEach, vi } from 'vitest';
import {
  getTheme,
  productLogoHtml,
  productMarkSvg,
  setTheme,
  showToast,
  toggleTheme,
} from '../../../design-system/src/vanilla';

describe('@tijucas/ui/vanilla (sistemas sem React)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('showToast cria o aviso com as classes de components.css e some depois do tempo', () => {
    vi.useFakeTimers();
    showToast({ title: 'Pedido salvo', description: 'Tudo certo.', variant: 'success', durationMs: 1000 });

    const toast = document.querySelector('.tj-toasts .tj-toast');
    expect(toast).toHaveClass('tj-toast--success');
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveTextContent('Pedido salvo');
    expect(toast).toHaveTextContent('Tudo certo.');

    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.tj-toast')).toBeNull();
  });

  it('showToast usa info por padrão, fecha no x e não interpreta HTML do título', () => {
    showToast({ title: '<b>oi</b>' });

    const toast = document.querySelector('.tj-toast');
    expect(toast).toHaveClass('tj-toast--info');
    expect(toast?.querySelector('b')).toBeNull();
    expect(toast).toHaveTextContent('<b>oi</b>');

    (document.querySelector('.tj-toast__close') as HTMLButtonElement).click();
    expect(document.querySelector('.tj-toast')).toBeNull();
  });

  it('setTheme/toggleTheme trocam a classe dark e lembram a escolha', () => {
    setTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(getTheme()).toBe('dark');

    expect(toggleTheme()).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('productLogoHtml monta o logo e escapa os textos', () => {
    const html = productLogoHtml({ prefix: 'tijuca', accent: '<compras>' });

    expect(html).toContain('class="tj-logo"');
    expect(html).toContain('<span class="tj-wordmark__prefix">tijuca</span>');
    expect(html).toContain('&#60;compras&#62;');
    expect(html).not.toContain('<compras>');
  });

  it('productMarkSvg é decorativo sem label e acessível com label', () => {
    expect(productMarkSvg()).toContain('aria-hidden="true"');
    expect(productMarkSvg({ label: 'Aurora Flow' })).toContain('role="img" aria-label="Aurora Flow"');
  });
});
