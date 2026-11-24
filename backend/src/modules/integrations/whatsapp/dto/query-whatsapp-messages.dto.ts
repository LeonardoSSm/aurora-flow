import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { WhatsAppMessageStatus } from '../../../../database/entities/whatsapp-message.entity';

export class QueryWhatsAppMessagesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(WhatsAppMessageStatus)
  status?: WhatsAppMessageStatus;
}
