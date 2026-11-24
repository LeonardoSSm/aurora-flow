import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { WebhookDeliveryStatus } from '../../../database/entities/webhook-delivery.entity';

export class QueryWebhookDeliveriesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(WebhookDeliveryStatus)
  status?: WebhookDeliveryStatus;
}
