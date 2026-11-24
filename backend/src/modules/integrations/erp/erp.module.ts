import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoModule } from '../../../common/crypto/crypto.module';
import { ErpConnectorEntity } from '../../../database/entities/erp-connector.entity';
import { ErpOperationLogEntity } from '../../../database/entities/erp-operation-log.entity';
import { ErpOperationTemplateEntity } from '../../../database/entities/erp-operation-template.entity';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import { SolicitationEntity } from '../../../database/entities/solicitation.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ErpAdminController } from './erp-admin.controller';
import { ErpAuthFailedListener } from './erp-auth-failed.listener';
import { ErpConnectorService } from './erp-connector.service';
import { ErpRetryConsumer } from './erp-retry.consumer';
import { ErpTokenRefreshService } from './erp-token-refresh.service';

@Module({
  imports: [
    CryptoModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      ErpConnectorEntity,
      ErpOperationTemplateEntity,
      ErpOperationLogEntity,
      SolicitationEntity,
      UserEntity,
      NotificationEntity,
    ]),
  ],
  controllers: [ErpAdminController],
  providers: [ErpConnectorService, ErpRetryConsumer, ErpAuthFailedListener, ErpTokenRefreshService],
  exports: [ErpConnectorService],
})
export class ErpModule {}
