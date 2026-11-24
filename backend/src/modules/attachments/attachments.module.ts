import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AttachmentEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
} from '../../database/entities';
import { LabelValidatorModule } from '../integrations/label-validator/label-validator.module';
import { AttachmentsListener } from './attachments.listener';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttachmentEntity,
      KanbanPhaseFieldEntity,
      KanbanPhaseFieldValueEntity,
      SolicitationEntity,
    ]),
    LabelValidatorModule,
  ],
  controllers: [],
  providers: [AttachmentsService, AttachmentsListener],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
