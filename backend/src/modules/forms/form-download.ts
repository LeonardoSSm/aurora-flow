/**
 * Campo "Arquivo para baixar" (`file_download`): quem edita o processo envia um arquivo (ex.: um
 * termo para o solicitante assinar) e o formulário público mostra um botão para baixá-lo.
 *
 * O envio é `POST /forms/:id/download-files` e o arquivo é servido, sempre como download, em
 * `/{API_PREFIX}/v1/public/form-downloads/<caminho>`. No `settingsJson.downloadFile` do campo vai
 * só o caminho gerado pelo servidor (conferido por `FORM_DOWNLOAD_PATH_PATTERN`), o nome mostrado
 * no botão e o tamanho — nunca uma URL: ninguém aponta o botão para um endereço externo.
 */

/** 10 MB: o mesmo teto do anexo que o solicitante envia de volta. */
export const FORM_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Nome do arquivo no disco (sem a extensão): o que sobra do nome enviado, limpo. */
const NAME_MAX_LENGTH = 80;

export const FORM_DOWNLOAD_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'odt',
  'ods',
  'jpg',
  'png',
] as const;
export type FormDownloadExtension = (typeof FORM_DOWNLOAD_EXTENSIONS)[number];

/**
 * `<formId>/<uuid>/<nome>.<ext>` — exatamente o que o servidor gera. A pasta com uuid deixa o
 * nome legível no disco (é ele que vai no download) sem colidir nem ser adivinhável.
 */
export const FORM_DOWNLOAD_PATH_PATTERN = new RegExp(
  `^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/\\\\.][^/\\\\]{0,${NAME_MAX_LENGTH - 1}}\\.(?:${FORM_DOWNLOAD_EXTENSIONS.join('|')})$`,
  'u',
);

export type FormDownloadFile = {
  /** Caminho relativo à pasta de downloads (ver FORM_DOWNLOAD_PATH_PATTERN). */
  path: string;
  /** Nome mostrado no botão, com a extensão. */
  name: string;
  size: number;
};

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, index) => buffer[offset + index] === byte);

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Formatos do Office/LibreOffice são ZIP (os novos) ou OLE (os antigos) por dentro. */
const ZIP_EXTENSIONS: ReadonlySet<string> = new Set(['docx', 'xlsx', 'odt', 'ods']);
const OLE_EXTENSIONS: ReadonlySet<string> = new Set(['doc', 'xls']);

/**
 * Extensão do arquivo pelo conteúdo. PDF, PNG e JPG se reconhecem pelos bytes; Word/Excel/ODF
 * são um ZIP ou um OLE genérico por dentro, então aí o nome enviado só escolhe ENTRE as extensões
 * daquele contêiner. Nada fora da lista passa (nem SVG, nem HTML, nem executável).
 */
export function detectDownloadExtension(
  buffer: Buffer,
  originalName: string,
): FormDownloadExtension | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpg';

  const declared = extensionOf(originalName);
  if (startsWith(buffer, ZIP_MAGIC) && declared && ZIP_EXTENSIONS.has(declared)) {
    return declared as FormDownloadExtension;
  }
  if (startsWith(buffer, OLE_MAGIC) && declared && OLE_EXTENSIONS.has(declared)) {
    return declared as FormDownloadExtension;
  }
  return null;
}

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Nome do arquivo no disco a partir do nome enviado: sem a extensão, só letras (com acento),
 * números, espaço e `-_.()`; nunca começa com ponto. Vazio vira "arquivo".
 */
export function safeDownloadBaseName(originalName: string): string {
  const withoutExtension = originalName.trim().replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const cleaned = withoutExtension
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/^[\s._-]+/, '')
    .trim()
    .slice(0, NAME_MAX_LENGTH - 6)
    .trim();
  return cleaned || 'arquivo';
}

/**
 * `Content-Disposition` do download com o nome legível. Sem o `filename*` em UTF-8 o "ã" de
 * "versão" ia só em Latin-1 e o navegador podia salvar com o nome quebrado (o atributo `download`
 * do link não vale entre origens: quem manda no nome é este cabeçalho). O `filename` em ASCII fica
 * de reserva para cliente antigo.
 */
export function downloadContentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * O `downloadFile` como deve ser gravado, ou `null` se o campo ainda está sem arquivo. Lança se
 * vier algo que não é um caminho gerado pelo servidor.
 */
export function parseDownloadFile(raw: unknown): FormDownloadFile | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidDownloadFileError();
  }
  const value = raw as Record<string, unknown>;
  const path = typeof value.path === 'string' ? value.path : '';
  if (!FORM_DOWNLOAD_PATH_PATTERN.test(path) || path.includes('..')) {
    throw new InvalidDownloadFileError();
  }
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim().slice(0, 120)
      : fileName;
  const size =
    typeof value.size === 'number' && Number.isFinite(value.size) && value.size >= 0
      ? Math.round(value.size)
      : 0;
  return { path, name, size };
}

export class InvalidDownloadFileError extends Error {
  constructor() {
    super('Arquivo do campo "Arquivo para baixar" inválido. Envie o arquivo de novo pelo construtor.');
  }
}

type FieldLike = { fieldType: string; label?: string; settingsJson?: Record<string, unknown> | null };

/**
 * No salvar: o campo "Arquivo para baixar" guarda só `downloadFile` (ou nada, enquanto está sem
 * arquivo — rascunho pode). Qualquer outra chave sai; caminho que não é do servidor derruba o salvar.
 */
export function normalizeDownloadFields(sections: ReadonlyArray<{ fields: FieldLike[] }>): void {
  for (const field of sections.flatMap((section) => section.fields)) {
    if (field.fieldType !== 'file_download') continue;
    const downloadFile = parseDownloadFile(field.settingsJson?.downloadFile);
    field.settingsJson = downloadFile ? { downloadFile } : {};
  }
}

/** Campos "Arquivo para baixar" ainda sem arquivo (não pode publicar assim). */
export function downloadFieldsWithoutFile<T extends FieldLike>(fields: readonly T[]): T[] {
  return fields.filter((field) => {
    if (field.fieldType !== 'file_download') return false;
    try {
      return parseDownloadFile(field.settingsJson?.downloadFile) === null;
    } catch {
      return true;
    }
  });
}
