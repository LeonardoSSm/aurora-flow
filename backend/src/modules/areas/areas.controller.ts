import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AreasService } from './areas.service';
import type { AreaEntity } from '../../database/entities/area.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@ApiTags('areas')
@Controller('areas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('areas.manage')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string): Promise<AreaEntity[]> {
    return this.areasService.findAll(includeInactive === 'true');
  }

  /**
   * Id e nome das áreas ativas, para quem configura fases do Kanban escolher quem vê cada fase sem
   * precisar da permissão de administrar áreas. Declarado antes de ':id'.
   */
  @Get('options')
  @RequirePermission('kanban_phases.manage')
  async findOptions(): Promise<Array<{ id: string; name: string }>> {
    const areas = await this.areasService.findAll(false);
    return areas.map((area) => ({ id: area.id, name: area.name }));
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AreaEntity> {
    return this.areasService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAreaDto): Promise<AreaEntity> {
    return this.areasService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAreaDto): Promise<AreaEntity> {
    return this.areasService.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<AreaEntity> {
    return this.areasService.deactivate(id);
  }
}
