import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  QueryRecordsDto,
  RecordReportRequestDto,
  SaveReportTemplateDto,
  UpdateReportTemplateDto,
} from './dto/query-records.dto';
import { RecordReportTemplatesService, type ReportTemplateView } from './record-report-templates.service';
import { type RecordsMeta, type RecordsPage, RecordsService } from './records.service';

/**
 * Tela Registros de um processo: os cards com as respostas, filtros e o relatório PDF montável.
 * O acesso ao processo é conferido no serviço (a rota não sabe de qual processo se trata).
 * A consulta é POST porque os filtros por resposta não cabem bem numa query string.
 */
@ApiTags('records')
@ApiBearerAuth('access-token')
@Controller('records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly templatesService: RecordReportTemplatesService,
  ) {}

  @Get('form/:formId/meta')
  @ApiOperation({ summary: 'Colunas, opções de filtro e permissões da tela Registros' })
  meta(
    @Param('formId', ParseUUIDPipe) formId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<RecordsMeta> {
    return this.recordsService.meta(formId, actor);
  }

  @Post('form/:formId/query')
  @HttpCode(200)
  @ApiOperation({ summary: 'Listar os registros do processo com busca, período e filtros por resposta' })
  query(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: QueryRecordsDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<RecordsPage> {
    return this.recordsService.query(formId, dto, actor);
  }

  @Post('form/:formId/report/pdf')
  @HttpCode(200)
  @RequirePermission('responses.export')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Gerar o relatório PDF montado na tela (filtros + colunas + layout)' })
  async reportPdf(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: RecordReportRequestDto,
    @CurrentUser() actor: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { report, ...filters } = dto;
    const { buffer, filename } = await this.recordsService.reportPdf(formId, filters, report, actor);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Post('form/:formId/report/csv')
  @HttpCode(200)
  @RequirePermission('responses.export')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Mesmas colunas e ordem do relatório, em CSV para planilha' })
  async reportCsv(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: RecordReportRequestDto,
    @CurrentUser() actor: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { report, ...filters } = dto;
    const { buffer, filename } = await this.recordsService.reportCsv(formId, filters, report, actor);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Get('form/:formId/report-templates')
  @ApiOperation({ summary: 'Modelos de relatório salvos no processo' })
  listTemplates(
    @Param('formId', ParseUUIDPipe) formId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ReportTemplateView[]> {
    return this.templatesService.list(formId, actor);
  }

  @Post('form/:formId/report-templates')
  @RequirePermission('responses.export')
  @ApiOperation({ summary: 'Salvar um modelo de relatório no processo' })
  createTemplate(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: SaveReportTemplateDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ReportTemplateView> {
    return this.templatesService.create(formId, dto, actor);
  }

  @Patch('report-templates/:id')
  @ApiOperation({ summary: 'Renomear ou trocar a montagem de um modelo' })
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportTemplateDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<ReportTemplateView> {
    return this.templatesService.update(id, dto, actor);
  }

  @Delete('report-templates/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Apagar um modelo de relatório' })
  async removeTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<void> {
    await this.templatesService.remove(id, actor);
  }
}
