import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldSettings } from '../../forms/types';
import { scoreAlertProblem } from '../lib/score-fields';
import { ScoreAlertEditor } from './score-alert-editor';
import { SectionScoreEditor } from './score-field-editors';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ api: { get: mocks.get } }));

function renderAlert(settings: FieldSettings, onChange = vi.fn()) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/users/assignable') {
      return {
        data: [
          { id: 'u1', fullName: 'Ana Qualidade', email: 'ana@exemplo.com' },
          { id: 'u2', fullName: 'Bruno Veterinário', email: 'bruno@exemplo.com' },
        ],
      };
    }
    // Arte geral escolhida na Administração; prévias das imagens.
    if (path === '/email-images/score-alert-background') return { data: { imageId: 'geral-1' } };
    return { data: new Blob(['x'], { type: 'image/jpeg' }) };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ScoreAlertEditor
        settings={settings}
        labelFieldOptions={[{ code: 'unidade_setor', label: 'Unidade/Setor' }]}
        onChangeSettings={onChange}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

describe('ScoreAlertEditor', () => {
  it('quando enviar: "sempre que for respondido" ou só abaixo; e a pergunta que identifica a auditoria', () => {
    const onChange = renderAlert({
      scoreMode: 'result',
      scoreAlert: { enabled: true, sectionsBelow: true, channel: 'in_app', recipients: [] },
    });
    // Sem escolha ainda = só quando ficar abaixo (o comportamento de antes).
    expect(screen.getByLabelText('Só quando algo ficar abaixo do esperado')).toBeChecked();
    expect(screen.getByText('Avisar quando')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Sempre que o formulário for respondido/));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreAlert: expect.objectContaining({ trigger: 'always' }) }),
    );

    fireEvent.change(screen.getByLabelText('Pergunta que identifica a auditoria'), { target: { value: 'unidade_setor' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreAlert: expect.objectContaining({ labelFieldCode: 'unidade_setor' }) }),
    );

    fireEvent.change(screen.getByLabelText('Assunto da mensagem'), {
      target: { value: 'Checklist Biosseguridade - {unidade}' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreAlert: expect.objectContaining({ subject: 'Checklist Biosseguridade - {unidade}' }) }),
    );
  });

  it('e-mail: arte de fundo própria do formulário, com a arte geral de reserva; outros canais não têm arte', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:previa');
    URL.revokeObjectURL = vi.fn();
    const base = { enabled: true, sectionsBelow: true, recipients: [] };
    const onChange = renderAlert({ scoreMode: 'result', scoreAlert: { ...base, channel: 'email', backgroundImageId: 'img-9' } });

    expect(await screen.findByText('Arte de fundo do e-mail')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar para a arte geral' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreAlert: expect.objectContaining({ backgroundImageId: null }) }),
    );
  });

  it('aviso no sistema: sem escolha de arte', () => {
    renderAlert({ scoreMode: 'result', scoreAlert: { enabled: true, sectionsBelow: true, channel: 'in_app', recipients: [] } });
    expect(screen.queryByText('Arte de fundo do e-mail')).not.toBeInTheDocument();
  });

  it('ligar o aviso já vem com "alguma seção abaixo" e e-mail', () => {
    const onChange = renderAlert({ scoreMode: 'result', scoreMark: 70 });
    fireEvent.click(screen.getByLabelText(/Avisar sobre a pontuação/));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreAlert: { enabled: true, sectionsBelow: true, channel: 'email' } }),
    );
  });

  it('escolhe pessoas, outros e-mails e o mínimo do resultado', async () => {
    const onChange = renderAlert({
      scoreMode: 'result',
      scoreAlert: { enabled: true, sectionsBelow: true, channel: 'email', recipients: [] },
    });
    fireEvent.click(await screen.findByLabelText('Avisar Ana Qualidade'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scoreAlert: expect.objectContaining({ recipients: [{ type: 'users', userIds: ['u1'] }] }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Outros destinatários'), { target: { value: 'qualidade@x.com' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scoreAlert: expect.objectContaining({ recipients: [{ type: 'custom', value: 'qualidade@x.com' }] }),
      }),
    );

    fireEvent.click(screen.getByLabelText(/este resultado ficar abaixo de/));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreAlert: expect.objectContaining({ resultBelow: 70 }) }),
    );
  });

  it('avisa o que falta: sem destinatário', async () => {
    renderAlert({ scoreMode: 'result', scoreAlert: { enabled: true, sectionsBelow: true, recipients: [] } });
    expect(await screen.findByText('Escolha quem recebe o aviso.')).toBeInTheDocument();
  });
});

describe('scoreAlertProblem', () => {
  it('desligado não cobra nada; ligado cobra gatilho e destinatário', () => {
    expect(scoreAlertProblem(undefined)).toBeNull();
    expect(scoreAlertProblem({ enabled: false })).toBeNull();
    expect(scoreAlertProblem({ enabled: true, recipients: [{ type: 'users', userIds: ['u1'] }] })).toMatch(
      /Escolha quando avisar/,
    );
    expect(scoreAlertProblem({ enabled: true, resultBelow: 80, recipients: [{ type: 'custom', value: ' ' }] })).toBe(
      'Escolha quem recebe o aviso.',
    );
    expect(scoreAlertProblem({ enabled: true, sectionsBelow: true, recipients: [{ type: 'custom', value: 'a@b.c' }] })).toBeNull();
    // "Sempre que for respondido" dispensa o gatilho.
    expect(scoreAlertProblem({ enabled: true, trigger: 'always', recipients: [{ type: 'custom', value: 'a@b.c' }] })).toBeNull();
  });
});

describe('SectionScoreEditor — limite próprio', () => {
  it('grava o limite próprio e volta ao marco quando apagado', () => {
    const onChange = vi.fn();
    render(<SectionScoreEditor settings={{ scoreMode: 'section', scoreLimit: 80 }} questions={[]} onChangeSettings={onChange} />);
    expect(screen.getByLabelText('Limite próprio da seção')).toHaveValue(80);
    fireEvent.change(screen.getByLabelText('Limite próprio da seção'), { target: { value: '85' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scoreLimit: 85 }));
    fireEvent.change(screen.getByLabelText('Limite próprio da seção'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scoreLimit: undefined }));
  });
});
