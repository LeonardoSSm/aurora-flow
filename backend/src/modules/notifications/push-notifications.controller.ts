import { Body, Controller, Delete, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PushTokenEntity } from '../../database/entities/push-token.entity';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto/register-push-token.dto';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class PushNotificationsController {
  constructor(
    @InjectRepository(PushTokenEntity)
    private readonly pushTokenRepo: Repository<PushTokenEntity>,
  ) {}

  @Post('push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar ou atualizar token de push do dispositivo' })
  async register(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ registered: true }> {
    const existing = await this.pushTokenRepo.findOne({
      where: { userId: actor.sub, token: dto.token },
    });

    if (existing) {
      await this.pushTokenRepo.update(existing.id, {
        platform: dto.platform,
        deviceId: dto.deviceId ?? existing.deviceId,
        isActive: true,
        lastUsedAt: new Date(),
      });
    } else {
      await this.pushTokenRepo.save(
        this.pushTokenRepo.create({
          userId: actor.sub,
          token: dto.token,
          platform: dto.platform,
          deviceId: dto.deviceId ?? null,
          isActive: true,
          lastUsedAt: new Date(),
        }),
      );
    }

    return { registered: true };
  }

  @Delete('push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desregistrar token de push do dispositivo' })
  async unregister(
    @Body() dto: UnregisterPushTokenDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ unregistered: true }> {
    await this.pushTokenRepo.update(
      { userId: actor.sub, token: dto.token },
      { isActive: false },
    );
    return { unregistered: true };
  }
}
