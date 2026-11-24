export type StatusChangeEmailParams = {
  orgName: string;
  solicitationTitle: string;
  solicitationNumber: string;
  fromStatusLabel: string;
  toStatusLabel: string;
  trackingUrl: string;
};

export function buildStatusChangeEmail(p: StatusChangeEmailParams): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Solicitação atualizada</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:28px 32px;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">${p.orgName}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#374151;font-size:18px;font-weight:bold;">
                Sua solicitação foi atualizada
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
                #${p.solicitationNumber} &mdash; ${p.solicitationTitle}
              </p>

              <!-- Status transition -->
              <table cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;width:100%;margin-bottom:28px;">
                <tr>
                  <td align="center" style="padding:18px 16px;">
                    <span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:#e5e7eb;color:#374151;font-size:13px;font-weight:600;">
                      ${p.fromStatusLabel}
                    </span>
                    <span style="margin:0 12px;color:#9ca3af;font-size:18px;">&rarr;</span>
                    <span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:#1e40af;color:#ffffff;font-size:13px;font-weight:600;">
                      ${p.toStatusLabel}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:6px;background:#1e40af;">
                    <a href="${p.trackingUrl}"
                       style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Acompanhar solicitação
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Este email foi enviado automaticamente por ${p.orgName}. Não responda este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: 'Aberta',
    new: 'Nova',
    in_analysis: 'Em análise',
    waiting_approval: 'Aguardando aprovação',
    in_progress: 'Em andamento',
    approved: 'Aprovada',
    rejected: 'Rejeitada',
    waiting_integration: 'Aguardando integração',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    canceled: 'Cancelada',
    waiting: 'Aguardando',
    resolved: 'Resolvida',
  };
  return labels[status] ?? status;
}
