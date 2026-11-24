export type GoogleOAuthAction = 'login' | 'connect';

export type GoogleStatePayload = {
  action: GoogleOAuthAction;
  userId?: string;
  redirectPath?: string;
  exp: number;
};

export type GoogleTokenExchangeResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export type GoogleUserInfoResponse = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string;
};

export type GoogleOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  idToken: string | null;
};

export type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
};

export type SheetValuesResponse = {
  values?: string[][];
};

export type SpreadsheetCreateResponse = {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  properties?: {
    title?: string;
  };
};

export type GoogleConnectionState = 'configured' | 'connected' | 'disconnected';
export type FormGoogleSheetsState = 'not_configured' | GoogleConnectionState;

export type GoogleConnectionStatusResponse = {
  oauthConfigured: boolean;
  status: GoogleConnectionState;
  domain: string;
  linkedAccountEmail: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastUsedAt: string | null;
};

export type FormGoogleSheetsStatusResponse = {
  enabled: boolean;
  autoCreateOnSave: boolean;
  status: FormGoogleSheetsState;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  spreadsheetReady: boolean;
  linkedAccountEmail: string | null;
  sheetTitle: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  jobs: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  };
};

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}
