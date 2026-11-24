import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { decodeUploadedFileName } from '../attachments/attachments.service';
import {
  detectDownloadExtension,
  FORM_DOWNLOAD_MAX_BYTES,
  FORM_DOWNLOAD_PATH_PATTERN,
  type FormDownloadFile,
  safeDownloadBaseName,
} from './form-download';

/** Dentro de `uploads/` → cai no volume `formhub_uploads` em produção. */
export const FORM_DOWNLOADS_DIR = join('uploads', 'form-downloads');

@Injectable()
export class FormDownloadService {
  private readonly root = join(process.cwd(), FORM_DOWNLOADS_DIR);

  /**
   * Grava o arquivo e devolve o que vai no `settingsJson.downloadFile` do campo. O arquivo antigo
   * fica no disco ao trocar: uma versão já publicada pode continuar apontando para ele.
   */
  async save(
    formId: string,
    file: { originalname: string; size: number; buffer: Buffer },
  ): Promise<FormDownloadFile> {
    if (file.size > FORM_DOWNLOAD_MAX_BYTES || file.buffer.length > FORM_DOWNLOAD_MAX_BYTES) {
      throw new BadRequestException('O arquivo passa de 10 MB.');
    }
    if (file.buffer.length === 0) {
      throw new BadRequestException('O arquivo está vazio.');
    }
    const originalName = decodeUploadedFileName(file.originalname ?? '');
    const extension = detectDownloadExtension(file.buffer, originalName);
    if (!extension) {
      throw new BadRequestException(
        'Envie um PDF, Word (DOC/DOCX), Excel (XLS/XLSX), ODT/ODS ou imagem JPG/PNG.',
      );
    }

    // Pasta e nome gerados aqui: do nome enviado só sobra o texto limpo, e a extensão vem do conteúdo.
    const fileName = `${safeDownloadBaseName(originalName)}.${extension}`;
    const path = `${formId}/${randomUUID()}/${fileName}`;
    if (!FORM_DOWNLOAD_PATH_PATTERN.test(path)) {
      throw new BadRequestException('Nome de arquivo não aceito. Renomeie e envie de novo.');
    }
    const directory = join(this.root, ...path.split('/').slice(0, 2));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(join(directory, fileName), file.buffer);
    return { path, name: fileName, size: file.buffer.length };
  }

}

/** O arquivo do campo ainda está no disco? (publicar com o arquivo sumido deixaria um botão quebrado) */
export async function downloadFileExists(path: string): Promise<boolean> {
  if (!FORM_DOWNLOAD_PATH_PATTERN.test(path) || path.includes('..')) return false;
  try {
    const stat = await fs.stat(join(process.cwd(), FORM_DOWNLOADS_DIR, ...path.split('/')));
    return stat.isFile();
  } catch {
    return false;
  }
}
