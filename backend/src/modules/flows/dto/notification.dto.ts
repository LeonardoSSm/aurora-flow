import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MAX_TEMPLATE_LENGTH, MAX_TITLE_TEMPLATE_LENGTH } from '../../notifications/domain/notification.limits';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_MESSAGE_STATUSES,
  type NotificationChannelId,
  type NotificationMessageStatus,
} from '../../notifications/domain/notification.types';

export class PreviewNotificationDto {
  @IsIn(NOTIFICATION_CHANNELS as readonly string[])
  channel!: NotificationChannelId;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_TEMPLATE_LENGTH)
  title?: string;

  @IsString()
  @MaxLength(MAX_TEMPLATE_LENGTH)
  content!: string;

  /** Códigos dos campos do formulário do fluxo — passam a valer como variáveis conhecidas. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  fieldCodes?: string[];
}

export class QueryFlowNotificationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  executionId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value))
  @IsIn(NOTIFICATION_MESSAGE_STATUSES as readonly string[])
  status?: NotificationMessageStatus;
}
