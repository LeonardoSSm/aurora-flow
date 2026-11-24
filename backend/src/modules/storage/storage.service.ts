import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, mkdirSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import type { ReadStream } from 'fs';
import { randomUUID } from 'crypto';

/**
 * Teto técnico de um arquivo enviado, em MB (STORAGE_MAX_FILE_SIZE_MB). Os formulários não têm mais
 * limite próprio de tamanho nem de quantidade; este teto só protege o servidor (o multer guarda o
 * arquivo em memória antes de gravar). Padrão alto de propósito.
 */
export const DEFAULT_MAX_UPLOAD_MB = 100;

export function resolveMaxUploadBytes(raw: string | undefined): number {
  const mb = Number(raw);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
}

/**
 * Para o `limits.fileSize` do multer, fixado no decorator (antes de existir ConfigService): lê o
 * mesmo STORAGE_MAX_FILE_SIZE_MB que o StorageService.
 */
export function maxUploadBytesFromEnv(): number {
  return resolveMaxUploadBytes(process.env.STORAGE_MAX_FILE_SIZE_MB);
}

@Injectable()
export class StorageService {
  private readonly basePath: string;
  private readonly maxFileSizeBytes: number;
  private readonly allowedTypes: Set<string>;

  constructor(private readonly configService: ConfigService) {
    this.basePath = this.configService.get<string>('STORAGE_LOCAL_PATH', './uploads');
    this.maxFileSizeBytes = resolveMaxUploadBytes(
      this.configService.get<string>('STORAGE_MAX_FILE_SIZE_MB'),
    );
    const raw = this.configService.get<string>(
      'STORAGE_ALLOWED_TYPES',
      'image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    this.allowedTypes = new Set(raw.split(',').map((t) => t.trim()).filter(Boolean));
  }

  validateFile(file: Express.Multer.File): void {
    if (!this.allowedTypes.has(file.mimetype)) {
      throw new BadRequestException(`Tipo de arquivo '${file.mimetype}' não é permitido.`);
    }
    if (file.size > this.maxFileSizeBytes) {
      throw new BadRequestException(
        `Arquivo excede o tamanho máximo de ${this.maxFileSizeBytes / 1024 / 1024}MB.`,
      );
    }
  }

  async save(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ storedName: string; storagePath: string; storageType: string }> {
    const ext = extname(file.originalname);
    const storedName = `${randomUUID()}${ext}`;
    const dir = join(this.basePath, folder);
    mkdirSync(dir, { recursive: true });
    const storagePath = join(folder, storedName).replace(/\\/g, '/');
    await writeFile(join(this.basePath, storagePath), file.buffer);
    return { storedName, storagePath, storageType: 'local' };
  }

  getStream(storagePath: string): ReadStream {
    return createReadStream(join(this.basePath, storagePath));
  }

  /** Lê o arquivo inteiro em memória — usado quando os bytes precisam ser reenviados (ex.: multipart para uma API externa), não apenas transmitidos ao cliente. */
  async readFile(storagePath: string): Promise<Buffer> {
    return readFile(join(this.basePath, storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    await unlink(join(this.basePath, storagePath));
  }
}
