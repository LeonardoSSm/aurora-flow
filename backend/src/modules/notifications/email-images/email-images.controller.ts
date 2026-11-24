import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { readFile } from 'fs/promises';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { EMAIL_INLINE_IMAGES, emailAssetPath } from '../email-assets/email-inline-images';
import { EMAIL_IMAGE_MAX_BYTES, EmailImagesService, type EmailImageMeta } from './email-images.service';

/** Arte padrão do aviso de pontuação (a que vem com o sistema). */
const DEFAULT_SCORE_ALERT_BACKGROUND = EMAIL_INLINE_IMAGES['tijuca-fundo-57anos'];

/**
 * Imagens dos e-mails: enviar (arte geral na Administração ou a de um formulário) e ver (prévia na
 * tela). Ver só exige estar logado; enviar, editar formulários.
 */
@ApiTags('email-images')
@ApiBearerAuth('access-token')
@Controller('email-images')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmailImagesController {
  constructor(private readonly emailImages: EmailImagesService) {}

  @Post()
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Enviar uma imagem para os e-mails (JPG/PNG, até 3 MB)' })
  @ApiConsumes('multipart/form-data')
  // Um pouco acima do teto: o serviço é quem recusa, com a mensagem amigável.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: EMAIL_IMAGE_MAX_BYTES + 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<EmailImageMeta> {
    return this.emailImages.upload(file, currentUser.sub);
  }

  @Get('score-alert-background')
  @ApiOperation({ summary: 'Arte geral do aviso de pontuação (id; null = arte padrão)' })
  async scoreAlertBackground(): Promise<{ imageId: string | null }> {
    const id = await this.emailImages.scoreAlertBackgroundId();
    return { imageId: (await this.emailImages.exists(id)) ? id : null };
  }

  @Get('score-alert-background/default')
  @ApiOperation({ summary: 'Arte padrão do aviso de pontuação (a que vem com o sistema)' })
  async defaultScoreAlertBackground(@Res() res: Response): Promise<void> {
    const content = await readFile(emailAssetPath(DEFAULT_SCORE_ALERT_BACKGROUND.filename));
    res.setHeader('Content-Type', DEFAULT_SCORE_ALERT_BACKGROUND.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(content);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver uma imagem dos e-mails' })
  async show(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const image = await this.emailImages.getContent(id);
    if (!image) throw new NotFoundException('Imagem não encontrada.');
    res.setHeader('Content-Type', image.mimeType);
    // A imagem de um id nunca muda (trocar a arte = enviar outra).
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.send(image.content);
  }
}
