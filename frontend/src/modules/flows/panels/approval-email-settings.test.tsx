import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPROVAL_EMAIL_BODY, DEFAULT_APPROVAL_EMAIL_SUBJECT } from '../lib/approval-email';
import type { FlowNodeData } from '../types/flow.types';
import { ApprovalEmailSettings } from './approval-email-settings';

vi.mock('../hooks/use-flow-form-fields', () => ({
  useFlowFormFields: () => ({ data: [{ code: 'pedido', label: 'Pedido', fieldType: 'erp_lookup' }] }),
}));
vi.mock('../hooks/use-notification-preview', () => ({
  useNotificationPreview: (input: { title: string; content: string }) => ({
    data: { title: `PRÉVIA ${input.title}`, body: input.content, missingVariables: [], usedVariables: [], malformed: false, truncated: false, limits: { titleMax: 200, bodyMax: 20000 } },
    isFetching: false,
    isDebouncing: false,
  }),
}));

function renderSettings(initial: FlowNodeData = {}) {
  const changes: Array<Record<string, unknown>> = [];
  function Harness() {
    const [d, setD] = useState<FlowNodeData>(initial);
    return (
      <ApprovalEmailSettings
        d={d}
        formId="form-1"
        set={(key, value) => {
          changes.push({ [key]: value });
          setD((current) => ({ ...current, [key]: value }));
        }}
      />
    );
  }
  render(<Harness />);
  return { last: () => changes[changes.length - 1]?.emailApprovers as Record<string, unknown> };
}

describe('ApprovalEmailSettings', () => {
  it('ligar mostra o assunto padrão e o botão "Editar e-mail"', () => {
    const { last } = renderSettings();
    expect(screen.queryByRole('button', { name: /Editar e-mail/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Avisar quem aprova por e-mail/ }));
    expect(last()).toEqual({ enabled: true });
    expect(screen.getByText(/\(padrão\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar e-mail/ })).toBeInTheDocument();
  });

  it('o modal parte do texto padrão, insere variável no campo em foco e salva no nó', () => {
    const { last } = renderSettings({ emailApprovers: { enabled: true } });
    fireEvent.click(screen.getByRole('button', { name: /Editar e-mail/ }));
    const subject = screen.getByLabelText('Assunto do e-mail') as HTMLInputElement;
    const body = screen.getByLabelText('Texto do e-mail') as HTMLTextAreaElement;
    expect(subject.value).toBe(DEFAULT_APPROVAL_EMAIL_SUBJECT);
    expect(body.value).toBe(DEFAULT_APPROVAL_EMAIL_BODY);

    fireEvent.change(subject, { target: { value: 'Cancelar pedido ' } });
    fireEvent.focus(subject);
    subject.setSelectionRange(16, 16);
    fireEvent.click(screen.getByRole('button', { name: 'Pedido' }));
    expect(subject.value).toBe('Cancelar pedido {{pedido}}');
    expect(screen.getByText('PRÉVIA Cancelar pedido {{pedido}}')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e-mail' }));
    expect(last()).toEqual({ enabled: true, subject: 'Cancelar pedido {{pedido}}', body: DEFAULT_APPROVAL_EMAIL_BODY });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Cancelar pedido \{\{pedido\}\}/)).toBeInTheDocument();
  });

  it('variável mal formada bloqueia o salvar; "Restaurar padrão" volta ao texto de fábrica', () => {
    renderSettings({ emailApprovers: { enabled: true, subject: 'X', body: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: /Editar e-mail/ }));
    fireEvent.change(screen.getByLabelText('Texto do e-mail'), { target: { value: 'Oi {{nome' } });
    expect(screen.getByText('Variável mal formada (use {{nome}}).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e-mail' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect((screen.getByLabelText('Assunto do e-mail') as HTMLInputElement).value).toBe(DEFAULT_APPROVAL_EMAIL_SUBJECT);
    expect(screen.getByRole('button', { name: 'Salvar e-mail' })).toBeEnabled();
  });
});
