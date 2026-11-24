import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResponseSubmittedEvent } from '../../common/events/response-events';
import { AutomationsService } from './automations.service';

@Injectable()
export class AutomationsListener {
  private readonly logger = new Logger(AutomationsListener.name);

  constructor(private readonly automationsService: AutomationsService) {}

  @OnEvent('responses.submitted')
  async handleResponseSubmitted(event: ResponseSubmittedEvent): Promise<void> {
    try {
      await this.automationsService.executeRulesForSubmission(event.submissionId, event.formId);
    } catch (error) {
      this.logger.error(
        `Failed to process automations for submission ${event.submissionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
