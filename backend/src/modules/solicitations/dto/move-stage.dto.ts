import { IsIn } from 'class-validator';
import {
  DEFAULT_KANBAN_STAGES,
  type DefaultKanbanStage,
} from '../../kanban-phases/default-kanban-phases';

export class MoveStageDto {
  @IsIn(DEFAULT_KANBAN_STAGES)
  stage!: DefaultKanbanStage;
}
