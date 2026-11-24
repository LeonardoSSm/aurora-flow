import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FormEntity,
  FormFieldEntity,
  FormSectionEntity,
  FormVersionEntity,
  GoogleSheetsSyncJobEntity,
  SubmissionEntity,
  SubmissionItemEntity,
  UserEntity,
} from '../../database/entities';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { RefreshTokenModule } from '../auth/refresh-token.module';
import { GoogleAccessAdminController } from './connection/google-access-admin.controller';
import { GoogleAccessAuditService } from './connection/google-access-audit.service';
import { GoogleConnectionService } from './connection/google-connection.service';
import { GoogleWorkspaceController } from './google-workspace.controller';
import { GoogleWorkspaceService } from './google-workspace.service';
import { GoogleOAuthService } from './oauth/google-oauth.service';
import { GoogleProfileService } from './oauth/google-profile.service';
import { GoogleStateHelper } from './oauth/google-state.helper';
import { GoogleSheetsClientService } from './sheets/google-sheets-client.service';
import { GoogleSheetsHeadersService } from './sheets/google-sheets-headers.service';
import { GoogleSyncAdminController } from './sync/google-sync-admin.controller';
import { GoogleSyncCleanupService } from './sync/google-sync-cleanup.service';
import { GoogleSheetsSpreadsheetService } from './sync/google-sheets-spreadsheet.service';
import { GoogleSheetsSyncService } from './sync/google-sheets-sync.service';
import { GoogleTokenService } from './tokens/google-token.service';

@Module({
  imports: [
    ConfigModule,
    CryptoModule,
    RefreshTokenModule,
    TypeOrmModule.forFeature([
      UserEntity,
      FormEntity,
      FormVersionEntity,
      FormSectionEntity,
      FormFieldEntity,
      SubmissionEntity,
      SubmissionItemEntity,
      GoogleSheetsSyncJobEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
        },
      }),
    }),
  ],
  controllers: [GoogleWorkspaceController, GoogleSyncAdminController, GoogleAccessAdminController],
  providers: [
    GoogleWorkspaceService,
    GoogleStateHelper,
    GoogleProfileService,
    GoogleOAuthService,
    GoogleTokenService,
    GoogleSheetsClientService,
    GoogleSheetsHeadersService,
    GoogleConnectionService,
    GoogleAccessAuditService,
    GoogleSheetsSpreadsheetService,
    GoogleSheetsSyncService,
    GoogleSyncCleanupService,
  ],
  exports: [GoogleWorkspaceService],
})
export class GoogleWorkspaceModule {}
