import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ResponseSubmittedEvent } from '../../common/events/response-events';
import { SolicitationsService } from './solicitations.service';

@Injectable()
export class SolicitationsListener {
  private readonly logger = new Logger(SolicitationsListener.name);

  constructor(private readonly solicitationsService: SolicitationsService) {}

  @OnEvent('responses.submitted')
  async handleResponseSubmitted(event: ResponseSubmittedEvent): Promise<void> {
    try {
      await this.solicitationsService.createFromSubmission(event.submissionId);
    } catch (error) {
      this.logger.error(
        `Failed to create solicitation for submission ${event.submissionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
