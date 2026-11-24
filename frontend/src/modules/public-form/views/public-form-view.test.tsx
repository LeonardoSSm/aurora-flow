import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOptionalAuth } from '../../../app/auth-context';
import { ToastProvider } from '../../../components/ui';
import type { FormVersionSettings } from '../../forms/types';
import { fetchPublicForm, submitProgress, submitPublicForm } from '../services/public-form-api';
import type { PublicForm, PublicFormField } from '../types';
import { PublicFormView } from './public-form-view';

vi.mock('../services/public-form-api', () => ({
  fetchPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
  submitProgress: vi.fn().mockResolvedValue({ progressId: 'progress-1' }),
  uploadSubmissionAttachment: vi.fn(),
}));
vi.mock('../../../app/auth-context', () => ({ useOptionalAuth: vi.fn() }));

const fetchForm = vi.mocked(fetchPublicForm);
const submitForm = vi.mocked(submitPublicForm);
const optionalAuth = vi.mocked(useOptionalAuth);

const QUESTION: PublicFormField = {
  id: 'field-obs',
  code: 'observacao',
  label: 'Observação',
  fieldType: 'short_text',
  required: false,
  order: 1,
  settingsJson: {},
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};

function makeForm(settingsJson: FormVersionSettings): PublicForm {
  return {
    id: 'form-1',
    name: 'Pedido de compra',
    description: 'Peça materiais para a loja.',
    category: null,
    area: null,
    status: 'published',
    activeVersion: {
      id: 'version-1',
      versionNumber: 1,
      titleDisplay: 'Pedido de compra',
      descriptionDisplay: null,
      settingsJson,
      sections: [
        {
          id: 'section-1',
          title: 'Dados do pedido',
          description: null,
          order: 1,
          nextSectionId: null,
          nextIsSubmit: true,
          branches: [],
          fields: [QUESTION],
        },
      ],
    },
  };
}

function renderView() {
  return render(
    <ToastProvider>
      <PublicFormView formId="form-1" />
    </ToastProvider>,
  );
}

function logIn(user: { fullName: string; email: string } | null, isAuthHydrating = false) {
  optionalAuth.mockReturnValue({ user, isAuthHydrating } as ReturnType<typeof useOptionalAuth>);
}

const start = () => fireEvent.click(screen.getByRole('button', { name: 'Começar a responder' }));
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }));

describe('PublicFormView — identificação', () => {
  beforeEach(() => {
    fetchForm.mockReset();
    submitForm.mockReset();
    vi.mocked(submitProgress).mockClear();
    submitForm.mockResolvedValue({ id: 'sub-1' });
    logIn(null);
  });

  it('formulário antigo: bloco opcional junto das perguntas e envia sem nome/e-mail', async () => {
    fetchForm.mockResolvedValue(makeForm({ mode: 'single' }) as never);
    renderView();

    expect(await screen.findByText('(opcional)')).toBeInTheDocument();
    expect(screen.getByText('Observação')).toBeInTheDocument();
    send();

    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));
    expect(submitForm.mock.calls[0][0]).toMatchObject({
      responderName: undefined,
      responderEmail: undefined,
    });
  });

  it('obrigatória: abre na tela de entrada, sem nenhuma pergunta, e não passa em branco', async () => {
    fetchForm.mockResolvedValue(
      makeForm({ showResponderIdentification: false, requireResponderIdentification: true }) as never,
    );
    renderView();

    expect(await screen.findByText('Antes de começar, identifique-se')).toBeInTheDocument();
    expect(screen.getByText('Pedido de compra')).toBeInTheDocument();
    expect(screen.getByText('Peça materiais para a loja.')).toBeInTheDocument();
    expect(screen.queryByText('Observação')).not.toBeInTheDocument();
    expect(screen.queryByText('Dados do pedido')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar resposta' })).not.toBeInTheDocument();

    start();

    expect(await screen.findByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByLabelText('Seu e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Observação')).not.toBeInTheDocument();
  });

  it('obrigatória: depois da entrada mostra as perguntas e "Respondendo como", e envia aparado', async () => {
    fetchForm.mockResolvedValue(makeForm({ requireResponderIdentification: true }) as never);
    renderView();

    await screen.findByText('Antes de começar, identifique-se');
    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: ' Ana Souza ' } });
    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'ana@' } });
    start();
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'ana@tijuca.com' } });
    expect(screen.queryByText('Informe um e-mail válido.')).not.toBeInTheDocument();
    // Enter no campo também continua.
    fireEvent.submit(screen.getByRole('form', { name: 'Identificação' }));

    expect(await screen.findByText('Observação')).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText(/ana@tijuca\.com/)).toBeInTheDocument();
    send();

    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));
    expect(submitForm.mock.calls[0][0]).toMatchObject({
      responderName: 'Ana Souza',
      responderEmail: 'ana@tijuca.com',
    });
  });

  it('"Trocar" volta para a entrada sem perder a resposta já digitada', async () => {
    fetchForm.mockResolvedValue(makeForm({ requireResponderIdentification: true }) as never);
    renderView();

    await screen.findByText('Antes de começar, identifique-se');
    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'ana@tijuca.com' } });
    start();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Urgente' } });

    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(await screen.findByText('Antes de começar, identifique-se')).toBeInTheDocument();
    expect(screen.getByLabelText('Seu e-mail')).toHaveValue('ana@tijuca.com');
    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'bia@tijuca.com' } });
    start();

    expect(await screen.findByRole('textbox')).toHaveValue('Urgente');
    send();
    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));
    expect(submitForm.mock.calls[0][0]).toMatchObject({ responderEmail: 'bia@tijuca.com' });
  });

  it('obrigatória e logado: pula a entrada com os dados da conta', async () => {
    logIn({ fullName: 'Carla Dias', email: 'carla@tijuca.com' });
    fetchForm.mockResolvedValue(makeForm({ requireResponderIdentification: true }) as never);
    renderView();

    expect(await screen.findByText('Observação')).toBeInTheDocument();
    expect(screen.queryByText('Antes de começar, identifique-se')).not.toBeInTheDocument();
    expect(screen.getByText('Carla Dias')).toBeInTheDocument();
    send();

    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));
    expect(submitForm.mock.calls[0][0]).toMatchObject({
      responderName: 'Carla Dias',
      responderEmail: 'carla@tijuca.com',
    });
  });

  it('logado com conta sem nome: preenche o e-mail mas para na entrada', async () => {
    logIn({ fullName: '  ', email: 'carla@tijuca.com' });
    fetchForm.mockResolvedValue(makeForm({ requireResponderIdentification: true }) as never);
    renderView();

    expect(await screen.findByText('Antes de começar, identifique-se')).toBeInTheDocument();
    expect(screen.getByLabelText('Seu e-mail')).toHaveValue('carla@tijuca.com');
    expect(screen.queryByText('Observação')).not.toBeInTheDocument();
  });

  it('multi-etapas: a entrada vem antes da etapa 1 e o progresso só é registrado depois', async () => {
    const form = makeForm({ mode: 'stepper', requireResponderIdentification: true });
    const [first] = form.activeVersion.sections;
    form.activeVersion.sections = [
      { ...first, nextSectionId: 'section-2', nextIsSubmit: false },
      { ...first, id: 'section-2', order: 2, title: 'Entrega', fields: [] },
    ];
    fetchForm.mockResolvedValue(form as never);
    renderView();

    await screen.findByText('Antes de começar, identifique-se');
    expect(screen.queryByText(/Etapa 1 de 2/)).not.toBeInTheDocument();
    expect(submitProgress).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'ana@tijuca.com' } });
    start();

    expect(await screen.findByText(/Etapa 1 de 2/)).toBeInTheDocument();
    await waitFor(() => expect(submitProgress).toHaveBeenCalledTimes(1));
  });

  it('obrigatória: "Responder novamente" mantém a pessoa identificada', async () => {
    fetchForm.mockResolvedValue(makeForm({ requireResponderIdentification: true }) as never);
    renderView();

    await screen.findByText('Antes de começar, identifique-se');
    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Seu e-mail'), { target: { value: 'ana@tijuca.com' } });
    start();
    await screen.findByText('Observação');
    send();

    fireEvent.click(await screen.findByRole('button', { name: 'Responder novamente' }));
    expect(await screen.findByText('Observação')).toBeInTheDocument();
    expect(screen.queryByText('Antes de começar, identifique-se')).not.toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });
});
