import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import type { FormEntity } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { FormGoogleSheetsStatusResponse } from '../google-workspace/types/google-workspace.types';
import { CreateFormDto } from './dto/create-form.dto';
import type { FormListItemDto } from './dto/form-list-item.dto';
import { QueryFormsDto } from './dto/query-forms.dto';
import { UpdateFormStatusDto } from './dto/update-form-status.dto';
import { UpdateFormAppearanceDto } from './dto/update-form-appearance.dto';
import type { FormAppearance } from '../../database/entities/form.entity';
import { FormsService } from './forms.service';

@ApiTags('forms')
@ApiBearerAuth('access-token')
@Controller('forms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar formularios com paginacao e filtros' })
  findAll(
    @Query() query: QueryFormsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PaginatedResponseDto<FormListItemDto>> {
    return this.formsService.findAll(query, currentUser.sub);
  }

  // Antes de ':id', senão "classification-options" vira um id.
  @Get('classification-options')
  @ApiOperation({ summary: 'Categorias em uso e areas ativas, para as listas do Criador' })
  findClassificationOptions(): Promise<{ categories: string[]; areas: string[] }> {
    return this.formsService.findClassificationOptions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter formulario por ID' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<FormEntity> {
    return this.formsService.findOne(id, currentUser.sub);
  }

  @Get(':id/google-sheets')
  @ApiOperation({ summary: 'Obter status da integracao Google Sheets do formulario' })
  getGoogleSheetsStatus(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormGoogleSheetsStatusResponse> {
    return this.formsService.getGoogleSheetsStatus(id, currentUser.sub);
  }

  @Post()
  @RequirePermission('forms.create')
  @ApiOperation({ summary: 'Criar novo formulario [ADMIN, MANAGER, EDITOR]' })
  create(
    @Body() payload: CreateFormDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormEntity> {
    return this.formsService.create(payload, currentUser.sub);
  }

  @Patch(':id')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Atualizar formulario (cria nova versao) [ADMIN, MANAGER, EDITOR]' })
  update(
    @Param('id') id: string,
    @Body() payload: CreateFormDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormEntity> {
    return this.formsService.update(id, payload, currentUser.sub);
  }

  @Patch(':id/status')
  @RequirePermission('forms.publish')
  @ApiOperation({ summary: 'Alterar status do formulario [ADMIN, MANAGER, EDITOR]' })
  updateStatus(
    @Param('id') id: string,
    @Body() payload: UpdateFormStatusDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormEntity> {
    return this.formsService.updateStatus(id, payload, currentUser.sub);
  }

  @Patch(':id/appearance')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Alterar cor e icone do processo (sem criar versao)' })
  updateAppearance(
    @Param('id') id: string,
    @Body() payload: UpdateFormAppearanceDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormAppearance> {
    return this.formsService.updateAppearance(id, payload, currentUser.sub);
  }

  @Post(':id/duplicate')
  @RequirePermission('forms.create')
  @ApiOperation({ summary: 'Duplicar formulario como novo DRAFT [ADMIN, MANAGER, EDITOR]' })
  duplicate(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<FormEntity> {
    return this.formsService.duplicate(id, currentUser.sub);
  }

  @Post(':id/google-sheets/create')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Criar manualmente a planilha Google Sheets do formulario' })
  createGoogleSpreadsheet(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormGoogleSheetsStatusResponse> {
    return this.formsService.createGoogleSpreadsheet(id, currentUser.sub);
  }

  @Post(':id/google-sheets/reenqueue')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Reenfileirar jobs de sincronizacao do formulario' })
  reenqueueGoogleSheetsSync(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{
    requeuedJobs: number;
    recoveredProcessingJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    return this.formsService.reenqueueGoogleSheetsSync(id, currentUser.sub);
  }

  @Post(':id/google-sheets/reprocess')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Criar jobs faltantes para sincronizar respostas do formulario' })
  reprocessGoogleSheetsSync(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{
    createdJobs: number;
    skippedExistingJobs: number;
    skippedCompletedJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    return this.formsService.reprocessGoogleSheetsSync(id, currentUser.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('forms.publish')
  @ApiOperation({ summary: 'Arquivar formulario [ADMIN, MANAGER, EDITOR] - soft delete' })
  async softDelete(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<void> {
    await this.formsService.softDelete(id, currentUser.sub);
  }
}
