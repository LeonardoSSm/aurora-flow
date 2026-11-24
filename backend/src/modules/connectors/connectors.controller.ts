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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProcessAccessService } from '../access/process-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { ConnectorsService } from './connectors.service';
import type { FormConnectorEntity } from '../../database/entities';

/**
 * Conectores são configuração do processo: toda rota pede "gerenciar fluxos, automações, conectores e
 * perguntas padrão" no processo do conector (pelo formulário da rota ou pelo do próprio conector).
 */
@ApiTags('connectors')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('flows.manage')
@Controller()
export class ConnectorsController {
  constructor(
    private readonly connectorsService: ConnectorsService,
    private readonly processAccess: ProcessAccessService,
  ) {}

  @Get('forms/:formId/connectors')
  @ApiOperation({ summary: 'Listar conectores de um formulário [ADMIN, MANAGER]' })
  async findByForm(
    @Param('formId') formId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormConnectorEntity[]> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'flows.manage');
    return this.connectorsService.findByForm(formId);
  }

  @Post('forms/:formId/connectors')
  @ApiOperation({ summary: 'Criar conector para um formulário [ADMIN, MANAGER]' })
  async create(
    @Param('formId') formId: string,
    @Body() dto: CreateConnectorDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormConnectorEntity> {
    await this.processAccess.assertFormAccess(formId, currentUser, 'flows.manage');
    return this.connectorsService.create(formId, dto);
  }

  @Patch('connectors/:id')
  @ApiOperation({ summary: 'Atualizar conector [ADMIN, MANAGER]' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectorDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<FormConnectorEntity> {
    await this.assertConnectorProcess(id, currentUser);
    return this.connectorsService.update(id, dto);
  }

  @Delete('connectors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover conector [ADMIN, MANAGER]' })
  async delete(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload): Promise<void> {
    await this.assertConnectorProcess(id, currentUser);
    await this.connectorsService.delete(id);
  }

  @Post('connectors/:id/test')
  @ApiOperation({ summary: 'Testar conector [ADMIN, MANAGER]' })
  async test(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    await this.assertConnectorProcess(id, currentUser);
    return this.connectorsService.testConnector(id);
  }

  private async assertConnectorProcess(id: string, actor: JwtPayload): Promise<void> {
    const formId = await this.connectorsService.findFormIdOrFail(id);
    await this.processAccess.assertFormAccess(formId, actor, 'flows.manage');
  }
}
