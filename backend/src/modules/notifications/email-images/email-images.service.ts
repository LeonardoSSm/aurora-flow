import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettingEntity, EmailImageEntity } from '../../../database/entities';

/** Configuração da arte geral do aviso de pontuação (id da imagem; vazio = arte padrão). */
export const SCORE_ALERT_BACKGROUND_SETTING = 'email.score_alert_background';

/** Teto por imagem: o e-mail carrega a arte inteira, então ela precisa continuar leve. */
export const EMAIL_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tipo pela assinatura dos bytes (não pelo que o navegador declarou). */
function sniffImageType(content: Buffer): 'image/jpeg' | 'image/png' | null {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  return null;
}

export type EmailImageMeta = Pick<EmailImageEntity, 'id' | 'name' | 'mimeType' | 'sizeBytes' | 'createdAt'>;

/** Imagens que os e-mails do sistema embutem por `cid:email-image-<id>` (ex.: arte de fundo trocada na tela). */
@Injectable()
export class EmailImagesService {
  constructor(
    @InjectRepository(EmailImageEntity)
    private readonly images: Repository<EmailImageEntity>,
    @InjectRepository(AppSettingEntity)
    private readonly settings: Repository<AppSettingEntity>,
  ) {}

  /** Só JPEG/PNG de verdade e até 3 MB. */
  async upload(file: Express.Multer.File | undefined, uploadedByUserId: string | null): Promise<EmailImageMeta> {
    if (!file?.buffer?.length) throw new BadRequestException('Envie uma imagem JPG ou PNG.');
    if (file.size > EMAIL_IMAGE_MAX_BYTES) {
      throw new BadRequestException('A imagem passa de 3 MB — reduza o tamanho (2000 px de largura já basta).');
    }
    const mimeType = sniffImageType(file.buffer);
    if (!mimeType) throw new BadRequestException('Envie uma imagem JPG ou PNG.');

    const saved = await this.images.save(
      this.images.create({
        // Nome vazio também cai em 'imagem' — por isso não é `??`.
        name: (file.originalname?.length > 0 ? file.originalname : 'imagem').slice(0, 255),
        mimeType,
        sizeBytes: file.buffer.length,
        content: file.buffer,
        uploadedByUserId,
      }),
    );
    return { id: saved.id, name: saved.name, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, createdAt: saved.createdAt };
  }

  /** Bytes e tipo da imagem, ou null (id inválido ou inexistente). */
  async getContent(id: string): Promise<{ content: Buffer; mimeType: string; name: string } | null> {
    if (!UUID.test(id)) return null;
    const image = await this.images
      .createQueryBuilder('image')
      .addSelect('image.content')
      .where('image.id = :id', { id })
      .getOne();
    return image ? { content: image.content, mimeType: image.mimeType, name: image.name } : null;
  }

  async exists(id: string | null | undefined): Promise<boolean> {
    if (!id || !UUID.test(id)) return false;
    return (await this.images.count({ where: { id } })) > 0;
  }

  /** Arte geral escolhida na Administração (id), ou null = arte padrão. */
  async scoreAlertBackgroundId(): Promise<string | null> {
    const setting = await this.settings.findOne({ where: { key: SCORE_ALERT_BACKGROUND_SETTING } });
    const id = setting?.value?.trim();
    return id && UUID.test(id) ? id : null;
  }
}
