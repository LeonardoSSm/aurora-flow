import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  SheetIcon,
  Unplug,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '../../../components/ui';
import { GoogleAccessAuditCard } from '../components/google-access-audit-card';
import { apiBaseUrl } from '../../../services/api';
import { useToast } from '../../../components/ui';
import {
  disconnectGoogleWorkspace,
  fetchGoogleConnectUrl,
  fetchGoogleWorkspaceStatus,
  type GoogleWorkspaceConnectionStatus,
} from '../../auth/services/google-workspace-api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Google Workspace Panel ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GoogleWorkspaceConnectionStatus['status'] | null }) {
  if (!status) return null;

  const map = {
    connected: {
      label: 'Conectado',
      icon: <CheckCircle size={14} className="text-emerald-500" />,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    disconnected: {
      label: 'Desconectado',
      icon: <WifiOff size={14} className="text-amber-500" />,
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    configured: {
      label: 'Não vinculado',
      icon: <AlertCircle size={14} className="text-tx-secondary" />,
      cls: 'bg-surface-container-low text-tx-secondary border-border-default',
    },
  } as const;

  const { label, icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

function GoogleWorkspaceCard() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['google-workspace-status'],
    queryFn: fetchGoogleWorkspaceStatus,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGoogleWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-workspace-status'] });
      showToast({ title: 'Conta Google desconectada.', variant: 'success' });
    },
    onError: () => {
      showToast({ title: 'Erro ao desconectar conta Google.', variant: 'error' });
    },
  });

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const url = await fetchGoogleConnectUrl('/administracao/integracoes');
      window.location.href = url;
    } catch {
      showToast({ title: 'Não foi possível iniciar a conexão com Google.', variant: 'error' });
      setIsConnecting(false);
    }
  }

  const isConnected = status?.status === 'connected';
  const oauthReady = status?.oauthConfigured ?? false;

  return (
    <Card className="grid gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Google "G" logo */}
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-border-default">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-tx-primary">Google Workspace</h3>
            <p className="text-xs text-tx-secondary">
              Google Sheets · Drive · OAuth 2.0
            </p>
          </div>
        </div>
        <StatusBadge status={status?.status ?? null} />
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-tx-secondary">
          <Loader2 size={14} className="animate-spin" />
          Verificando status…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={14} />
          Não foi possível verificar o status da integração.
          <button onClick={() => refetch()} className="ml-auto underline hover:no-underline">
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {/* OAuth config warning */}
          {!oauthReady && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                Credenciais OAuth não configuradas no servidor.
                Configure <code className="rounded bg-amber-100 px-1 text-xs">GOOGLE_OAUTH_CLIENT_ID</code>{' '}
                e <code className="rounded bg-amber-100 px-1 text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> no backend{' '}
                <code className="rounded bg-amber-100 px-1 text-xs">.env</code>.
              </span>
            </div>
          )}

          {/* Domain */}
          {status?.domain && (
            <div className="flex items-center gap-2 text-sm text-tx-secondary">
              <Wifi size={13} />
              Domínio corporativo:{' '}
              <span className="font-semibold text-tx-primary">@{status.domain}</span>
            </div>
          )}

          {/* Connected account info */}
          {isConnected && status?.linkedAccountEmail && (
            <div className="grid gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle size={14} />
                Conta vinculada com sucesso
              </div>
              <p className="text-sm text-emerald-700">{status.linkedAccountEmail}</p>
              {status.connectedAt && (
                <p className="text-xs text-emerald-600">
                  Conectado em {new Date(status.connectedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          )}

          {/* Disconnected info */}
          {status?.status === 'disconnected' && status?.linkedAccountEmail && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Conta <strong>{status.linkedAccountEmail}</strong> foi desconectada.
              Reconecte para usar o Google Sheets nos fluxos.
            </div>
          )}

          {/* Not connected yet */}
          {status?.status === 'configured' && (
            <p className="text-sm text-tx-secondary">
              Conecte sua conta Google para habilitar a integração com o Google Sheets nos fluxos automatizados.
            </p>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-border-default/30 pt-3">
        {!isConnected ? (
          <Button
            variant="primary"
            size="sm"
            disabled={isConnecting || !oauthReady || isLoading}
            onClick={handleConnect}
          >
            {isConnecting ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <ExternalLink size={14} className="mr-1.5" />
            )}
            {isConnecting ? 'Redirecionando…' : 'Conectar conta Google'}
          </Button>
        ) : (
          <>
            <Button
              variant="subtle"
              size="sm"
              disabled={isConnecting || !oauthReady}
              onClick={handleConnect}
            >
              <RefreshCw size={14} className="mr-1.5" />
              Reconectar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate()}
              className="text-rose-600 hover:bg-rose-50"
            >
              {disconnectMutation.isPending ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Unplug size={14} className="mr-1.5" />
              )}
              Desconectar
            </Button>
          </>
        )}

        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-tx-secondary hover:bg-surface-container-low"
          title="Atualizar status"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>
    </Card>
  );
}

// ─── Google Sheets Instructions ───────────────────────────────────────────────

function GoogleSheetsInstructions() {
  return (
    <Card className="grid gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <SheetIcon size={20} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="font-bold text-tx-primary">Configurar Fluxo Google Sheets</h3>
          <p className="text-xs text-tx-secondary">Como conectar uma planilha a um fluxo automatizado</p>
        </div>
      </div>

      <ol className="grid gap-3 text-sm text-tx-secondary">
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
          <span>Conecte sua conta Google acima (a mesma que tem acesso à planilha).</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
          <span>
            Crie uma planilha no Google Sheets com colunas correspondentes aos campos do formulário.
            Ex.: <code className="rounded bg-surface-container-high px-1 text-xs">Data | Número | Item | Valor | Categoria | Solicitante</code>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
          <span>
            Copie o ID da planilha da URL:{' '}
            <code className="rounded bg-surface-container-high px-1 text-xs">
              docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
            </code>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">4</span>
          <span>
            No editor de fluxos, edite o nó <em>Google Sheets</em> e cole o ID da planilha no campo{' '}
            <code className="rounded bg-surface-container-high px-1 text-xs">spreadsheetId</code>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">5</span>
          <span>Submeta um formulário e verifique se a linha foi adicionada na planilha.</span>
        </li>
      </ol>

      <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-xs text-sky-800">
        <strong>Nota:</strong> A conta Google conectada precisa ter permissão de <strong>Editor</strong> na planilha.
        O backend usa o usuário que criou o formulário para autenticação.
      </div>
    </Card>
  );
}

// ─── OAuth Setup Instructions ─────────────────────────────────────────────────

/** Endereço que o backend usa no retorno do Google (rota `auth/google/callback` da API). */
const GOOGLE_CALLBACK_URL = `${apiBaseUrl.replace(/\/+$/, '')}/auth/google/callback`;

const codeClass = 'rounded bg-amber-100 px-1 text-xs font-mono dark:bg-amber-400/15';

function OAuthSetupCard() {
  return (
    <Card className="grid gap-4 border-amber-200 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex items-center gap-3">
        <AlertCircle size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <h3 className="font-bold text-amber-900 dark:text-amber-200">
            Pré-requisitos: Google Cloud Console
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Configure antes de conectar a conta
          </p>
        </div>
      </div>

      <ol className="grid gap-2 text-sm text-amber-900 dark:text-amber-100">
        <li className="flex gap-3">
          <span className="shrink-0 font-bold">1.</span>
          <span>Acesse <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">console.cloud.google.com</a> e crie/selecione o projeto <em>Aurora Flow</em>.</span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 font-bold">2.</span>
          <span>Ative as APIs: <strong>Google Sheets API</strong> e <strong>Google Drive API</strong>. Em <strong>Acesso a dados</strong> (tela de permissão OAuth), adicione apenas o escopo <strong>.../auth/drive.file</strong> — o sistema só acessa as planilhas que ele mesmo cria.</span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 font-bold">3.</span>
          <span>Em <em>Credenciais</em>, crie um <strong>ID do cliente OAuth</strong> (tipo: Aplicativo da Web).</span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 font-bold">4.</span>
          <span>
            Adicione em <em>URIs de redirecionamento autorizados</em>:{' '}
            <code className={`${codeClass} break-all`}>{GOOGLE_CALLBACK_URL}</code>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 font-bold">5.</span>
          <span>
            Configure no <code className={codeClass}>backend/.env</code>:{' '}
            <code className={codeClass}>GOOGLE_OAUTH_CLIENT_ID</code>,{' '}
            <code className={codeClass}>GOOGLE_OAUTH_CLIENT_SECRET</code> e{' '}
            <code className={codeClass}>GOOGLE_OAUTH_CALLBACK_URL</code> (o mesmo endereço do
            passo 4).
          </span>
        </li>
      </ol>
    </Card>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AdminIntegrationsView() {
  return (
    <section className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="grid gap-4 content-start">
          <GoogleWorkspaceCard />
          <GoogleAccessAuditCard />
          <GoogleSheetsInstructions />
        </div>

        {/* Right column */}
        <div className="grid gap-4 content-start">
          <OAuthSetupCard />

          {/* WhatsApp status (informational) */}
          <Card className="grid gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-tx-primary">WhatsApp (Evolution API)</h3>
                <p className="text-xs text-tx-secondary">Envio de mensagens via instância tijuca-flow</p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                <WifiOff size={12} />
                Aguardando QR
              </span>
            </div>
            <p className="text-sm text-tx-secondary">
              Para conectar, acesse o{' '}
              <a
                href="http://localhost:8082/manager"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline dark:text-blue-300"
              >
                Evolution API Manager <ExternalLink size={11} />
              </a>{' '}
              e escaneie o QR Code da instância <code className="rounded bg-surface-container-high px-1 text-xs">tijuca-flow</code>.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
