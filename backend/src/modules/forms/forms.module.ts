import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormEntity, FormVersionEntity, UserEntity } from '../../database/entities';
import { GoogleWorkspaceModule } from '../google-workspace/google-workspace.module';
import { ErpLookupModule } from '../integrations/erp/lookup/erp-lookup.module';
import { ItemListsModule } from '../item-lists/item-lists.module';
import { UserEmailModule } from '../user-email/user-email.module';
import { FormDownloadService } from './form-download.service';
import { PublicFormFilesService } from './public-form-files.service';
import { FormsService } from './forms.service';
import { FormVersionWriter } from './form-version.writer';
import { FormListQuery } from './form-list.query';
import { PublicFormsService } from './public-forms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormEntity, FormVersionEntity, UserEntity]),
    GoogleWorkspaceModule,
    ErpLookupModule,
    ItemListsModule,
    UserEmailModule,
  ],
  controllers: [],
  providers: [
    FormsService,
    FormVersionWriter,
    FormListQuery,
    PublicFormsService,
    PublicFormFilesService,
    FormDownloadService,
  ],
  exports: [FormsService],
})
export class FormsModule {}
