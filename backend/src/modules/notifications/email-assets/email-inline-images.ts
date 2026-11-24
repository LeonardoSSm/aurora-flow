import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Imagens que um e-mail do sistema pode embutir: o HTML referencia `cid:<nome>` e o canal de e-mail
 * anexa só as que aparecem nele. Os arquivos ficam ao lado deste módulo e o `nest build` os copia
 * para o `dist` (assets no nest-cli.json) — a imagem de produção sai do Docker junto com o código.
 * Imagens enviadas pela tela (arte trocada) vêm do banco, por `cid:email-image-<id>`.
 */
export const EMAIL_INLINE_IMAGES: Readonly<Record<string, { filename: string; contentType: string }>> = {
  // Arte "57 anos" de fundo do aviso de pontuação (o Gmail mostra cid também como fundo, sem listar como anexo).
  'tijuca-fundo-57anos': { filename: 'email-fundo-57anos.jpg', contentType: 'image/jpeg' },
  // Marca do Tijuca Flow (PNG gerado de brand/tijuca/tijuca-flow-mark.svg — e-mail não mostra SVG).
  'tijuca-flow-logo': { filename: 'tijuca-flow-logo.png', contentType: 'image/png' },
};

/** Prefixo do cid das imagens enviadas pela tela (`cid:email-image-<uuid>`). */
export const EMAIL_IMAGE_CID_PREFIX = 'email-image-';

export type EmailInlineAttachment = { filename: string; contentType: string; cid: string } & (
  | { path: string }
  | { content: Buffer }
);

/** Caminho de um arquivo desta pasta (no `dist` em produção). */
export function emailAssetPath(filename: string, dir: string = __dirname): string {
  return join(dir, filename);
}

/** Todos os `cid:` que o HTML referencia, sem repetir. */
export function referencedCids(html: string): string[] {
  return [...new Set([...html.matchAll(/cid:([a-z0-9-]+)/gi)].map((match) => match[1]))];
}

/** Id da imagem enviada pela tela, quando o cid é `email-image-<uuid>`. */
export function emailImageIdOfCid(cid: string): string | null {
  return cid.startsWith(EMAIL_IMAGE_CID_PREFIX) ? cid.slice(EMAIL_IMAGE_CID_PREFIX.length) : null;
}

/**
 * Anexos inline (nodemailer) das imagens registradas que o HTML referencia por `cid:`. Arquivo que
 * não está no disco fica de fora: o e-mail sai com o fundo de cor, em vez de falhar o envio.
 */
export function inlineImagesFor(html: string, dir: string = __dirname): EmailInlineAttachment[] {
  return referencedCids(html)
    .filter((cid) => cid in EMAIL_INLINE_IMAGES)
    .map((cid) => ({ cid, ...EMAIL_INLINE_IMAGES[cid], path: emailAssetPath(EMAIL_INLINE_IMAGES[cid].filename, dir) }))
    .filter((image) => existsSync(image.path));
}
