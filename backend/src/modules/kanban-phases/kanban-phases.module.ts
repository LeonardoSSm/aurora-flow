import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FormEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  UserKanbanCardDisplayEntity,
} from '../../database/entities';
import { CardDisplayService } from './card-display.service';
import { KanbanPhasesService } from './kanban-phases.service';
import { ItemListsModule } from '../item-lists/item-lists.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KanbanPhaseEntity, KanbanPhaseFieldEntity, FormEntity, UserKanbanCardDisplayEntity]),
    ItemListsModule,
  ],
  controllers: [],
  providers: [KanbanPhasesService, CardDisplayService],
  exports: [KanbanPhasesService, CardDisplayService],
})
export class KanbanPhasesModule {}
