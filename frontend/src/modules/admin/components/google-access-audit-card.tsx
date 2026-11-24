import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../../app/auth-context';
import { Button, Card } from '../../../components/ui';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import {
  auditGoogleAccess,
  revokeBroadGoogleAccess,
  type GoogleAccessAction,
  type GoogleAccessAuditReport,
} from '../services/google-access-api';

const ACTION_LABEL: Record<GoogleAccessAction, string> = {
  ok: 'Somente o necessário',
  would_revoke: 'Acesso amplo — será revogado',
  revoked: 'Revogado — precisa reconectar',
  would_clear_invalid: 'Token inválido — será limpo',
  cleared_invalid: 'Token inválido — limpo',
  error: 'Falha',
};

/** Nome curto do escopo para exibir (…/auth/spreadsheets → spreadsheets). */
export function shortScope(scope: string): string {
  return scope.replace('https://www.googleapis.com/auth/', '');
}

/**
 * Auditoria dos acessos Google guardados. Quem conectou antes de o sistema passar a pedir só
 * `drive.file` continua com um token que enxerga TODAS as suas planilhas, e o Google não permite
 * reduzir um acesso que já existe: a única saída é revogar e reconectar. Aqui o admin vê quem está
 * nessa situação e revoga de uma vez. Só aparece para quem tem `system.maintenance`.
 */
export function GoogleAccessAuditCard() {
  const { hasPermission } = useAuth();
  const [report, setReport] = useState<GoogleAccessAuditReport | null>(null);
  const [confirming, setConfirming] = useState(false);

  const audit = useMutation({
    mutationFn: auditGoogleAccess,
    onSuccess: (data) => {
      setReport(data);
      setConfirming(false);
    },
  });
  const revoke = useMutation({
    mutationFn: revokeBroadGoogleAccess,
    onSuccess: (data) => {
      setReport(data);
      setConfirming(false);
    },
  });

  if (!hasPermission('system.maintenance')) return null;

  const error = audit.error ?? revoke.error;
  const busy = audit.isPending || revoke.isPending;
  const pending = report?.dryRun ? report.withBroadAccess + (report.users.filter((u) => u.action === 'would_clear_invalid').length) : 0;
  const flagged = report?.users.filter((u) => u.action !== 'ok') ?? [];

  return (
    <Card className="grid gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheck size={18} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-tx-primary">Permissões do Google dos usuários</h3>
          <p className="text-xs text-tx-secondary">
            O sistema pede só acesso às planilhas que ele mesmo cria (<span className="font-mono">drive.file</span>).
            Quem conectou antes disso pode ainda ter acesso a todas as próprias planilhas.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="subtle" disabled={busy} onClick={() => audit.mutate()}>
          {audit.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Verificar permissões
        </Button>

        {report?.dryRun && pending > 0 && !confirming && (
          <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            Revogar acessos amplos ({pending})
          </Button>
        )}
      </div>

      {confirming && (
        <div role="alertdialog" aria-label="Confirmar revogação" className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Isso desconecta o Google de <strong>{pending}</strong> usuário(s) e revoga o acesso no Google. Cada
              um precisa clicar em <strong>Conectar Google</strong> de novo (ou entrar com Google); até lá, as
              sincronizações com planilhas em nome dessa pessoa falham.
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => revoke.mutate()}>
              {revoke.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Sim, revogar
            </Button>
            <Button size="sm" variant="subtle" disabled={busy} onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {getApiErrorMessage(error, 'Não foi possível concluir a operação.')}
        </p>
      )}

      {report && (
        <div className="grid gap-2" data-testid="google-access-report">
          <p className="flex items-center gap-2 text-sm text-tx-primary">
            {report.withBroadAccess === 0 && report.clearedInvalid === 0 && report.failed === 0 ? (
              <CheckCircle size={16} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={16} className="text-amber-600" />
            )}
            {report.checked === 0
              ? 'Nenhum usuário com o Google conectado.'
              : report.dryRun
                ? `${report.checked} conectado(s): ${report.withBroadAccess} com acesso amplo, ${report.ok} certo(s)${
                    report.failed ? `, ${report.failed} com falha na consulta` : ''
                  }.`
                : `Revogado para ${report.revoked} usuário(s)${
                    report.clearedInvalid ? `; ${report.clearedInvalid} token(s) inválido(s) limpo(s)` : ''
                  }${report.failed ? `; ${report.failed} falha(s)` : ''}.`}
          </p>

          {flagged.length > 0 && (
            <ul className="grid gap-1 rounded-lg border border-border-default p-2 text-xs">
              {flagged.map((entry) => (
                <li key={entry.userId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-tx-primary">{entry.email}</span>
                  <span className="text-tx-secondary">
                    {ACTION_LABEL[entry.action]}
                    {entry.excessScopes.length > 0 ? ` (${entry.excessScopes.map(shortScope).join(', ')})` : ''}
                    {entry.error ? ` — ${entry.error}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
