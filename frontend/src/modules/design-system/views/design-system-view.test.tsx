import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { ToastProvider } from '../../../../design-system/src';
import { brandColors, themeTokens } from '../../../../design-system/src/tokens';
import { DesignSystemView } from './design-system-view';

function renderView() {
  return render(
    <ToastProvider>
      <DesignSystemView />
    </ToastProvider>,
  );
}

describe('DesignSystemView (vitrine do @tijucas/ui)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('dark');
    document.querySelectorAll('.tj-toasts').forEach((el) => el.remove());
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('lista no menu cada seção da página, com a âncora certa', () => {
    const { container } = renderView();
    const nav = screen.getByRole('navigation', { name: 'Seções' });
    const links = within(nav).getAllByRole('link');

    expect(links.length).toBeGreaterThan(5);
    for (const link of links) {
      const id = (link.getAttribute('href') ?? '').slice(1);
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  it('mostra as cores com os valores de tokens.ts, nos dois temas', () => {
    renderView();

    expect(screen.getByText(brandColors.primary)).toBeInTheDocument();
    expect(screen.getByText(brandColors.secondary)).toBeInTheDocument();
    expect(screen.getAllByText(themeTokens.dark['bg-surface']).length).toBeGreaterThan(0);
  });

  it('copia o código de um exemplo para a área de transferência', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();

    fireEvent.click(screen.getAllByRole('button', { name: 'Copiar código' })[0]);

    expect(writeText).toHaveBeenCalledWith('npm install @tijucas/ui');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument());
  });

  it('dispara os toasts de exemplo', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Sucesso' }));

    expect(screen.getByRole('status')).toHaveTextContent('Pedido salvo');
  });

  it('alterna entre tema claro e escuro', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o tema escuro' }));
    expect(document.documentElement).toHaveClass('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o tema claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('o seletor do topo troca para HTML puro: código com classes tj-* e prévia usando components.css', () => {
    const { container } = renderView();
    expect(screen.getByRole('radio', { name: 'React' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'HTML/JS puro' }));

    expect(screen.getByRole('radio', { name: 'HTML/JS puro' })).toHaveAttribute('aria-checked', 'true');
    expect(window.location.search).toBe('?stack=html');
    expect(localStorage.getItem('ds-stack')).toBe('html');
    expect(container.querySelector('#botoes .tj-btn.tj-btn--ghost')).not.toBeNull();
    expect(screen.getByText(/class="tj-btn tj-btn--ghost"/)).toBeInTheDocument();
    // Força da senha não tem equivalente em CSS puro: o exemplo avisa em vez de mostrar código errado.
    expect(screen.getByText(/Só para React\/Next\.js por enquanto/)).toBeInTheDocument();
  });

  it('no modo HTML, os toasts de exemplo usam o showToast em JS puro', () => {
    window.history.replaceState(null, '', '/design-system?stack=html');
    const { container } = renderView();

    const sucesso = Array.from(container.querySelectorAll<HTMLButtonElement>('#toasts .tj-btn')).find(
      (b) => b.textContent === 'Sucesso',
    );
    fireEvent.click(sucesso as HTMLButtonElement);

    expect(document.querySelector('.tj-toasts .tj-toast--success')).toHaveTextContent('Pedido salvo');
  });

  it('abre direto no Next.js pelo link (?stack=next) e mostra o use client dos toasts', () => {
    window.history.replaceState(null, '', '/design-system?stack=next');
    renderView();

    expect(screen.getByRole('radio', { name: 'Next.js' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/'use client';\s+import \{ Button, useToast \}/)).toBeInTheDocument();
  });
});
