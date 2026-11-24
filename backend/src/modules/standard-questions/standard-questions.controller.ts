import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { FormStandardQuestionEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SaveStandardQuestionsDto } from './dto/save-standard-questions.dto';
import { StandardQuestionsService } from './standard-questions.service';

/** Ler pede enxergar o processo; gravar pede "gerenciar fluxos, automações..." naquele processo. */
@ApiTags('standard-questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/:formId/standard-questions')
export class StandardQuestionsController {
  constructor(
    private readonly standardQuestionsService: StandardQuestionsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar perguntas padrão configuradas para um formulário' })
  async findByForm(
    @Param('formId') formId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormStandardQuestionEntity[]> {
    await this.processAccess.assertProcessVisible(formId, currentUser);
    return this.standardQuestionsService.findByForm(formId);
  }

  @Put()
  @RequirePermission('flows.manage')
  @ApiOperation({ summary: 'Substituir a configuração de perguntas padrão de um formulário' })
  async save(
    @Param('formId') formId: string,
    @Body() dto: SaveStandardQuestionsDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormStandardQuestionEntity[]> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'flows.manage');
    return this.standardQuestionsService.save(formId, dto);
  }
}
