import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ResponseSubmittedEvent } from '../../common/events/response-events';
import { ConnectorsService } from './connectors.service';

@Injectable()
export class ConnectorsListener {
  private readonly logger = new Logger(ConnectorsListener.name);

  constructor(private readonly connectorsService: ConnectorsService) {}

  @OnEvent('responses.submitted')
  async handleResponseSubmitted(event: ResponseSubmittedEvent): Promise<void> {
    try {
      await this.connectorsService.executeForSubmission(event.submissionId, event.formId);
    } catch (err) {
      this.logger.error(
        `Connectors execution failed for submission ${event.submissionId}: ${String(err)}`,
      );
    }
  }
}
