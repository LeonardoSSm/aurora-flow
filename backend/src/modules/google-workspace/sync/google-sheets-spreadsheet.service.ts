import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleSheetsSyncJobStatus } from '../../../common/enums/google-sheets-sync-job-status.enum';
import { GoogleSheetCreatedEvent } from '../../../common/events/form-events';
import { FormEntity, GoogleSheetsSyncJobEntity } from '../../../database/entities';
import { GoogleConnectionService } from '../connection/google-connection.service';
import { GoogleSheetsClientService } from '../sheets/google-sheets-client.service';
import { GoogleSheetsHeadersService } from '../sheets/google-sheets-headers.service';
import { GoogleTokenService } from '../tokens/google-token.service';
import type {
  FormGoogleSheetsState,
  FormGoogleSheetsStatusResponse,
  SpreadsheetCreateResponse,
} from '../types/google-workspace.types';
import { GoogleApiError } from '../types/google-workspace.types';

@Injectable()
export class GoogleSheetsSpreadsheetService {
  constructor(
    private readonly connectionService: GoogleConnectionService,
    private readonly tokenService: GoogleTokenService,
    private readonly sheetsClient: GoogleSheetsClientService,
    private readonly headersService: GoogleSheetsHeadersService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(GoogleSheetsSyncJobEntity)
    private readonly syncJobsRepository: Repository<GoogleSheetsSyncJobEntity>,
  ) {}

  async createSpreadsheetForForm(
    formId: string,
    actorId: string,
  ): Promise<FormGoogleSheetsStatusResponse> {
    const form = await this.loadFormWithRelations(formId);

    if (!form.googleSheetsEnabled) {
      throw new BadRequestException(
        'Habilite a integracao com Google Sheets antes de criar a planilha.',
      );
    }

    if (form.googleSpreadsheetId && form.googleSpreadsheetUrl) {
      return this.buildStatus(form);
    }

    const linkedUser = await this.connectionService.resolveGoogleOperatorForForm(form, actorId);
    const accessToken = await this.tokenService.getValidAccessToken(linkedUser);
    const title = `${form.name} - Tijuca Flow`;

    try {
      const payload = await this.sheetsClient.createSpreadsheet(accessToken, title);

      if (!payload.spreadsheetId || !payload.spreadsheetUrl) {
        throw new GoogleApiError('Google nao retornou os dados da planilha criada.', true);
      }

      form.googleSpreadsheetId = payload.spreadsheetId;
      form.googleSpreadsheetUrl = payload.spreadsheetUrl;
      form.googleSheetTitle = (payload as SpreadsheetCreateResponse).properties?.title ?? title;
      form.googleLinkedUserId = linkedUser.id;
      form.googleLastError = null;
      await this.formsRepository.save(form);

      await this.headersService.ensureSpreadsheetHeaders(form, accessToken);
      await this.connectionService.touchGoogleUsage(linkedUser.id);

      const spreadsheetId = form.googleSpreadsheetId;
      if (!spreadsheetId) throw new Error('Spreadsheet ID not set after creation');
      this.eventEmitter.emit(
        'forms.google_sheet_created',
        new GoogleSheetCreatedEvent(actorId, form.id, spreadsheetId, linkedUser.googleAccountEmail),
      );
    } catch (error) {
      const message = toErrorMessage(error, 'Nao foi possivel criar a planilha do Google Sheets.');
      form.googleLastError = message;
      await this.formsRepository.save(form);
      throw error;
    }

    return this.getFormGoogleSheetsStatus(formId);
  }

  async autoCreateSpreadsheetIfNeeded(formId: string, actorId: string): Promise<void> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form?.googleSheetsEnabled || !form.googleSheetsAutoCreate || form.googleSpreadsheetId) {
      return;
    }

    try {
      await this.createSpreadsheetForForm(formId, actorId);
    } catch (error) {
      const message = toErrorMessage(
        error,
        'Nao foi possivel criar automaticamente a planilha do Google Sheets.',
      );
      await this.formsRepository.update({ id: formId }, { googleLastError: message });
    }
  }

  async getFormGoogleSheetsStatus(formId: string): Promise<FormGoogleSheetsStatusResponse> {
    const form = await this.formsRepository.findOne({
      where: { id: formId },
      relations: { googleLinkedUser: true },
    });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    return this.buildStatus(form);
  }

  async buildStatus(form: FormEntity): Promise<FormGoogleSheetsStatusResponse> {
    const jobs = await this.jobCounts(form.id);
    const linked = form.googleLinkedUser ?? null;

    let status: FormGoogleSheetsState = 'not_configured';
    if (form.googleSheetsEnabled) {
      status = linked
        ? this.connectionService.isUserGoogleConnected(linked)
          ? 'connected'
          : 'disconnected'
        : 'configured';
    }

    return {
      enabled: form.googleSheetsEnabled,
      autoCreateOnSave: form.googleSheetsAutoCreate,
      status,
      spreadsheetId: form.googleSpreadsheetId,
      spreadsheetUrl: form.googleSpreadsheetUrl,
      spreadsheetReady: Boolean(form.googleSpreadsheetId && form.googleSpreadsheetUrl),
      linkedAccountEmail: linked?.googleAccountEmail ?? null,
      sheetTitle: form.googleSheetTitle,
      lastSyncedAt: form.googleLastSyncedAt?.toISOString() ?? null,
      lastError: form.googleLastError,
      lastUsedAt: linked?.googleLastUsedAt?.toISOString() ?? null,
      jobs,
    };
  }

  private async jobCounts(formId: string): Promise<FormGoogleSheetsStatusResponse['jobs']> {
    const jobs = await this.syncJobsRepository.find({
      where: { formId },
      select: { id: true, status: true },
    });
    const c = { queued: 0, processing: 0, completed: 0, failed: 0, total: jobs.length };
    for (const j of jobs) {
      if (j.status === GoogleSheetsSyncJobStatus.QUEUED) c.queued += 1;
      if (j.status === GoogleSheetsSyncJobStatus.PROCESSING) c.processing += 1;
      if (j.status === GoogleSheetsSyncJobStatus.COMPLETED) c.completed += 1;
      if (j.status === GoogleSheetsSyncJobStatus.FAILED) c.failed += 1;
    }
    return c;
  }

  async appendRowToSpreadsheet(
    userId: string,
    spreadsheetId: string,
    sheetName: string,
    fieldValues: Array<{ fieldCode: string; value: string }>,
  ): Promise<void> {
    const user = await this.connectionService.findUserOrFail(userId);
    if (!this.connectionService.isUserGoogleConnected(user)) {
      throw new Error(
        'Google Sheets não configurado para este usuário. Conecte sua conta Google nas configurações.',
      );
    }
    const accessToken = await this.tokenService.getValidAccessToken(user);
    const range = sheetName ? `${sheetName}!A1` : 'A1';
    const row = fieldValues.map((fv) => fv.value);
    await this.sheetsClient.appendValuesToSheet(accessToken, spreadsheetId, range, [row]);
  }

  private async loadFormWithRelations(formId: string): Promise<FormEntity> {
    const form = await this.formsRepository.findOne({
      where: { id: formId },
      relations: {
        googleLinkedUser: true,
        versions: { sections: { fields: true } },
      },
      order: {
        versions: { versionNumber: 'ASC', sections: { order: 'ASC', fields: { order: 'ASC' } } },
      },
    });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    return form;
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}
