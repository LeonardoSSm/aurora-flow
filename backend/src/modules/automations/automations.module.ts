import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AutomationExecutionEntity,
  AutomationRuleEntity,
  NotificationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { AutomationsListener } from './automations.listener';
import { AutomationsService } from './automations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationRuleEntity,
      AutomationExecutionEntity,
      NotificationEntity,
      SubmissionEntity,
      SubmissionItemEntity,
    ]),
  ],
  controllers: [],
  providers: [AutomationsService, AutomationsListener],
  exports: [AutomationsService],
})
export class AutomationsModule {}
