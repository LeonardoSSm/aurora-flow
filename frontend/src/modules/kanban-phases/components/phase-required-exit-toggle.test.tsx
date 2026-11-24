import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhaseAssigneeExitToggle, PhaseNoReturnToggle, PhaseRequiredExitToggle } from './phase-required-exit-toggle';

describe('PhaseRequiredExitToggle', () => {
  it('liga e desliga a trava', () => {
    const onChange = vi.fn();
    render(<PhaseRequiredExitToggle checked={false} requiredCount={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Só avançar com os obrigatórios preenchidos/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ligada sem nenhum obrigatório, avisa que a trava não segura nada', () => {
    const { rerender } = render(<PhaseRequiredExitToggle checked requiredCount={0} onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum campo está marcado como obrigatório');

    rerender(<PhaseRequiredExitToggle checked requiredCount={1} onChange={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('PhaseAssigneeExitToggle', () => {
  it('liga e desliga a trava de responsável', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PhaseAssigneeExitToggle checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Só avançar com responsável/ }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<PhaseAssigneeExitToggle checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Só avançar com responsável/ }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe('PhaseNoReturnToggle', () => {
  it('liga e desliga o ponto sem volta', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PhaseNoReturnToggle checked={false} rejectedStays={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ponto sem volta/ }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<PhaseNoReturnToggle checked rejectedStays={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ponto sem volta/ }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('ligado com reprovação que segura o card, avisa que só quem configura devolve', () => {
    const { rerender } = render(<PhaseNoReturnToggle checked rejectedStays onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('só quem configura as fases poderá devolvê-lo');

    rerender(<PhaseNoReturnToggle checked rejectedStays={false} onChange={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<PhaseNoReturnToggle checked={false} rejectedStays onChange={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
