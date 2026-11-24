import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '../../../components/ui';
import {
  disconnectGoogleWorkspace,
  fetchGoogleConnectUrl,
  fetchGoogleWorkspaceStatus,
} from '../../auth/services/google-workspace-api';
import {
  createFormGoogleSpreadsheet,
  fetchFormGoogleSheetsStatus,
  reenqueueFormGoogleSheetsSync,
  reprocessFormGoogleSheetsSync,
} from '../../forms/services/forms-api';

export function useFormBuilderGoogle(
  selectedFormId: string,
  isNewForm: boolean,
  formsRefetch: () => Promise<unknown>,
) {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connectPending, setConnectPending] = useState(false);

  const gStatusQ = useQuery({
    queryKey: ['google', 'workspace'],
    queryFn: fetchGoogleWorkspaceStatus,
    staleTime: 30_000,
  });

  const gSheetsQ = useQuery({
    queryKey: ['google', 'sheets', selectedFormId],
    queryFn: () => fetchFormGoogleSheetsStatus(selectedFormId),
    enabled: Boolean(selectedFormId) && !isNewForm,
    staleTime: 0,
  });

  useEffect(() => {
    const gs = searchParams.get('google'),
      ge = searchParams.get('googleError');
    if (!gs && !ge) return;
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    next.delete('googleError');
    setSearchParams(next, { replace: true });
    if (gs === 'connected') {
      showToast({
        title: 'Conta Google conectada',
        description: 'Integração atualizada com sucesso.',
        variant: 'success',
      });
      void gStatusQ.refetch();
      if (selectedFormId) void gSheetsQ.refetch();
    }
    if (ge) showToast({ title: 'Falha na integração Google', description: ge, variant: 'error' });
  }, [searchParams]);

  const disconnectMut = useMutation({
    mutationFn: disconnectGoogleWorkspace,
    onSuccess: async () => {
      await gStatusQ.refetch();
      if (selectedFormId) await gSheetsQ.refetch();
      showToast({
        title: 'Conta Google desconectada',
        description: 'Desconectada com sucesso.',
        variant: 'success',
      });
    },
    onError: () =>
      showToast({
        title: 'Falha ao desconectar',
        description: 'Não foi possível desconectar.',
        variant: 'error',
      }),
  });

  const createSheetMut = useMutation({
    mutationFn: () => createFormGoogleSpreadsheet(selectedFormId),
    onSuccess: async () => {
      await Promise.all([formsRefetch(), gSheetsQ.refetch(), gStatusQ.refetch()]);
      showToast({
        title: 'Planilha criada',
        description: 'Planilha criada com sucesso.',
        variant: 'success',
      });
    },
    onError: (e) => {
      showToast({
        title: 'Falha ao criar planilha',
        description:
          axios.isAxiosError(e) && typeof e.response?.data?.message === 'string'
            ? e.response.data.message
            : 'Não foi possível criar a planilha.',
        variant: 'error',
      });
      void gSheetsQ.refetch();
    },
  });

  const reenqueueMut = useMutation({
    mutationFn: () => reenqueueFormGoogleSheetsSync(selectedFormId),
    onSuccess: (r) => {
      void gSheetsQ.refetch();
      showToast({
        title: 'Jobs reenfileirados',
        description: `${r.requeuedJobs} reenfileirado(s), ${r.recoveredProcessingJobs} recuperado(s).`,
        variant: 'success',
      });
    },
    onError: () =>
      showToast({
        title: 'Falha ao reenfileirar',
        description: 'Não foi possível reenfileirar.',
        variant: 'error',
      }),
  });

  const reprocessMut = useMutation({
    mutationFn: () => reprocessFormGoogleSheetsSync(selectedFormId),
    onSuccess: (r) => {
      void gSheetsQ.refetch();
      showToast({
        title: 'Reprocessamento concluído',
        description: `${r.createdJobs} job(s) criado(s).`,
        variant: 'success',
      });
    },
    onError: () =>
      showToast({
        title: 'Falha ao reprocessar',
        description: 'Não foi possível reprocessar.',
        variant: 'error',
      }),
  });

  const connectGoogleAccount = useCallback(async () => {
    setConnectPending(true);
    try {
      window.location.assign(
        await fetchGoogleConnectUrl(`${window.location.pathname}${window.location.search}`),
      );
    } catch {
      showToast({
        title: 'Falha ao iniciar conexão',
        description: 'Não foi possível abrir a autenticação Google.',
        variant: 'error',
      });
      setConnectPending(false);
    }
  }, [showToast]);

  const integrationAction = connectPending
    ? ('connect' as const)
    : disconnectMut.isPending
      ? ('disconnect' as const)
      : createSheetMut.isPending
        ? ('create-sheet' as const)
        : reenqueueMut.isPending
          ? ('reenqueue' as const)
          : reprocessMut.isPending
            ? ('reprocess' as const)
            : null;

  return {
    googleConnectionStatus: gStatusQ.data ?? null,
    googleSheetsStatus: gSheetsQ.data ?? null,
    loadingIntegration: gStatusQ.isLoading || gSheetsQ.isFetching,
    integrationAction,
    connectGoogleAccount,
    disconnectGoogleAccount: () => disconnectMut.mutate(),
    createSpreadsheetManually: () => createSheetMut.mutate(),
    openSpreadsheet: () => {
      const url = gSheetsQ.data?.spreadsheetUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    },
    reenqueueSync: () => reenqueueMut.mutate(),
    reprocessSync: () => reprocessMut.mutate(),
  };
}
