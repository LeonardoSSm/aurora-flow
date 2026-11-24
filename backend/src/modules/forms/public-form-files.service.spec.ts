import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { PublicFormFilesService } from './public-form-files.service';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_HEADER = Buffer.from('%PDF-1.4');

describe('PublicFormFilesService.savePublicUpload', () => {
  let service: PublicFormFilesService;

  beforeEach(() => {
    service = new PublicFormFilesService();
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as never);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aceita um PNG real e ignora nome/extensao enviados pelo cliente', async () => {
    const result = await service.savePublicUpload('form-1', {
      originalname: 'foto.png',
      mimetype: 'image/png',
      size: PNG_HEADER.length,
      buffer: PNG_HEADER,
    });

    expect(result.relativePath).toMatch(/^form-1\/\d+_[0-9a-f-]{36}\.png$/);
    expect(result.mimeType).toBe('image/png');
  });

  it('rejeita HTML disfarcado de imagem (mimetype/nome forjados, conteudo real e HTML)', async () => {
    const maliciousBuffer = Buffer.from('<script>alert(document.cookie)</script>');

    await expect(
      service.savePublicUpload('form-1', {
        originalname: 'foto.png',
        mimetype: 'image/png',
        size: maliciousBuffer.length,
        buffer: maliciousBuffer,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('aceita JPEG e PDF reais pelas magic bytes', async () => {
    const jpeg = await service.savePublicUpload('form-1', {
      originalname: 'a.jpg',
      mimetype: 'image/jpeg',
      size: JPEG_HEADER.length,
      buffer: JPEG_HEADER,
    });
    expect(jpeg.relativePath).toMatch(/\.jpg$/);

    const pdf = await service.savePublicUpload('form-1', {
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      size: PDF_HEADER.length,
      buffer: PDF_HEADER,
    });
    expect(pdf.relativePath).toMatch(/\.pdf$/);
  });

  it('nunca usa a extensao original do arquivo no nome armazenado', async () => {
    const result = await service.savePublicUpload('form-1', {
      originalname: 'x.html',
      mimetype: 'image/png',
      size: PNG_HEADER.length,
      buffer: PNG_HEADER,
    });

    expect(result.relativePath.endsWith('.png')).toBe(true);
    expect(result.relativePath).not.toContain('.html');
  });
});
