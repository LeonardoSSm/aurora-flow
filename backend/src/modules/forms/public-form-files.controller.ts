import {
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { FormsService } from './forms.service';
import { PublicFormFilesService } from './public-form-files.service';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

@ApiTags('public')
@Controller('public/forms')
export class PublicFormFilesController {
  constructor(
    private readonly configService: ConfigService,
    private readonly formsService: FormsService,
    private readonly publicFormFilesService: PublicFormFilesService,
  ) {}

  @Post(':id/uploads')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enviar arquivo para um formulario publico' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @Param('id') formId: string,
    @UploadedFile()
    file:
      | {
          originalname: string;
          mimetype: string;
          size: number;
          buffer: Buffer;
        }
      | undefined,
    @Req() request: Request,
  ): Promise<{ url: string; name: string; mimeType: string; size: number }> {
    await this.formsService.findPublicOne(formId);

    if (!file) {
      throw new BadRequestException('Arquivo nao informado.');
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo nao permitido.');
    }

    const storedFile = await this.publicFormFilesService.savePublicUpload(formId, file);
    const apiPrefix = this.configService.get<string>('API_PREFIX', 'api');
    const baseUrl = `${request.protocol}://${request.get('host')}`;

    return {
      url: `${baseUrl}/${apiPrefix}/v1/public/uploads/${storedFile.relativePath}`,
      name: storedFile.originalName,
      mimeType: storedFile.mimeType,
      size: storedFile.size,
    };
  }
}
