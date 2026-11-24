import {
  BadRequestException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { FORM_DOWNLOAD_MAX_BYTES, type FormDownloadFile } from './form-download';
import { FormDownloadService } from './form-download.service';
import { FormsService } from './forms.service';

@ApiTags('forms')
@ApiBearerAuth('access-token')
@Controller('forms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FormDownloadController {
  constructor(
    private readonly formsService: FormsService,
    private readonly formDownloadService: FormDownloadService,
  ) {}

  @Post(':id/download-files')
  @RequirePermission('forms.edit')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Enviar o arquivo de um campo "Arquivo para baixar" (PDF, Word, Excel, ODT/ODS, JPG ou PNG, até 10 MB)',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: FORM_DOWNLOAD_MAX_BYTES, files: 1 } }),
  )
  async upload(
    @Param('id', ParseUUIDPipe) formId: string,
    @UploadedFile() file: { originalname: string; size: number; buffer: Buffer } | undefined,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormDownloadFile> {
    await this.formsService.assertCanEdit(formId, currentUser.sub);
    if (!file) throw new BadRequestException('Arquivo nao informado.');
    return this.formDownloadService.save(formId, file);
  }
}
