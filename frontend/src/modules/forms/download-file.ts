import { apiBaseUrl } from '../../services/api';
import type { DownloadFileSettings } from './types';

/**
 * Endereço público do arquivo de um campo "Arquivo para baixar". O servidor sempre entrega como
 * download, com o nome que gravou. Cada parte do caminho é codificada (o nome pode ter acento e espaço).
 */
export function downloadFileUrl(file: Pick<DownloadFileSettings, 'path'>): string {
  const encoded = file.path.split('/').map(encodeURIComponent).join('/');
  return `${apiBaseUrl.replace(/\/$/, '')}/public/form-downloads/${encoded}`;
}

export function formatDownloadSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Extensões aceitas no envio (o servidor confere o conteúdo de verdade). */
export const DOWNLOAD_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
