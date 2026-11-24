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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SYSTEM_PERMISSION_CATALOG, type PermissionDefinition } from '../../common/constants/permission-catalog';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleDetailResponseDto, RoleResponseDto } from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Catálogo de permissões disponíveis no sistema [roles.manage]' })
  getPermissionCatalog(): PermissionDefinition[] {
    // O perfil só decide o que é da plataforma; o que é de processo está no vínculo de cada pessoa.
    return SYSTEM_PERMISSION_CATALOG;
  }

  @Get('roles')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Listar todos os perfis com contagem de usuários [roles.manage]' })
  findAll(): Promise<RoleResponseDto[]> {
    return this.rolesService.findAll();
  }

  // Sem @RequirePermission: lista leve (código + nome) usada por seletores de
  // papel em telas que não exigem roles.manage (ex.: config de fases do
  // Kanban, que só exige kanban_phases.manage). Precisa vir ANTES de
  // "roles/:code" para não ser capturada por esse param route.
  @Get('roles/options')
  @ApiOperation({ summary: 'Listar código e nome de todos os perfis (sem permissões)' })
  findAllOptions(): Promise<{ code: string; name: string }[]> {
    return this.rolesService.findAllOptions();
  }

  @Get('roles/:code')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Detalhe de um perfil com lista de usuários [roles.manage]' })
  findOne(@Param('code') code: string): Promise<RoleDetailResponseDto> {
    return this.rolesService.findOne(code);
  }

  @Post('roles')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Criar um novo perfil [roles.manage]' })
  create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.rolesService.create(dto);
  }

  @Patch('roles/:code')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Atualizar nome/descrição/cor de um perfil [roles.manage]' })
  update(@Param('code') code: string, @Body() dto: UpdateRoleDto): Promise<RoleResponseDto> {
    return this.rolesService.update(code, dto);
  }

  @Put('roles/:code/permissions')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Substituir a matriz de permissões de um perfil [roles.manage]' })
  updatePermissions(
    @Param('code') code: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.updatePermissions(code, dto.permissions);
  }

  @Delete('roles/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Excluir um perfil sem usuários atribuídos [roles.manage]' })
  remove(@Param('code') code: string): Promise<void> {
    return this.rolesService.remove(code);
  }

  @Patch('roles/:role/users/:userId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Alterar o perfil de um usuário [roles.manage]' })
  updateUserRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<UserResponseDto> {
    return this.rolesService.updateUserRole(userId, dto.newRole);
  }
}
