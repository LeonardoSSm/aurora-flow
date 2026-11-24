import { FileText } from 'lucide-react';
import type { GoogleWorkspaceConnectionStatus } from '../../../auth/services/google-workspace-api';
import type { FormGoogleSheetsState } from '../../../forms/types';

type IntegrationAction = 'connect' | 'disconnect' | 'create-sheet' | 'reenqueue' | 'reprocess' | null;

function SwitchControl({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-12 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-bg-hover',
      ].join(' ')}
    >
      <span
        className={[
          'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

const secondaryBtn =
  'h-8 rounded-[8px] bg-bg-hover px-3 text-xs font-bold text-primary disabled:opacity-60';

/**
 * Sincronização das respostas com o Google Sheets. Vivia na aba "Integrações" do Criador; no
 * protótipo de Processos fica na configuração da fase de início, onde a resposta entra.
 */
export function ProcessGoogleSheetsSettings({
  formId,
  connectionStatus,
  sheetsStatus,
  enabled,
  autoCreateOnSave,
  loading,
  action,
  onToggleEnabled,
  onToggleAutoCreate,
  onConnect,
  onDisconnect,
  onCreateSpreadsheet,
  onOpenSpreadsheet,
  onReenqueue,
  onReprocess,
}: {
  formId: string;
  connectionStatus: GoogleWorkspaceConnectionStatus | null | undefined;
  sheetsStatus: FormGoogleSheetsState | null | undefined;
  enabled: boolean;
  autoCreateOnSave: boolean;
  loading: boolean;
  action: IntegrationAction;
  onToggleEnabled: (checked: boolean) => void;
  onToggleAutoCreate: (checked: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onCreateSpreadsheet: () => void;
  onOpenSpreadsheet: () => void;
  onReenqueue: () => void;
  onReprocess: () => void;
}) {
  const connected = connectionStatus?.status === 'connected';

  return (
    <div className="rounded-[10px] border border-border-default p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#e3f8f0] text-[#00a96b] dark:bg-emerald-900/30 dark:text-emerald-400">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-tx-primary">
              Google Sheets
              <span className="rounded-full bg-[#e3f8f0] px-2 py-0.5 text-[10px] font-bold uppercase text-[#008d5a] dark:bg-emerald-900/30 dark:text-emerald-400">
                {connected ? 'Conectado' : 'Desconectado'}
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs text-tx-secondary">
              {connectionStatus?.linkedAccountEmail ??
                `Domínio permitido: ${connectionStatus?.domain ?? 'tijucaalimentos.com'}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={connected ? onDisconnect : onConnect}
          disabled={loading || action === 'connect' || action === 'disconnect'}
          className={
            connected
              ? 'h-8 shrink-0 rounded-[8px] bg-bg-s2 px-3 text-xs font-bold text-tx-primary hover:bg-bg-hover disabled:opacity-60'
              : 'h-8 shrink-0 rounded-[8px] bg-primary px-3 text-xs font-bold text-white disabled:opacity-60'
          }
        >
          {connected
            ? action === 'disconnect'
              ? 'Desconectando...'
              : 'Desconectar'
            : action === 'connect'
              ? 'Abrindo...'
              : 'Conectar'}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-tx-primary">Sincronizar respostas numa planilha</p>
          <p className="mt-0.5 text-xs text-tx-secondary">Cada solicitação que entra vira uma linha.</p>
        </div>
        <SwitchControl checked={enabled} onChange={onToggleEnabled} />
      </div>

      {enabled ? (
        <div className="mt-4 grid gap-3 border-l-2 border-primary/20 pl-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-bold text-tx-primary">Criar planilha automaticamente ao salvar</p>
            <SwitchControl checked={autoCreateOnSave} onChange={onToggleAutoCreate} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCreateSpreadsheet} disabled={!formId || action === 'create-sheet'} className={secondaryBtn}>
              {action === 'create-sheet' ? 'Criando...' : 'Criar planilha'}
            </button>
            <button type="button" onClick={onOpenSpreadsheet} disabled={!sheetsStatus?.spreadsheetUrl} className={secondaryBtn}>
              Abrir planilha
            </button>
            <button type="button" onClick={onReenqueue} disabled={!sheetsStatus?.enabled || action === 'reenqueue'} className={secondaryBtn}>
              Reenfileirar sync
            </button>
            <button type="button" onClick={onReprocess} disabled={!sheetsStatus?.enabled || action === 'reprocess'} className={secondaryBtn}>
              Reprocessar
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-tx-muted">Os interruptores gravam no “Salvar” do processo.</p>
    </div>
  );
}
