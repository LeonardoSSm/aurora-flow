import { Injectable } from '@nestjs/common';
import {
  GoogleApiError,
  GoogleApiErrorPayload,
  SheetValuesResponse,
  SpreadsheetCreateResponse,
} from '../types/google-workspace.types';

@Injectable()
export class GoogleSheetsClientService {
  async createSpreadsheet(accessToken: string, title: string): Promise<SpreadsheetCreateResponse> {
    return this.request<SpreadsheetCreateResponse>(
      'https://sheets.googleapis.com/v4/spreadsheets',
      { method: 'POST', body: JSON.stringify({ properties: { title } }) },
      accessToken,
    );
  }

  async getValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
  ): Promise<SheetValuesResponse> {
    return this.request<SheetValuesResponse>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`,
      { method: 'GET', headers: {} },
      accessToken,
    );
  }

  async updateValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: unknown[][],
  ): Promise<void> {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values }) },
      accessToken,
    );
  }

  async appendValues(
    accessToken: string,
    spreadsheetId: string,
    values: unknown[][],
  ): Promise<void> {
    await this.appendValuesToSheet(accessToken, spreadsheetId, 'A1', values);
  }

  async appendValuesToSheet(
    accessToken: string,
    spreadsheetId: string,
    rangeOrSheet: string,
    values: unknown[][],
  ): Promise<void> {
    const range = encodeURIComponent(rangeOrSheet);
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values }) },
      accessToken,
    );
  }

  async request<T>(url: string, init: RequestInit, accessToken: string): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const bodyText = await response.text();
      let parsed: GoogleApiErrorPayload | null = null;
      try {
        parsed = JSON.parse(bodyText) as GoogleApiErrorPayload;
      } catch {
        parsed = null;
      }

      let message: string;
      if (parsed?.error?.message) {
        message = parsed.error.message;
      } else if (bodyText) {
        message = bodyText;
      } else {
        message = `Google API respondeu com status ${response.status}.`;
      }
      const retryable =
        response.status === 401 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      throw new GoogleApiError(message, retryable, response.status);
    }

    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }
}
