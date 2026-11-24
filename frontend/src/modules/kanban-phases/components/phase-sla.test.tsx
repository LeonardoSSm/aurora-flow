import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { PhaseTimelineEntry } from '../../solicitations/types';
import { describePhaseSla, formatDuration, phaseSlaLabel } from '../lib/phase-sla';
import { PhaseSlaBadge } from './phase-sla-badge';
import { PhaseSlaEditor, type PhaseSlaDraft } from './phase-sla-editor';
import { PhaseTimeline } from './phase-timeline';

const mocks = vi.hoisted(() => ({
  canManage: true,
  timeline: [] as PhaseTimelineEntry[],
  extend: vi.fn(),
}));

vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({
    hasPermission: (code: string) => code === 'kanban_phases.manage' && mocks.canManage,
    can: (code: string) => code === 'kanban_phases.manage' && mocks.canManage,
  }),
}));
vi.mock('../../solicitations/services/solicitations-api', () => ({
  fetchPhaseTimeline: () => Promise.resolve(mocks.timeline),
  extendPhaseSla: (...args: unknown[]) => mocks.extend(...args),
}));

describe('textos do prazo da fase', () => {
  it('duração compacta e resumo da configuração', () => {
    expect(formatDuration(45)).toBe('45min');
    expect(formatDuration(150)).toBe('2h 30min');
    expect(formatDuration(60 * 24 * 2 + 180)).toBe('2d 3h');
    expect(phaseSlaLabel(90)).toBe('Vence em 1h 30min');
    expect(phaseSlaLabel(-60 * 24)).toBe('Venceu há 1d');
    expect(describePhaseSla(48, false)).toBe('2 dias');
    expect(describePhaseSla(20, true)).toBe('2 dias úteis');
    expect(describePhaseSla(10, true)).toBe('1 dia útil');
    expect(describePhaseSla(5, false)).toBe('5 horas');
  });
});

function EditorHarness({ initial, isTerminal = false, onChange }: { initial: PhaseSlaDraft; isTerminal?: boolean; onChange: (v: PhaseSlaDraft) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <PhaseSlaEditor
      value={value}
      isTerminal={isTerminal}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('PhaseSlaEditor', () => {
  const none: PhaseSlaDraft = { slaHours: null, slaBusinessHours: false, slaWarningPercent: null };

  it('liga com 1 dia corrido; dias úteis valem 10h; alerta em %', () => {
    const changes: PhaseSlaDraft[] = [];
    render(<EditorHarness initial={none} onChange={(v) => changes.push(v)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Prazo nesta fase/ }));
    expect(changes.at(-1)).toEqual({ slaHours: 24, slaBusinessHours: false, slaWarningPercent: null });

    fireEvent.change(screen.getByLabelText('Como conta o prazo'), { target: { value: 'business' } });
    expect(changes.at(-1)).toMatchObject({ slaHours: 10, slaBusinessHours: true });

    fireEvent.change(screen.getByLabelText('Prazo da fase'), { target: { value: '2,5' } });
    expect(changes.at(-1)).toMatchObject({ slaHours: 25 });

    fireEvent.change(screen.getByLabelText('Unidade do prazo'), { target: { value: 'hours' } });
    expect(changes.at(-1)).toMatchObject({ slaHours: 3 });

    fireEvent.change(screen.getByLabelText('Percentual de alerta'), { target: { value: '60' } });
    expect(changes.at(-1)).toMatchObject({ slaWarningPercent: 60 });
    expect(screen.getByText(/Prazo: 3 horas úteis/)).toBeInTheDocument();
  });

  it('apagar o número para digitar outro não grava nada no meio', () => {
    const changes: PhaseSlaDraft[] = [];
    render(<EditorHarness initial={{ slaHours: 8, slaBusinessHours: false, slaWarningPercent: null }} onChange={(v) => changes.push(v)} />);
    const input = screen.getByLabelText('Prazo da fase');
    expect(input).toHaveValue('8');
    fireEvent.change(input, { target: { value: '' } });
    expect(changes).toHaveLength(0);
    fireEvent.change(input, { target: { value: '12' } });
    expect(changes.at(-1)).toMatchObject({ slaHours: 12 });
  });

  it('fase final não tem prazo', () => {
    render(<EditorHarness initial={none} isTerminal onChange={() => undefined} />);
    expect(screen.getByRole('checkbox', { name: /Prazo nesta fase/ })).toBeDisabled();
    expect(screen.getByText('Fase final não tem prazo: o card já terminou.')).toBeInTheDocument();
  });
});

describe('PhaseSlaBadge', () => {
  it('mostra há quanto tempo está na fase e quanto falta', () => {
    const now = new Date('2026-10-14T15:00:00Z').getTime();
    render(
      <PhaseSlaBadge
        now={now}
        sla={{
          enteredAt: '2026-10-14T12:00:00Z',
          dueAt: '2026-10-14T16:30:00Z',
          businessHours: false,
          extended: false,
          state: 'warning',
          percentUsed: 66.7,
          minutesRemaining: 90,
        }}
      />,
    );
    expect(screen.getByText('Na fase há 3h · Vence em 1h 30min')).toBeInTheDocument();
  });
});

describe('PhaseTimeline', () => {
  const entries: PhaseTimelineEntry[] = [
    {
      phaseId: 'p1',
      phaseLabel: 'Novo',
      enteredAt: '2026-10-14T11:00:00Z',
      leftAt: '2026-10-14T12:00:00Z',
      dueAt: '2026-10-14T11:30:00Z',
      businessHours: false,
      extended: false,
      durationMinutes: 60,
      current: false,
      status: 'late',
    },
    {
      phaseId: 'p2',
      phaseLabel: 'Cotação',
      enteredAt: '2026-10-14T12:00:00Z',
      leftAt: null,
      dueAt: '2026-10-14T16:00:00Z',
      businessHours: true,
      extended: false,
      durationMinutes: 180,
      current: true,
      status: 'warning',
    },
  ];

  function renderTimeline() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PhaseTimeline solicitationId="sol-1" formId="form-1" defaultOpen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('lista as passagens com tempo e situação do prazo', async () => {
    mocks.timeline = entries;
    renderTimeline();
    expect(await screen.findByText('Fora do prazo')).toBeInTheDocument();
    expect(screen.getByText('Perto de vencer')).toBeInTheDocument();
    expect(screen.getByText('Atual')).toBeInTheDocument();
    expect(screen.getByText('3h')).toBeInTheDocument();
  });

  it('quem gerencia as fases altera o prazo da fase atual, com motivo', async () => {
    mocks.timeline = entries;
    mocks.canManage = true;
    mocks.extend.mockResolvedValue(entries);
    renderTimeline();
    fireEvent.click(await screen.findByRole('button', { name: /Alterar prazo desta fase/ }));
    fireEvent.change(screen.getByLabelText('Novo prazo da fase'), { target: { value: '2026-10-20T18:00' } });
    fireEvent.change(screen.getByLabelText('Motivo (fica no histórico)'), { target: { value: 'Fornecedor atrasou' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prazo' }));
    await waitFor(() =>
      expect(mocks.extend).toHaveBeenCalledWith('sol-1', {
        dueAt: new Date('2026-10-20T18:00').toISOString(),
        reason: 'Fornecedor atrasou',
      }),
    );
  });

  it('sem permissão não oferece alterar o prazo', async () => {
    mocks.timeline = entries;
    mocks.canManage = false;
    renderTimeline();
    await screen.findByText('Cotação');
    expect(screen.queryByRole('button', { name: /Alterar prazo/ })).not.toBeInTheDocument();
  });
});
