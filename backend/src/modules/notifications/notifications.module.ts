import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AppSettingEntity,
  EmailImageEntity,
  NotificationAttemptEntity,
  NotificationEntity,
  NotificationMessageEntity,
  NotificationRecipientEntity,
  UserEntity,
} from '../../database/entities';
import { PushTokenEntity } from '../../database/entities/push-token.entity';
import { FlowMailerService } from '../flows/mailer/flow-mailer.service';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { NOTIFICATION_CHANNELS_TOKEN } from './channels/notification-channel';
import { NotificationChannelRegistry } from './channels/notification-channel.registry';
import { WhatsAppChannel } from './channels/whatsapp.channel';
import { EmailImagesController } from './email-images/email-images.controller';
import { EmailImagesService } from './email-images/email-images.service';
import { ExpoPushService } from './expo-push.service';
import { UserNoticeService } from './user-notice.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationInboxController } from './notification-inbox.controller';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationWorkerService } from './notification-worker.service';
import { NotificationsService } from './notifications.service';
import { PushNotificationsController } from './push-notifications.controller';

/**
 * Módulo de notificações: push (Expo) para o app mobile — que já existia — e a caixa de saída de
 * notificações com canais plugáveis (`in_app`, `email`, `whatsapp`), despacho, retentativa e
 * caixa de entrada do usuário. Domínio genérico: não conhece o motor de fluxos (o nó
 * `action_notification` é que usa `NotificationsService`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushTokenEntity,
      NotificationEntity,
      NotificationMessageEntity,
      NotificationRecipientEntity,
      NotificationAttemptEntity,
      UserEntity,
      EmailImageEntity,
      AppSettingEntity,
    ]),
    WhatsAppModule,
  ],
  controllers: [PushNotificationsController, NotificationInboxController, EmailImagesController],
  providers: [
    ExpoPushService,
    EmailImagesService,
    // Mesma convenção dos demais módulos (ex.: SolicitationsModule): o mailer é listado onde é usado.
    FlowMailerService,
    InAppChannel,
    EmailChannel,
    WhatsAppChannel,
    {
      provide: NOTIFICATION_CHANNELS_TOKEN,
      useFactory: (inApp: InAppChannel, email: EmailChannel, whatsapp: WhatsAppChannel) => [
        inApp,
        email,
        whatsapp,
      ],
      inject: [InAppChannel, EmailChannel, WhatsAppChannel],
    },
    NotificationChannelRegistry,
    NotificationDispatcherService,
    NotificationsService,
    NotificationInboxService,
    NotificationWorkerService,
    UserNoticeService,
  ],
  exports: [
    ExpoPushService,
    UserNoticeService,
    NotificationsService,
    NotificationChannelRegistry,
    EmailImagesService,
  ],
})
export class NotificationsModule {}
