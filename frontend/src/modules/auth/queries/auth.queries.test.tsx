import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { useLogoutMutation } from './auth.queries';

vi.mock('../../../services/api', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
  setAccessToken: vi.fn(),
  tryHydrateSession: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useLogoutMutation', () => {
  it('ao sair, nada do usuário anterior fica no cache (sino, aprovações…); a sessão vira nula', async () => {
    queryClient.setQueryData(queryKeys.auth.me(), { id: 'u1' });
    queryClient.setQueryData(queryKeys.inbox.unreadCount(), 3);
    queryClient.setQueryData(queryKeys.inbox.list(), { data: [{ id: 'n1' }] });
    queryClient.setQueryData(['approvals', 'my-pending'], [{ id: 's1' }]);

    const { result } = renderHook(() => useLogoutMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(queryClient.getQueryData(queryKeys.inbox.unreadCount())).toBeUndefined());
    expect(queryClient.getQueryData(queryKeys.inbox.list())).toBeUndefined();
    expect(queryClient.getQueryData(['approvals', 'my-pending'])).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.auth.me())).toBeNull();
  });
});
