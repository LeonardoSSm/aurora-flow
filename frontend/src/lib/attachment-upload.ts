/**
 * Arquivo escolhido e ainda não enviado: o arquivo (já otimizado, quando é foto), o nome que a
 * pessoa quer dar a ele e a descrição. Vale para o formulário público, o campo de arquivo da fase e
 * os anexos do card.
 */
export type PendingUpload = {
  id: string;
  file: File;
  /** Nome sem a extensão; começa igual ao do arquivo. */
  name: string;
  description: string;
  /** Tamanho antes da otimização — para mostrar quanto encolheu. */
  originalSize: number;
};

export type UploadLabel = { name?: string; description?: string };

/** Lado maior de uma foto depois de otimizada. Sobra para ler etiqueta e nota fiscal. */
export const IMAGE_MAX_DIMENSION = 2560;
export const JPEG_QUALITY = 0.82;
/** Abaixo disto não vale o trabalho (e o risco de perder qualidade à toa). */
const MIN_BYTES_TO_OPTIMIZE = 300 * 1024;

export const FILE_LABEL_REQUIRED_MESSAGE = 'Renomeie o arquivo ou escreva uma descrição.';

/** Configuração do campo de arquivo: ausente = exige (só `requireFileLabel: false` desliga). */
export function fileLabelRequired(settings: { requireFileLabel?: boolean } | null | undefined): boolean {
  return settings?.requireFileLabel !== false;
}

export function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

let pendingSeq = 0;

export function createPendingUpload(file: File, originalSize: number = file.size): PendingUpload {
  pendingSeq += 1;
  return {
    id: `pending-${Date.now()}-${pendingSeq}`,
    file,
    name: splitFileName(file.name).base,
    description: '',
    originalSize,
  };
}

/** Renomeado = nome preenchido e diferente do que veio no arquivo. */
export function isUploadRenamed(upload: PendingUpload): boolean {
  const name = upload.name.trim();
  return name !== '' && name !== splitFileName(upload.file.name).base.trim();
}

/** A exigência do item 7: cada arquivo precisa de um nome novo ou de uma descrição. */
export function isUploadLabeled(upload: PendingUpload): boolean {
  return isUploadRenamed(upload) || upload.description.trim() !== '';
}

/** O que vai junto no envio: só o nome se mudou (o servidor mantém a extensão) e a descrição se houver. */
export function uploadLabel(upload: PendingUpload): UploadLabel {
  const label: UploadLabel = {};
  if (isUploadRenamed(upload)) label.name = upload.name.trim();
  const description = upload.description.trim();
  if (description) label.description = description;
  return label;
}

export function appendUploadLabel(form: FormData, label: UploadLabel | undefined): void {
  if (label?.name) form.append('name', label.name);
  if (label?.description) form.append('description', label.description);
}

function replaceExtension(fileName: string, ext: string): string {
  return `${splitFileName(fileName).base}${ext}`;
}

function isOpaque(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return false;
  }
  return true;
}

/**
 * Diminui fotos no navegador antes de subir: reduz o lado maior para IMAGE_MAX_DIMENSION e regrava em
 * JPEG (qualidade JPEG_QUALITY). PNG sem transparência vira JPEG quando o campo aceita JPEG; PNG com
 * transparência continua PNG (só reduzido). A orientação do EXIF é aplicada e os metadados (inclusive
 * GPS) saem. Se não ficar menor, ou o navegador não souber fazer, devolve o arquivo como veio. PDF,
 * Word e Excel não passam por aqui: já são comprimidos por dentro.
 */
export async function optimizeImageFile(file: File, opts: { allowJpeg?: boolean } = {}): Promise<File> {
  const allowJpeg = opts.allowJpeg ?? true;
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return file;
  if (file.size < MIN_BYTES_TO_OPTIMIZE) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    let targetType = file.type;
    if (file.type === 'image/png') {
      ctx.drawImage(bitmap, 0, 0, width, height);
      if (allowJpeg && isOpaque(ctx, width, height)) targetType = 'image/jpeg';
      ctx.clearRect(0, 0, width, height);
    }
    if (targetType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, targetType, targetType === 'image/jpeg' ? JPEG_QUALITY : undefined),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = targetType === file.type ? file.name : replaceExtension(file.name, '.jpg');
    return new File([blob], name, { type: targetType, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Otimiza (quando é foto) e prepara cada arquivo para receber nome e descrição. */
export async function prepareUploads(
  files: File[],
  opts: { allowJpeg?: boolean } = {},
): Promise<PendingUpload[]> {
  return Promise.all(
    files.map(async (file) => createPendingUpload(await optimizeImageFile(file, opts), file.size)),
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
