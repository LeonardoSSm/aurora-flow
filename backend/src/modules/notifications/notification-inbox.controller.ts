import {
  Controller,
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
import type { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { QueryInboxDto } from './dto/query-inbox.dto';
import { NotificationInboxService, type InboxItem } from './notification-inbox.service';

/** Caixa de entrada do usuário autenticado — qualquer perfil, sempre só as próprias notificações. */
@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications/inbox')
@UseGuards(JwtAuthGuard)
export class NotificationInboxController {
  constructor(private readonly inbox: NotificationInboxService) {}

  @Get()
  @ApiOperation({ summary: 'Listar minhas notificações internas (paginado)' })
  list(
    @Query() query: QueryInboxDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponseDto<InboxItem>> {
    return this.inbox.list(user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantidade de notificações internas não lidas' })
  unreadCount(@CurrentUser() user: JwtPayload): Promise<{ count: number }> {
    return this.inbox.unreadCount(user.sub);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar todas as minhas notificações como lidas' })
  markAllRead(@CurrentUser() user: JwtPayload): Promise<{ updated: number }> {
    return this.inbox.markAllRead(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar uma notificação como lida' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ read: true }> {
    return this.inbox.markRead(user.sub, id);
  }
}
