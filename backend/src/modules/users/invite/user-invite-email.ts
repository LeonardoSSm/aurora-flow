import { escapeHtml, toSingleLine } from '../../notifications/domain/notification-template';

export interface UserInviteEmailInput {
  orgName: string;
  fullName: string;
  email: string;
  invitedByName?: string | null;
  link: string;
  loginUrl: string;
  expiresAt: Date;
}

export interface UserInviteEmail {
  subject: string;
  text: string;
  html: string;
}

function formatDateTimeBr(date: Date): string {
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * E-mail de convite. Nome e organização vêm de dados e são escapados; o único HTML "vivo" são os
 * links montados pelo sistema (URL do frontend + token). A primeira linha do texto puro é o resumo,
 * porque é ela que o Gmail mostra na prévia da caixa de entrada.
 */
export function buildUserInviteEmail(input: UserInviteEmailInput): UserInviteEmail {
  const subject = toSingleLine(`[${input.orgName}] Seu acesso foi criado — defina sua senha`).slice(0, 200);
  const expires = formatDateTimeBr(input.expiresAt);
  const name = firstName(input.fullName);
  const invitedBy = input.invitedByName?.trim() ? input.invitedByName.trim() : null;
  const intro = invitedBy
    ? `${invitedBy} criou seu acesso ao ${input.orgName}.`
    : `Seu acesso ao ${input.orgName} foi criado.`;

  const text = [
    `${intro} Defina sua senha para entrar.`,
    '',
    `Olá, ${name}!`,
    '',
    `Seu usuário é: ${input.email}`,
    '',
    'Para criar sua senha, abra o link abaixo:',
    input.link,
    '',
    `O link é pessoal, só pode ser usado uma vez e vale até ${expires}.`,
    `Se a sua conta for Google corporativa, você também pode entrar com o Google em ${input.loginUrl}`,
    '',
    'Se você não esperava este e-mail, ignore-o.',
  ].join('\n');

  const e = escapeHtml;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:560px">
<p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${e(input.orgName)} · convite de acesso</p>
<h2 style="margin:0 0 12px;font-size:18px">Olá, ${e(name)}!</h2>
<p style="margin:0 0 12px">${e(intro)} Para entrar, crie sua senha pelo botão abaixo.</p>
<p style="margin:0 0 12px"><strong>Seu usuário:</strong> ${e(input.email)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0"><tr><td bgcolor="#2563eb" style="background-color:#2563eb;border-radius:8px"><a href="${e(input.link)}" style="color:#ffffff;padding:10px 18px;text-decoration:none;font-weight:bold;display:inline-block">Criar minha senha</a></td></tr></table>
<p style="margin:0 0 4px;color:#6b7280;font-size:12px">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${e(input.link)}</p>
<p style="margin:12px 0 0;color:#6b7280;font-size:12px">O link é pessoal, só pode ser usado uma vez e vale até <strong>${e(expires)}</strong>. Se a sua conta for Google corporativa, você também pode <a href="${e(input.loginUrl)}" style="color:#2563eb">entrar com o Google</a>. Se você não esperava este e-mail, ignore-o.</p>
</div>`;

  return { subject, text, html };
}
