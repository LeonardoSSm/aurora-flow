import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldSettings } from '../../forms/types';
import { UserEmailSettingsEditor } from './user-email-settings-editor';

vi.mock('../../users/services/users-api', () => ({
  fetchAssignableUsers: vi.fn().mockResolvedValue([
    { id: 'u-ana', fullName: 'Ana Gestora', email: 'ana@tijuca.com', role: 'manager' },
    { id: 'u-bruno', fullName: 'Bruno Lima', email: 'bruno@tijuca.com', role: 'editor' },
  ]),
}));

function renderEditor(initial: FieldSettings) {
  const onChange = vi.fn();
  function Harness() {
    const [settings, setSettings] = useState(initial);
    return (
      <UserEmailSettingsEditor
        settings={settings}
        onChange={(next) => {
          onChange(next);
          setSettings(next);
        }}
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness />
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('UserEmailSettingsEditor', () => {
  it('escolher pessoas específicas grava os ids e mostra nome + e-mail', async () => {
    const { onChange } = renderEditor({ userSuggestions: { userIds: [], onlySuggested: false } });
    fireEvent.click(screen.getByLabelText(/Só pessoas específicas/));
    fireEvent.click(await screen.findByLabelText('Sugerir Ana Gestora'));
    expect(onChange).toHaveBeenLastCalledWith({
      userSuggestions: { userIds: ['u-ana'], onlySuggested: false },
    });
    const chosen = screen.getByRole('list', { name: 'Pessoas escolhidas' });
    expect(chosen).toHaveTextContent('Ana Gestora');
    expect(chosen).toHaveTextContent('ana@tijuca.com');

    fireEvent.click(screen.getByLabelText(/Qualquer usuário do sistema/));
    expect(onChange).toHaveBeenLastCalledWith({
      userSuggestions: { userIds: [], onlySuggested: false },
    });
  });

  it('liga a trava "só e-mails sugeridos" sem perder as pessoas', () => {
    const { onChange } = renderEditor({ userSuggestions: { userIds: ['u-bruno'], onlySuggested: false } });
    fireEvent.click(screen.getByLabelText(/Aceitar só e-mails sugeridos/));
    expect(onChange).toHaveBeenLastCalledWith({
      userSuggestions: { userIds: ['u-bruno'], onlySuggested: true },
    });
  });
});
