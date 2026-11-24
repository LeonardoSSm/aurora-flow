import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FormEntity,
  FormVersionEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormEntity, FormVersionEntity, SubmissionEntity, UserEntity]),
  ],
  controllers: [],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
