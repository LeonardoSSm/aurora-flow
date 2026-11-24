import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AreaEntity,
  AuditEventEntity,
  FlowEntity,
  FormVersionEntity,
  ItemListEntity,
  LopsAiSessionEntity,
  RoleEntity,
  UserEntity,
} from '../../database/entities';
import { AuditModule } from '../audit/audit.module';
import { FlowsModule } from '../flows/flows.module';
import { FormsModule } from '../forms/forms.module';
import { ErpLookupModule } from '../integrations/erp/lookup/erp-lookup.module';
import { KanbanPhasesModule } from '../kanban-phases/kanban-phases.module';
import { RolesModule } from '../roles/roles.module';
import { AiCatalogService } from './ai-catalog.service';
import { LopsAiAuthGuard } from './lops-ai-auth.guard';
import { LopsAiSessionService } from './lops-ai-session.service';
import { ProcessBuilderService } from './process-builder.service';

/**
 * Entrada da LOPS IA no Tijuca Flow (rotas /ai): sessão por e-mail do Workspace, catálogo do que
 * existe no sistema e criação de processo inteiro numa chamada. Ver Docs/ia_lops_integracao_api.md.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      AreaEntity,
      ItemListEntity,
      LopsAiSessionEntity,
      FlowEntity,
      FormVersionEntity,
      AuditEventEntity,
    ]),
    RolesModule,
    AuditModule,
    FormsModule,
    KanbanPhasesModule,
    FlowsModule,
    ErpLookupModule,
  ],
  controllers: [],
  providers: [LopsAiSessionService, LopsAiAuthGuard, AiCatalogService, ProcessBuilderService],
})
export class AiBuilderModule {}
