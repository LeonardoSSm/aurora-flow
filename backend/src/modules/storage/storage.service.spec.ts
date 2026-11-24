import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: Buffer.from('hello'),
    size: 5,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeService(overrides: Record<string, string> = {}): StorageService {
  const defaults: Record<string, string> = {
    STORAGE_LOCAL_PATH: './uploads',
    STORAGE_MAX_FILE_SIZE_MB: '10',
    STORAGE_ALLOWED_TYPES:
      'image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ...overrides,
  };

  const configService = {
    get: (key: string, fallback?: string) => defaults[key] ?? fallback,
  } as unknown as ConfigService;

  return new StorageService(configService);
}

describe('StorageService.validateFile', () => {
  it('rejects a disallowed MIME type', () => {
    const service = makeService();
    const file = makeFile({ mimetype: 'text/html' });
    expect(() => service.validateFile(file)).toThrow(BadRequestException);
    expect(() => service.validateFile(file)).toThrow("Tipo de arquivo 'text/html' não é permitido.");
  });

  it('rejects a file exceeding the size limit', () => {
    const service = makeService({ STORAGE_MAX_FILE_SIZE_MB: '1' });
    const file = makeFile({
      mimetype: 'application/pdf',
      size: 2 * 1024 * 1024, // 2 MB
    });
    expect(() => service.validateFile(file)).toThrow(BadRequestException);
    expect(() => service.validateFile(file)).toThrow('tamanho máximo');
  });

  it('accepts a valid file', () => {
    const service = makeService();
    const file = makeFile({ mimetype: 'image/jpeg', size: 1024 });
    expect(() => service.validateFile(file)).not.toThrow();
  });
});
