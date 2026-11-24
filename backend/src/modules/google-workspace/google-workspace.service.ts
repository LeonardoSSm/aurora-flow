import { Injectable } from '@nestjs/common';
import type { AuthTokens } from '../auth/auth.service';
import { GoogleConnectionService } from './connection/google-connection.service';
import { GoogleOAuthService } from './oauth/google-oauth.service';
import { GoogleSheetsSpreadsheetService } from './sync/google-sheets-spreadsheet.service';
import { GoogleSheetsSyncService } from './sync/google-sheets-sync.service';
import type {
  FormGoogleSheetsStatusResponse,
  GoogleConnectionStatusResponse,
} from './types/google-workspace.types';

@Injectable()
export class GoogleWorkspaceService {
  constructor(
    private readonly oauthService: GoogleOAuthService,
    private readonly connectionService: GoogleConnectionService,
    private readonly spreadsheetService: GoogleSheetsSpreadsheetService,
    private readonly syncService: GoogleSheetsSyncService,
  ) {}

  // ── OAuth ────────────────────────────────────────────────────────────────

  buildLoginUrl(): string {
    return this.oauthService.buildLoginUrl();
  }

  buildConnectUrl(userId: string, redirectPath?: string): Promise<string> {
    return this.oauthService.buildConnectUrl(userId, redirectPath);
  }

  buildFrontendErrorRedirect(path: string, message: string): string {
    return this.oauthService.buildFrontendErrorRedirect(path, message);
  }

  handleOAuthCallback(
    code: string,
    stateToken: string,
  ): Promise<{ redirectUrl: string; tokens?: AuthTokens }> {
    return this.oauthService.handleOAuthCallback(code, stateToken);
  }

  // ── Connection ───────────────────────────────────────────────────────────

  async isUserGoogleConnectedById(userId: string): Promise<boolean> {
    const connected = await this.connectionService.findConnectedGoogleUserId(userId);
    return connected !== null;
  }

  getUserConnectionStatus(userId: string): Promise<GoogleConnectionStatusResponse> {
    return this.connectionService.getUserConnectionStatus(userId);
  }

  disconnectUserConnection(userId: string): Promise<GoogleConnectionStatusResponse> {
    return this.connectionService.disconnectUserConnection(userId);
  }

  findConnectedGoogleUserId(userId: string): Promise<string | null> {
    return this.connectionService.findConnectedGoogleUserId(userId);
  }

  // ── Sheets setup ─────────────────────────────────────────────────────────

  createSpreadsheetForForm(
    formId: string,
    actorId: string,
  ): Promise<FormGoogleSheetsStatusResponse> {
    return this.spreadsheetService.createSpreadsheetForForm(formId, actorId);
  }

  autoCreateSpreadsheetIfNeeded(formId: string, actorId: string): Promise<void> {
    return this.spreadsheetService.autoCreateSpreadsheetIfNeeded(formId, actorId);
  }

  getFormGoogleSheetsStatus(formId: string): Promise<FormGoogleSheetsStatusResponse> {
    return this.spreadsheetService.getFormGoogleSheetsStatus(formId);
  }

  // ── Sheets ad-hoc append ────────────────────────────────────────────────

  appendRowToSpreadsheet(
    userId: string,
    spreadsheetId: string,
    sheetName: string,
    fieldValues: Array<{ fieldCode: string; value: string }>,
  ): Promise<void> {
    return this.spreadsheetService.appendRowToSpreadsheet(
      userId,
      spreadsheetId,
      sheetName,
      fieldValues,
    );
  }

  // ── Sync queue ───────────────────────────────────────────────────────────

  reenqueueFormSyncJobs(
    formId: string,
    actorId: string,
  ): Promise<{
    requeuedJobs: number;
    recoveredProcessingJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    return this.syncService.reenqueueFormSyncJobs(formId, actorId);
  }

  reprocessFormSubmissions(
    formId: string,
    actorId: string,
  ): Promise<{
    createdJobs: number;
    skippedExistingJobs: number;
    skippedCompletedJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    return this.syncService.reprocessFormSubmissions(formId, actorId);
  }

  ensureSubmissionSyncJob(submissionId: string): Promise<void> {
    return this.syncService.ensureSubmissionSyncJob(submissionId);
  }
}
