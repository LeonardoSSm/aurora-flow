import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../../../components/ui';
import {
  createUser,
  deactivateUser,
  fetchUsers,
  sendUserInvite,
  updateUser,
  type AdminUser,
  type CreateUserPayload,
  type FetchUsersParams,
  type PaginatedUsers,
  type UpdateUserPayload,
  type UserInviteResult,
} from '../services/admin-api';

const DEFAULT_PARAMS: FetchUsersParams = { page: 1, limit: 20 };

/** Painel de convidar/editar que ocupa o lugar da lista (null = lista). */
export type UserPanelState = null | { mode: 'create' } | { mode: 'edit'; user: AdminUser };

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function getAdminUsersErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  if (error.response?.status === 403) {
    return 'Acesso restrito ao perfil administrador.';
  }

  if (error.response?.status === 401) {
    return 'Sessão expirada. Faça login novamente.';
  }

  const payload = error.response?.data as { message?: unknown } | undefined;
  if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  return fallback;
}

export function useAdminUsers() {
  const [paginatedUsers, setPaginatedUsers] = useState<PaginatedUsers>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [params, setParams] = useState<FetchUsersParams>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<UserPanelState>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const reportInvite = useCallback(
    (email: string, invite: UserInviteResult, resent: boolean) => {
      if (invite.sent) {
        showToast({
          title: `Convite ${resent ? 'reenviado' : 'enviado'} para ${email}`,
          description: 'O link para criar a senha vale por 7 dias.',
          variant: 'success',
        });
      } else {
        showToast({
          title: resent
            ? 'O convite não foi enviado'
            : 'Usuário cadastrado, mas o convite não foi enviado',
          description: `${invite.error ?? 'Falha no envio do e-mail.'} Tente reenviar pela lista.`,
          variant: 'warning',
        });
      }
    },
    [showToast],
  );

  const load = useCallback(
    async (overrideParams?: FetchUsersParams) => {
      const query = overrideParams ?? params;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchUsers(query);
        setPaginatedUsers(result);
      } catch (error) {
        setError(getAdminUsersErrorMessage(error, 'Não foi possível carregar os usuários.'));
      } finally {
        setLoading(false);
      }
    },
    [params],
  );

  useEffect(() => {
    load();
  }, [load]);

  const setPage = useCallback(
    (page: number) => {
      const next = { ...params, page };
      setParams(next);
      load(next);
    },
    [params, load],
  );

  const setSearch = useCallback(
    (search: string) => {
      const next = { ...params, search: search || undefined, page: 1 };
      setParams(next);
      load(next);
    },
    [params, load],
  );

  const openCreate = useCallback(() => {
    setError(null);
    setPanel({ mode: 'create' });
  }, []);

  const openEdit = useCallback((user: AdminUser) => {
    setError(null);
    setPanel({ mode: 'edit', user });
  }, []);

  const closePanel = useCallback(() => {
    setError(null);
    setPanel(null);
  }, []);

  /** Cria e fecha o painel; devolve o usuário criado (null = erro, painel continua aberto). */
  const handleCreate = useCallback(
    async (payload: CreateUserPayload): Promise<AdminUser | null> => {
      setSubmitting(true);
      setError(null);
      try {
        const created = await createUser(payload);
        setPanel(null);
        if (created.invite) {
          reportInvite(created.email, created.invite, false);
        } else {
          showToast({
            title: `${firstName(created.fullName)} foi cadastrado(a)`,
            variant: 'success',
          });
        }
        await load();
        return created;
      } catch (error) {
        setError(getAdminUsersErrorMessage(error, 'Falha ao criar usuário.'));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [load, reportInvite, showToast],
  );

  const handleSendInvite = useCallback(
    async (user: AdminUser) => {
      setInvitingId(user.id);
      setError(null);
      try {
        const invite = await sendUserInvite(user.id);
        reportInvite(user.email, invite, true);
        await load();
      } catch (error) {
        setError(getAdminUsersErrorMessage(error, 'Falha ao enviar o convite.'));
      } finally {
        setInvitingId(null);
      }
    },
    [load, reportInvite],
  );

  /** Atualiza e fecha o painel; devolve o usuário salvo (null = erro, painel continua aberto). */
  const handleUpdate = useCallback(
    async (id: string, payload: UpdateUserPayload): Promise<AdminUser | null> => {
      setSubmitting(true);
      setError(null);
      try {
        const updated = await updateUser(id, payload);
        setPanel(null);
        showToast({
          title: `Cadastro de ${firstName(updated?.fullName ?? payload.fullName ?? '')} atualizado`,
          variant: 'success',
        });
        await load();
        return updated;
      } catch (error) {
        setError(getAdminUsersErrorMessage(error, 'Falha ao atualizar usuário.'));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [load, showToast],
  );

  const handleDeactivate = useCallback(
    async (id: string) => {
      setSubmitting(true);
      setError(null);
      try {
        await deactivateUser(id);
        await load();
      } catch (error) {
        setError(getAdminUsersErrorMessage(error, 'Falha ao desativar usuário.'));
      } finally {
        setSubmitting(false);
      }
    },
    [load],
  );

  return {
    users: paginatedUsers.data,
    total: paginatedUsers.total,
    page: paginatedUsers.page,
    totalPages: paginatedUsers.totalPages,
    loading,
    submitting,
    error,
    panel,
    params,
    setPage,
    setSearch,
    openCreate,
    openEdit,
    closePanel,
    handleCreate,
    handleUpdate,
    handleDeactivate,
    handleSendInvite,
    invitingId,
    reload: load,
  };
}
