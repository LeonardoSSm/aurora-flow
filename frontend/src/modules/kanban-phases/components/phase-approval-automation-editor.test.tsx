import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhaseApprovalAutomationEditor } from './phase-approval-automation-editor';

const DEFAULTS = { approvalRequest: 'manual', approvalOnApproved: 'stay', approvalOnRejected: 'stay' } as const;

describe('PhaseApprovalAutomationEditor', () => {
  it('1ª fase: o formulário é o de abertura e não há fase anterior para voltar', () => {
    render(<PhaseApprovalAutomationEditor value={DEFAULTS} isFirst hasNext onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Quando o formulário chegar completo (com os anexos)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Volta sozinho para a fase anterior' })).toBeDisabled();
  });

  it('última fase: não há próxima para seguir', () => {
    render(<PhaseApprovalAutomationEditor value={DEFAULTS} isFirst={false} hasNext={false} onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Vai sozinho para a próxima fase' })).toBeDisabled();
  });

  it('cada escolha muda só a sua opção', () => {
    const onChange = vi.fn();
    render(<PhaseApprovalAutomationEditor value={DEFAULTS} isFirst={false} hasNext onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Se reprovarem'), { target: { value: 'previous' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULTS, approvalOnRejected: 'previous' });
  });
});
