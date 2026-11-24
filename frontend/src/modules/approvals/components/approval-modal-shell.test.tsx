import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ApprovalModalShell } from './approval-modal-shell';

const LONG_TITLE =
  'Aprovar foto da etiqueta — Solicitacao - Datar Embalagens de Frango com um titulo bem comprido';

function renderShell(props: Partial<Parameters<typeof ApprovalModalShell>[0]> = {}) {
  return render(
    <ApprovalModalShell
      title="Aprovar foto"
      description="Confira a foto antes de aprovar."
      onClose={vi.fn()}
      footer={<button type="button">Aprovar</button>}
      {...props}
    >
      <p>Conteudo do modal</p>
    </ApprovalModalShell>,
  );
}

describe('ApprovalModalShell', () => {
  it('expõe um dialog nomeado pelo título, com descrição, conteúdo e rodapé', () => {
    renderShell();

    const dialog = screen.getByRole('dialog', { name: 'Aprovar foto' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Confira a foto antes de aprovar.')).toBeInTheDocument();
    expect(screen.getByText('Conteudo do modal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });

  it('quebra linha em títulos longos em vez de truncar (truncar esticava a coluna e cortava o modal)', () => {
    renderShell({ title: LONG_TITLE });

    const heading = screen.getByRole('heading', { name: LONG_TITLE });
    expect(heading.className).toContain('break-words');
    expect(heading.className).not.toContain('truncate');
  });

  it('usa coluna única encolhível e corta overflow horizontal para nada escapar do card', () => {
    renderShell();

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('grid-cols-1');
    expect(dialog.className).toContain('overflow-x-hidden');
    expect(dialog.className).toContain('overflow-y-auto');
  });

  it('mantém as ações num rodapé fixo, sempre visível enquanto o conteúdo rola', () => {
    renderShell();

    const footer = screen.getByRole('button', { name: 'Aprovar' }).parentElement;
    expect(footer?.className).toContain('sticky');
    expect(footer?.className).toContain('-bottom-4');
  });

  it('fecha pelo botão X e desabilita o X enquanto há envio em andamento', () => {
    const onClose = vi.fn();
    const { rerender } = renderShell({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ApprovalModalShell
        title="Aprovar foto"
        onClose={onClose}
        closeDisabled
        footer={<button type="button">Aprovar</button>}
      >
        <p>Conteudo do modal</p>
      </ApprovalModalShell>,
    );
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled();
  });
});
