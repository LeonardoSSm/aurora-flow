import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

type StoredPublicFile = {
  relativePath: string;
  originalName: string;
  mimeType: string;
  size: number;
};

const FILE_SIGNATURES: ReadonlyArray<{ mimeType: string; extension: string; magic: number[] }> = [
  { mimeType: 'image/png', extension: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', extension: '.jpg', magic: [0xff, 0xd8, 0xff] },
  { mimeType: 'application/pdf', extension: '.pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

/**
 * Detecta o tipo real do arquivo pelos magic bytes do conteudo. O
 * mimetype/nome enviados pelo cliente no multipart sao livremente
 * forjaveis e nunca sao usados para decidir o tipo armazenado — so o
 * conteudo importa. Retorna null se nao corresponder a nenhum tipo
 * permitido para upload em formulario publico.
 */
function detectFileType(buffer: Buffer): { mimeType: string; extension: string } | null {
  return (
    FILE_SIGNATURES.find(
      ({ magic }) => buffer.length >= magic.length && magic.every((byte, index) => buffer[index] === byte),
    ) ?? null
  );
}

@Injectable()
export class PublicFormFilesService {
  private readonly uploadsRoot = join(process.cwd(), 'uploads', 'public-forms');

  async savePublicUpload(
    formId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<StoredPublicFile> {
    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Tipo de arquivo nao permitido.');
    }

    // Nome em disco 100% gerado pelo servidor (timestamp + uuid + extensao
    // detectada pelo conteudo) — nao reaproveita nada do nome enviado pelo
    // cliente, fechando qualquer via de um upload ".html"/".svg" disfarcado
    // de imagem ser servido (e executado) com a extensao original.
    const fileName = `${Date.now()}_${randomUUID()}${detected.extension}`;
    const targetDirectory = join(this.uploadsRoot, formId);
    const targetPath = join(targetDirectory, fileName);

    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.writeFile(targetPath, file.buffer);

    return {
      relativePath: `${formId}/${fileName}`.replace(/\\/g, '/'),
      originalName: file.originalname,
      mimeType: detected.mimeType,
      size: file.size,
    };
  }

  getUploadsRoot(): string {
    return this.uploadsRoot;
  }
}
