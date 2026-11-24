import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FormEntity,
  FormMemberEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { CardFilterService } from './card-filter.service';
import { ProcessAccessService } from './process-access.service';
import { ProcessMembersService } from './process-members.service';

// @Global(), como RolesModule: toda rota de processo pergunta aqui, em qualquer módulo.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FormEntity,
      SolicitationEntity,
      SubmissionEntity,
      FormMemberEntity,
      UserEntity,
      KanbanPhaseEntity,
      KanbanPhaseFieldValueEntity,
    ]),
  ],
  controllers: [],
  providers: [ProcessAccessService, ProcessMembersService, CardFilterService],
  exports: [ProcessAccessService, CardFilterService],
})
export class AccessModule {}
