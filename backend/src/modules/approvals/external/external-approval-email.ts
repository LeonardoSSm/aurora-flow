import { escapeHtml, toSingleLine } from '../../notifications/domain/notification-template';

export interface ExternalApprovalEmailInput {
  orgName: string;
  approvalTitle: string;
  approvalDescription?: string | null;
  solicitationNumber: string;
  solicitationTitle: string;
  requesterName?: string | null;
  link: string;
  expiresAt: Date;
}

export interface ExternalApprovalEmail {
  subject: string;
  text: string;
  html: string;
}

function formatDateTimeBr(date: Date): string {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

/**
 * E-mail com o link pessoal de aprovação. Tudo o que vem de dados (título, descrição, nomes) é
 * escapado — nada vira marcação; o único HTML "vivo" é o botão, cujo `href` é o link montado pelo
 * sistema (URL do frontend + token), nunca um valor digitado por alguém.
 */
export function buildExternalApprovalEmail(input: ExternalApprovalEmailInput): ExternalApprovalEmail {
  const subject = toSingleLine(`[${input.orgName}] Aprovação pendente: ${input.approvalTitle}`).slice(0, 200);
  const expires = formatDateTimeBr(input.expiresAt);
  const requester = input.requesterName?.trim() ? input.requesterName.trim() : null;

  const text = [
    `${input.orgName} — aprovação pendente`,
    '',
    `Você foi indicado para aprovar: ${input.approvalTitle}`,
    input.approvalDescription?.trim() ? `\n${input.approvalDescription.trim()}\n` : '',
    `Solicitação ${input.solicitationNumber}: ${input.solicitationTitle}`,
    requester ? `Solicitante: ${requester}` : '',
    '',
    `Para ver os detalhes e aprovar ou reprovar, abra o link abaixo:`,
    input.link,
    '',
    `Este link é pessoal e vale até ${expires}. Não o encaminhe a ninguém: quem tiver o link consegue decidir em seu nome.`,
    `Se você não esperava este e-mail, ignore-o.`,
  ]
    .filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''))
    .join('\n');

  const e = escapeHtml;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:560px">
<p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${e(input.orgName)} · aprovação pendente</p>
<h2 style="margin:0 0 12px;font-size:18px">${e(input.approvalTitle)}</h2>
${input.approvalDescription?.trim() ? `<p style="white-space:pre-wrap;margin:0 0 12px">${e(input.approvalDescription.trim())}</p>` : ''}
<p style="margin:0 0 4px"><strong>Solicitação ${e(input.solicitationNumber)}:</strong> ${e(input.solicitationTitle)}</p>
${requester ? `<p style="margin:0 0 12px"><strong>Solicitante:</strong> ${e(requester)}</p>` : ''}
<p style="margin:16px 0"><a href="${e(input.link)}" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Ver detalhes e decidir</a></p>
<p style="margin:0 0 4px;color:#6b7280;font-size:12px">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${e(input.link)}</p>
<p style="margin:12px 0 0;color:#6b7280;font-size:12px">Este link é pessoal e vale até <strong>${e(expires)}</strong>. Não o encaminhe: quem tiver o link consegue decidir em seu nome. Se você não esperava este e-mail, ignore-o.</p>
</div>`;

  return { subject, text, html };
}
