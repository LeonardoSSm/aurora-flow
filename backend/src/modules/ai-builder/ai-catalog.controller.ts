import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AiCatalogService } from './ai-catalog.service';
import { buildAiGuide } from './ai-guide';
import { PROCESS_BLUEPRINT_SCHEMA } from './blueprint/process-blueprint.schema';
import { LopsAiAuthGuard } from './lops-ai-auth.guard';

/** Manual, formato e catálogo do que existe no sistema — o contexto da LOPS IA para montar o processo. */
@Controller('ai')
@UseGuards(LopsAiAuthGuard, PermissionsGuard)
@RequirePermission('ai.copilot.use')
export class AiCatalogController {
  constructor(private readonly catalog: AiCatalogService) {}

  @Get('guide')
  guide(): Record<string, unknown> {
    return buildAiGuide();
  }

  @Get('schema/process')
  schema(): typeof PROCESS_BLUEPRINT_SCHEMA {
    return PROCESS_BLUEPRINT_SCHEMA;
  }

  @Get('catalog/roles')
  roles(): ReturnType<AiCatalogService['roles']> {
    return this.catalog.roles();
  }

  @Get('catalog/areas')
  areas(): ReturnType<AiCatalogService['areas']> {
    return this.catalog.areas();
  }

  @Get('catalog/users')
  users(@Query('search') search?: string): ReturnType<AiCatalogService['searchUsers']> {
    return this.catalog.searchUsers(search);
  }

  @Get('catalog/item-lists')
  itemLists(): ReturnType<AiCatalogService['itemLists']> {
    return this.catalog.itemLists();
  }

  @Get('catalog/erp')
  erp(): ReturnType<AiCatalogService['erp']> {
    return this.catalog.erp();
  }

  @Get('catalog/integrations')
  integrations(): ReturnType<AiCatalogService['integrations']> {
    return this.catalog.integrations();
  }
}
