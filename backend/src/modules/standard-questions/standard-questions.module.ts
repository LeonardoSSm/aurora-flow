import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormEntity, FormStandardQuestionEntity } from '../../database/entities';
import { StandardQuestionsService } from './standard-questions.service';

@Module({
  imports: [TypeOrmModule.forFeature([FormStandardQuestionEntity, FormEntity])],
  controllers: [],
  providers: [StandardQuestionsService],
  exports: [StandardQuestionsService],
})
export class StandardQuestionsModule {}
