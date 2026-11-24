import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FormEntity,
  FormVersionEntity,
  SubmissionEntity,
  SubmissionItemEntity,
  SubmissionProgressEntity,
} from '../../database/entities';
import { AutomationsModule } from '../automations/automations.module';
import { GoogleWorkspaceModule } from '../google-workspace/google-workspace.module';
import { ErpLookupModule } from '../integrations/erp/lookup/erp-lookup.module';
import { ItemListsModule } from '../item-lists/item-lists.module';
import { UserEmailModule } from '../user-email/user-email.module';
import { FormSubmissionValidator } from './form-submission.validator';
import { PublicCaptchaService } from './public-captcha.service';
import { ResponsesService } from './responses.service';
import { SubmissionProgressService } from './submission-progress.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FormEntity,
      FormVersionEntity,
      SubmissionEntity,
      SubmissionItemEntity,
      SubmissionProgressEntity,
    ]),
    GoogleWorkspaceModule,
    AutomationsModule,
    ErpLookupModule,
    ItemListsModule,
    UserEmailModule,
  ],
  controllers: [],
  providers: [
    ResponsesService,
    FormSubmissionValidator,
    PublicCaptchaService,
    SubmissionProgressService,
  ],
})
export class ResponsesModule {}
