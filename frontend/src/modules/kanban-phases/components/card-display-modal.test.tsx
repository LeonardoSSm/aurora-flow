import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { CardDisplay, PhaseCardDisplayView } from '../lib/card-display';
import { CardDisplayModal } from './card-display-modal';

const mocks = vi.hoisted(() => ({
  view: null as unknown as PhaseCardDisplayView,
  savePersonal: vi.fn(),
  savePhase: vi.fn(),
}));

vi.mock('../services/card-display-api', () => ({
  fetchPhaseCardDisplay: () => Promise.resolve(mocks.view),
  savePersonalCardDisplay: (_formId: string, _phaseId: string, display: CardDisplay | null) => {
    mocks.savePersonal(display);
    return Promise.resolve(mocks.view);
  },
  savePhaseCardDisplay: (_formId: string, _phaseId: string, display: CardDisplay | null) => {
    mocks.savePhase(display);
    return Promise.resolve(mocks.view);
  },
}));

const FIELDS: PhaseCardDisplayView['fields'] = [
  { code: 'cidade', label: 'Cidade', fieldType: 'single_select', phaseLabel: null },
  { code: 'nf', label: 'Nº da NF', fieldType: 'short_text', phaseLabel: 'Faturamento' },
];

function view(partial: Partial<PhaseCardDisplayView> = {}): PhaseCardDisplayView {
  return {
    phaseId: 'phase-1',
    phaseDefault: null,
    personal: null,
    effective: { indicators: ['priority'], fields: [] },
    source: 'default',
    fields: FIELDS,
    ...partial,
  };
}

function renderModal(canManagePhase = false) {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CardDisplayModal
          formId="form-1"
          phaseId="phase-1"
          phaseLabel="Triagem"
          canManagePhase={canManagePhase}
          onClose={onClose}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('CardDisplayModal', () => {
  beforeEach(() => {
    mocks.view = view();
    mocks.savePersonal.mockReset();
    mocks.savePhase.mockReset();
  });

  it('pessoa comum: só o ajuste próprio, partindo do card padrão do sistema', async () => {
    const { onClose } = renderModal(false);
    expect(await screen.findByRole('checkbox', { name: /Prioridade/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /Solicitante/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('tab')).toBeNull();
    // Nada mudou: não grava.
    expect(screen.getByRole('button', { name: 'Salvar para mim' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Solicitante/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Processo/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Adicionar campo ao card' }), { target: { value: 'nf' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Rótulo no card para Nº da NF/ }), { target: { value: ' NF ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar para mim' }));

    await waitFor(() => expect(mocks.savePersonal).toHaveBeenCalledTimes(1));
    expect(mocks.savePersonal).toHaveBeenCalledWith({
      indicators: ['priority', 'value', 'sla', 'phase_sla', 'assignee', 'updated_at', 'requester'],
      fields: [{ fieldCode: 'nf', label: 'NF' }],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('quem já ajustou volta ao padrão da fase', async () => {
    mocks.view = view({
      personal: { indicators: ['requester'], fields: [{ fieldCode: 'cidade', label: null }] },
      source: 'personal',
    });
    renderModal(false);
    expect(await screen.findByText('Cidade')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao padrão da fase/ }));
    await waitFor(() => expect(mocks.savePersonal).toHaveBeenCalledWith(null));
  });

  it('campo que saiu do processo aparece marcado, para poder tirar', async () => {
    mocks.view = view({ personal: { indicators: [], fields: [{ fieldCode: 'sumiu', label: null }] }, source: 'personal' });
    renderModal(false);
    expect(await screen.findByText('sumiu (campo não encontrado)')).toBeInTheDocument();
  });

  it('quem configura as fases grava o padrão da fase na outra aba', async () => {
    mocks.view = view({ phaseDefault: { indicators: ['priority'], fields: [] }, source: 'phase' });
    renderModal(true);
    fireEvent.click(await screen.findByRole('tab', { name: /Padrão da fase/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Adicionar campo ao card' }), { target: { value: 'cidade' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar para todos' }));
    await waitFor(() =>
      expect(mocks.savePhase).toHaveBeenCalledWith({
        indicators: ['priority'],
        fields: [{ fieldCode: 'cidade', label: null }],
      }),
    );
    expect(mocks.savePersonal).not.toHaveBeenCalled();
  });
});
