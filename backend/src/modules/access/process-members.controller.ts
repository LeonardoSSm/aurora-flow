import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  type ProcessMemberView,
  ProcessMembersService,
  type UserProcessView,
} from './process-members.service';

class SetProcessMemberDto {
  /** { código: 'all' | 'own' } — só os códigos marcados; o que não vier fica desmarcado. */
  @IsObject()
  grants!: Record<string, string>;
}

@ApiTags('process-access')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ProcessMembersController {
  constructor(private readonly members: ProcessMembersService) {}

  @Get('process-access/catalog')
  @ApiOperation({ summary: 'Permissões possíveis num processo e os modelos prontos' })
  catalog(): ReturnType<ProcessMembersService['catalog']> {
    return this.members.catalog();
  }

  @Get('forms/:formId/members')
  @ApiOperation({ summary: 'Quem tem acesso ao processo e o que pode fazer nele' })
  list(
    @Param('formId', ParseUUIDPipe) formId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ProcessMemberView[]> {
    return this.members.listMembers(formId, currentUser);
  }

  @Put('forms/:formId/members/:userId')
  @ApiOperation({ summary: 'Dar acesso ao processo ou trocar as permissões de quem já tem' })
  set(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetProcessMemberDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<ProcessMemberView> {
    return this.members.setMember(formId, userId, dto.grants, currentUser);
  }

  @Delete('forms/:formId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tirar o acesso de uma pessoa ao processo' })
  async remove(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<void> {
    await this.members.removeMember(formId, userId, currentUser);
  }

  @Get('users/:userId/processes')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Processos de uma pessoa (vínculo e permissões em cada um)' })
  processesOfUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserProcessView[]> {
    return this.members.listProcessesOfUser(userId, currentUser);
  }
}
