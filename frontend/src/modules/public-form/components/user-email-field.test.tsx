import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldSettings } from '../../forms/types';
import { fetchAssignableUsers } from '../../users/services/users-api';
import { validateFieldValue } from '../form-runtime';
import type { PublicAnswerValue, PublicFormField } from '../types';
import { searchUserEmailSuggestions } from '../user-email';
import { PublicQuestionField } from './public-question-field';

vi.mock('../user-email', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, searchUserEmailSuggestions: vi.fn() };
});
vi.mock('../../users/services/users-api', () => ({ fetchAssignableUsers: vi.fn() }));

const search = vi.mocked(searchUserEmailSuggestions);
const assignable = vi.mocked(fetchAssignableUsers);

const ANA = { name: 'Ana Gestora', email: 'ana@tijuca.com' };
const BRUNO = { name: 'Bruno Lima', email: 'bruno@tijuca.com' };

function makeField(settings: FieldSettings): PublicFormField {
  return {
    id: 'f-gestor',
    code: 'gestor',
    label: 'E-mail do gestor',
    fieldType: 'email',
    required: true,
    order: 1,
    settingsJson: settings,
    conditionsJson: {},
    visibilityRules: null,
    options: [],
  };
}

function renderField(field: PublicFormField, options: { formId?: string; initial?: string } = {}) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<PublicAnswerValue>(options.initial ?? null);
    return (
      <PublicQuestionField
        field={field}
        value={value}
        formId={options.formId}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        onToggleMulti={() => {}}
      />
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { onChange };
}

beforeEach(() => {
  search.mockReset();
  assignable.mockReset();
});

describe('E-mail de usuário — pessoas escolhidas (formulário publicado)', () => {
  const field = makeField({ userSuggestions: { onlySuggested: false, users: [ANA, BRUNO] } });

  it('ao focar, lista nome e e-mail de cada pessoa; clicar grava o e-mail', () => {
    const { onChange } = renderField(field, { formId: 'form-1' });
    fireEvent.focus(screen.getByRole('combobox'));

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Ana Gestora');
    expect(options[0]).toHaveTextContent('ana@tijuca.com');

    fireEvent.mouseDown(screen.getByText('Bruno Lima'));
    expect(onChange).toHaveBeenLastCalledWith('bruno@tijuca.com');
    // Depois de escolher, o nome continua à vista embaixo do e-mail.
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('sem a trava, aceita qualquer e-mail digitado e filtra pelo nome sem acento', () => {
    const { onChange } = renderField(field, { formId: 'form-1' });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'gestóra' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);

    fireEvent.change(input, { target: { value: 'fulano@fora.com' } });
    expect(onChange).toHaveBeenLastCalledWith('fulano@fora.com');
    expect(validateFieldValue(field, 'fulano@fora.com')).toBeNull();
  });

  it('teclado: seta para baixo e Enter escolhem', () => {
    const { onChange } = renderField(field, { formId: 'form-1' });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('bruno@tijuca.com');
  });
});

describe('E-mail de usuário — só e-mails sugeridos', () => {
  const field = makeField({ userSuggestions: { onlySuggested: true, users: [ANA, BRUNO] } });

  it('digitar não vira valor; escolher mostra nome + e-mail com "Trocar"', () => {
    const { onChange } = renderField(field, { formId: 'form-1' });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ana' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByText('Ana Gestora'));
    expect(onChange).toHaveBeenLastCalledWith('ana@tijuca.com');
    expect(screen.getByText('Ana Gestora')).toBeInTheDocument();
    expect(screen.getByText('ana@tijuca.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('valor salvo aparece com o nome da pessoa', () => {
    renderField(field, { formId: 'form-1', initial: 'BRUNO@tijuca.com' });
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('a validação no navegador recusa e-mail fora da lista', () => {
    expect(validateFieldValue(field, 'fulano@fora.com')).toBe('Escolha um dos e-mails sugeridos.');
    expect(validateFieldValue(field, 'Ana@Tijuca.com')).toBeNull();
  });
});

describe('E-mail de usuário — qualquer usuário do sistema', () => {
  it('formulário publicado: pesquisa no servidor só a partir de 3 letras', async () => {
    search.mockResolvedValue([ANA]);
    const field = makeField({ userSuggestions: { onlySuggested: false } });
    renderField(field, { formId: 'form-1' });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'an' } });
    expect(screen.getByText('Digite pelo menos 3 caracteres.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'ana' } });
    await waitFor(() => expect(search).toHaveBeenCalledWith('form-1', 'gestor', 'ana'));
    expect(await screen.findByText('Ana Gestora')).toBeInTheDocument();
    // Sem lista completa no navegador, quem confere a trava é o backend.
    expect(validateFieldValue(field, 'x@y.com')).toBeNull();
  });

  it('logado (fase / pré-visualização): usa os usuários do sistema, filtrados pelas pessoas escolhidas', async () => {
    assignable.mockResolvedValue([
      { id: 'u-ana', fullName: ANA.name, email: ANA.email, role: 'manager' },
      { id: 'u-bruno', fullName: BRUNO.name, email: BRUNO.email, role: 'editor' },
    ]);
    renderField(makeField({ userSuggestions: { userIds: ['u-ana'], onlySuggested: true } }));
    fireEvent.focus(screen.getByRole('combobox'));
    expect(await screen.findByText('Ana Gestora')).toBeInTheDocument();
    expect(screen.queryByText('Bruno Lima')).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });
});
