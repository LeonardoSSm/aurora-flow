import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Response } from 'express';
import type { ReadStream } from 'fs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AttachmentEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { maxUploadBytesFromEnv } from '../storage/storage.service';
import {
  ATTACHMENT_DESCRIPTION_MAX,
  ATTACHMENT_NAME_MAX,
  AttachmentsService,
} from './attachments.service';

/** Nome e descrição que acompanham o arquivo no multipart (campos de texto do mesmo envio). */
class AttachmentLabelDto {
  @IsOptional()
  @IsString()
  @MaxLength(ATTACHMENT_NAME_MAX)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ATTACHMENT_DESCRIPTION_MAX)
  description?: string;
}

class UploadAttachmentBodyDto extends AttachmentLabelDto {
  @IsOptional()
  @IsUUID()
  phaseId?: string;
}

class UpdateAttachmentBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(ATTACHMENT_NAME_MAX)
  name?: string;

  /** Texto vazio apaga a descrição. */
  @IsOptional()
  @IsString()
  @MaxLength(ATTACHMENT_DESCRIPTION_MAX)
  description?: string;
}

/**
 * Sem limite de tamanho por formulário: só o teto técnico do servidor (STORAGE_MAX_FILE_SIZE_MB,
 * padrão 100 MB), o mesmo que o StorageService confere.
 */
const MAX_FILE_SIZE_BYTES = maxUploadBytesFromEnv();

const streamLogger = new Logger('AttachmentDownload');

/**
 * `createReadStream` só falha de forma assíncrona (evento 'error' no stream, não uma
 * exceção que o Nest capturaria) — sem isso, um arquivo ausente no disco (ex.: upload
 * perdido num recreate de container sem volume persistente) deixava a requisição
 * pendurada até o proxy na frente desistir e devolver 502, em vez de um 404 limpo.
 */
function pipeOrNotFound(stream: ReadStream, res: Response, attachment: AttachmentEntity): void {
  stream.once('error', (error) => {
    streamLogger.error(`Falha ao ler o arquivo do anexo ${attachment.id}: ${error.message}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(404).json({ message: 'Arquivo do anexo não encontrado no armazenamento.' });
  });
  stream.pipe(res);
}

// ── Authenticated endpoints ───────────────────────────────────────────────────
// Toda rota confere o processo do anexo: o card (quem vê a solicitação, ou foi chamado a aprovar algo
// nela) ou, no anexo de resposta sem card, as respostas do formulário. Antes bastava estar logado.

@ApiTags('attachments')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Post('solicitations/:id/attachments')
  @RequirePermission('attachments.upload')
  @ApiOperation({ summary: 'Upload de anexo para uma solicitação' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async uploadToSolicitation(
    @Param('id') solicitationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadAttachmentBodyDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AttachmentEntity> {
    await this.processAccess.assertSolicitationAccess(solicitationId, currentUser, 'attachments.upload');
    return this.attachmentsService.upload(file, {
      solicitationId,
      isPublic: false,
      uploadedByUserId: currentUser.sub,
      phaseId: body.phaseId ?? null,
      name: body?.name,
      description: body?.description,
    });
  }

  @Get('solicitations/:id/attachments')
  @ApiOperation({ summary: 'Listar anexos de uma solicitação' })
  async findBySolicitation(
    @Param('id') solicitationId: string,
    @Query('phaseId') phaseId: string | undefined,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AttachmentEntity[]> {
    await this.processAccess.assertSolicitationReadable(solicitationId, currentUser);
    // Quem foi chamado a aprovar vê todos os anexos do card: é o que está avaliando (e o download
    // de cada um já é liberado a ele). Excluir continua exigindo "anexos de todos".
    const seesAll =
      (await this.processAccess.canOnSolicitation(solicitationId, currentUser, 'attachments.manage_all')) ||
      (await this.processAccess.isApproverOfSolicitation(solicitationId, currentUser));
    return this.attachmentsService.findBySolicitation(
      solicitationId,
      seesAll,
      currentUser.sub,
      phaseId,
    );
  }

  /** Arquivos enviados junto com uma resposta de formulário (tela de Respostas). */
  @Get('submissions/:submissionId/attachments')
  @RequirePermission('responses.view')
  @ApiOperation({ summary: 'Listar anexos de uma resposta de formulário' })
  async findBySubmission(
    @Param('submissionId') submissionId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AttachmentEntity[]> {
    await this.processAccess.assertSubmissionAccess(submissionId, currentUser, 'responses.view');
    return this.attachmentsService.findBySubmission(submissionId);
  }

  @Get('attachments/:id/download')
  @ApiOperation({ summary: 'Baixar um anexo (autenticado)' })
  async download(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, attachment } = await this.attachmentsService.download(id, {
      isPublicRoute: false,
      authorize: (found) => this.processAccess.assertAttachmentReadable(found, currentUser),
    });
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    pipeOrNotFound(stream, res, attachment);
  }

  @Patch('attachments/:id')
  @RequirePermission('attachments.upload')
  @ApiOperation({ summary: 'Renomear ou descrever um anexo' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateAttachmentBodyDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<AttachmentEntity> {
    return this.attachmentsService.update(id, body, currentUser.sub, async (found) => {
      await this.processAccess.assertAttachmentReadable(found, currentUser);
      return found.solicitationId
        ? this.processAccess.canOnSolicitation(found.solicitationId, currentUser, 'attachments.manage_all')
        : false;
    });
  }

  @Delete('attachments/:id')
  @RequirePermission('attachments.upload')
  @ApiOperation({ summary: 'Excluir um anexo' })
  delete(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<void> {
    return this.attachmentsService.delete(id, currentUser.sub, async (found) => {
      await this.processAccess.assertAttachmentReadable(found, currentUser);
      return found.solicitationId
        ? this.processAccess.canOnSolicitation(found.solicitationId, currentUser, 'attachments.manage_all')
        : false;
    });
  }
}

// ── Public endpoints ──────────────────────────────────────────────────────────

@ApiTags('attachments-public')
@Controller('public')
export class PublicAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('submissions/:submissionId/attachments')
  // Sem limite de quantidade de arquivos no formulário: o navegador manda um por requisição, logo
  // depois do envio. 10/min derrubava o 11º arquivo de uma mesma resposta com 429.
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  @ApiOperation({ summary: 'Upload de anexo para submissão pública (sem autenticação)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  uploadToSubmission(
    @Param('submissionId') submissionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: AttachmentLabelDto,
  ): Promise<AttachmentEntity> {
    return this.attachmentsService.upload(file, {
      submissionId,
      isPublic: true,
      uploadedByUserId: null,
      name: body?.name,
      description: body?.description,
    });
  }

  @Get('attachments/:id/download')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Download público de anexo (apenas isPublic=true)' })
  async download(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, attachment } = await this.attachmentsService.download(id, {
      isPublicRoute: true,
    });
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    pipeOrNotFound(stream, res, attachment);
  }
}
