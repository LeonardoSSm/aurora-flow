import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { InboundWebhookEventStatus } from '../../../database/entities/inbound-webhook-event.entity';

export class QueryWebhookEventsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(InboundWebhookEventStatus)
  status?: InboundWebhookEventStatus;
}
