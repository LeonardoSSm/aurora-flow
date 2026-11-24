import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AppSettingEntity } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkUpdateSettingsDto } from './dto/bulk-update-settings.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Listar todas as configurações [ADMIN]' })
  findAll(): Promise<AppSettingEntity[]> {
    return this.settingsService.findAll(true);
  }

  @Get('public')
  @ApiOperation({ summary: 'Listar configurações públicas (sem autenticação)' })
  findPublic(): Promise<AppSettingEntity[]> {
    return this.settingsService.findAll(false);
  }

  @Get(':key')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Obter uma configuração por chave [ADMIN]' })
  findOne(@Param('key') key: string): Promise<AppSettingEntity> {
    return this.settingsService.findOne(key);
  }

  @Patch()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualizar várias configurações de uma vez [ADMIN]' })
  bulkUpdate(@Body() dto: BulkUpdateSettingsDto): Promise<AppSettingEntity[]> {
    return this.settingsService.bulkUpdate(dto.updates);
  }

  @Patch(':key')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualizar uma configuração por chave [ADMIN]' })
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto): Promise<AppSettingEntity> {
    return this.settingsService.update(key, dto.value);
  }
}
