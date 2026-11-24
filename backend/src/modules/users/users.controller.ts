import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { UserEntity } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserInviteService, type UserInviteResult } from './invite/user-invite.service';
import { UsersService } from './users.service';

export type CreatedUserResponse = UserResponseDto & { invite?: UserInviteResult };

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userInviteService: UserInviteService,
  ) {}

  @Get('assignable')
  @ApiOperation({
    summary:
      'Listar usuarios ativos disponiveis para atribuicao, opcionalmente filtrados por quem detém uma permissão',
  })
  findAssignable(
    @Query('assignableAs') assignableAs?: string,
    @Query('formId', new ParseUUIDPipe({ optional: true })) formId?: string,
  ): Promise<Array<Pick<UserEntity, 'id' | 'fullName' | 'email' | 'role'>>> {
    return this.usersService.findAssignable(assignableAs, formId);
  }

  @Get()
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Listar usuários com paginação e filtros [ADMIN]' })
  findAll(@Query() query: QueryUsersDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Obter usuário por ID [ADMIN]' })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermission('users.manage')
  @ApiOperation({
    summary: 'Criar novo usuário [ADMIN]',
    description:
      'Com sendInvite (padrão), manda ao e-mail do usuário um link para criar a senha. O resultado do envio vem em `invite`; falha de envio não desfaz a criação.',
  })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CreatedUserResponse> {
    const user = await this.usersService.create(dto);
    if (dto.sendInvite === false) {
      return user;
    }
    const invite = await this.userInviteService.issueAndSend(user.id, {
      id: actor.sub,
      fullName: actor.fullName,
    });
    return { ...user, invite };
  }

  @Post(':id/invite')
  @RequirePermission('users.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar (ou reenviar) o convite por e-mail [ADMIN] — o link anterior deixa de valer',
  })
  resendInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<UserInviteResult> {
    return this.userInviteService.issueAndSend(id, { id: actor.sub, fullName: actor.fullName });
  }

  @Patch(':id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Atualizar dados de usuário [ADMIN]' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('users.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar usuário [ADMIN] — soft delete, não apaga dados' })
  async deactivate(@Param('id') id: string): Promise<void> {
    await this.usersService.deactivate(id);
  }
}
