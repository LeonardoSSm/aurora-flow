import { BadRequestException } from '@nestjs/common';
import { EMAIL_IMAGE_MAX_BYTES, EmailImagesService, SCORE_ALERT_BACKGROUND_SETTING } from './email-images.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const ID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';

function file(buffer: Buffer, overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return { buffer, size: buffer.length, originalname: 'arte.jpg', mimetype: 'image/jpeg', ...overrides } as Express.Multer.File;
}

function makeService(options: { setting?: string | null; count?: number; image?: unknown } = {}) {
  const images = {
    create: jest.fn((data: object) => data),
    save: jest.fn(async (data: object) => ({ id: ID, createdAt: new Date('2026-10-22T00:00:00Z'), ...data })),
    count: jest.fn().mockResolvedValue(options.count ?? 0),
    createQueryBuilder: jest.fn(() => {
      const qb: { addSelect: jest.Mock; where: jest.Mock; getOne: jest.Mock } = {
        addSelect: jest.fn(),
        where: jest.fn(),
        getOne: jest.fn().mockResolvedValue(options.image ?? null),
      };
      qb.addSelect.mockReturnValue(qb);
      qb.where.mockReturnValue(qb);
      return qb;
    }),
  };
  const settings = {
    findOne: jest.fn().mockResolvedValue(options.setting === undefined ? null : { key: SCORE_ALERT_BACKGROUND_SETTING, value: options.setting }),
  };
  return { service: new EmailImagesService(images as never, settings as never), images, settings };
}

describe('EmailImagesService', () => {
  it('guarda JPEG e PNG de verdade, com o tipo tirado dos bytes (não do que o navegador disse)', async () => {
    const { service, images } = makeService();
    const meta = await service.upload(file(PNG, { originalname: 'arte.png', mimetype: 'image/jpeg' }), 'u1');
    expect(meta).toEqual(expect.objectContaining({ id: ID, name: 'arte.png', mimeType: 'image/png', sizeBytes: PNG.length }));
    expect(images.save).toHaveBeenCalledWith(expect.objectContaining({ content: PNG, uploadedByUserId: 'u1' }));
    expect((await service.upload(file(JPEG), null)).mimeType).toBe('image/jpeg');
  });

  it('recusa arquivo vazio, que não é imagem (mesmo dizendo que é) ou acima de 3 MB', async () => {
    const { service, images } = makeService();
    await expect(service.upload(undefined, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(file(Buffer.from('<svg/>'), { mimetype: 'image/png' }), 'u1')).rejects.toThrow('JPG ou PNG');
    const grande = Buffer.concat([JPEG, Buffer.alloc(EMAIL_IMAGE_MAX_BYTES)]);
    await expect(service.upload(file(grande), 'u1')).rejects.toThrow('3 MB');
    expect(images.save).not.toHaveBeenCalled();
  });

  it('arte geral: o id da configuração, ou null (vazia ou valor que não é id)', async () => {
    expect(await makeService({ setting: ID }).service.scoreAlertBackgroundId()).toBe(ID);
    expect(await makeService({ setting: '' }).service.scoreAlertBackgroundId()).toBeNull();
    expect(await makeService({ setting: 'qualquer coisa' }).service.scoreAlertBackgroundId()).toBeNull();
    expect(await makeService().service.scoreAlertBackgroundId()).toBeNull();
  });

  it('id que não é uuid nem consulta o banco', async () => {
    const { service, images } = makeService({ count: 1 });
    expect(await service.exists('nao-e-uuid')).toBe(false);
    expect(await service.getContent('nao-e-uuid')).toBeNull();
    expect(images.count).not.toHaveBeenCalled();
    expect(await service.exists(ID)).toBe(true);
  });

  it('getContent devolve os bytes (que ficam fora das consultas comuns)', async () => {
    const { service } = makeService({ image: { content: JPEG, mimeType: 'image/jpeg', name: 'arte.jpg' } });
    expect(await service.getContent(ID)).toEqual({ content: JPEG, mimeType: 'image/jpeg', name: 'arte.jpg' });
  });
});
