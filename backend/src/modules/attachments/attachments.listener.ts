import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { SolicitationCreatedEvent } from '../../common/events/solicitation-events';
import { AttachmentsService } from './attachments.service';

/**
 * Os arquivos do formulário público chegam num POST separado, depois do envio. Quando a
 * solicitação nasce depois deles, é aqui que eles passam a aparecer nela. O evento sai depois
 * do commit da solicitação, então um upload que não a encontrou já está gravado.
 */
@Injectable()
export class AttachmentsListener {
  private readonly logger = new Logger(AttachmentsListener.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  @OnEvent('solicitations.created')
  async handleSolicitationCreated(event: SolicitationCreatedEvent): Promise<void> {
    if (!event.submissionId) return;
    try {
      await this.attachmentsService.linkSubmissionAttachments(event.submissionId, event.solicitationId);
    } catch (error) {
      this.logger.error(
        `Failed to link attachments of submission ${event.submissionId} to solicitation ${event.solicitationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
