import { Injectable } from '@nestjs/common';
import { FormEntity, SubmissionEntity } from '../../../database/entities';
import { GoogleApiError } from '../types/google-workspace.types';
import { GoogleSheetsClientService } from './google-sheets-client.service';

@Injectable()
export class GoogleSheetsHeadersService {
  constructor(private readonly sheetsClient: GoogleSheetsClientService) {}

  async ensureSpreadsheetHeaders(
    form: FormEntity,
    accessToken: string,
    submission?: SubmissionEntity,
  ): Promise<string[]> {
    if (!form.googleSpreadsheetId) {
      throw new GoogleApiError('Planilha do Google Sheets ainda nao foi criada.', true);
    }

    const headerResponse = await this.sheetsClient.getValues(
      accessToken,
      form.googleSpreadsheetId,
      'A1:ZZ1',
    );

    const current = headerResponse.values?.[0] ?? [];
    const desired = this.buildHeaders(form, submission);
    const merged = this.mergeHeaders(current, desired);

    if (current.join('|') !== merged.join('|')) {
      await this.sheetsClient.updateValues(accessToken, form.googleSpreadsheetId, 'A1', [merged]);
    }

    return merged;
  }

  buildSheetRow(
    headers: string[],
    form: FormEntity,
    submission: SubmissionEntity,
  ): Array<string | number | boolean> {
    const byCode = new Map(
      submission.items.map((item) => [item.fieldCode, this.stringifyItemValue(item)]),
    );

    return headers.map((header) => {
      switch (header) {
        case 'submission_id':
          return submission.id;
        case 'form_id':
          return submission.formId;
        case 'form_name':
          return this.sanitize(form.name);
        case 'form_version_id':
          return submission.formVersionId;
        case 'submitted_at':
          return submission.submittedAt?.toISOString() ?? '';
        case 'responder_name':
          return this.sanitize(submission.responderName);
        case 'responder_email':
          return this.sanitize(submission.responderEmail);
        case 'status':
          return submission.status;
        default:
          return byCode.get(header) ?? '';
      }
    });
  }

  stringifyItemValue(item: SubmissionEntity['items'][number]): string | number | boolean {
    if (item.valueText !== null) return this.sanitize(item.valueText);
    if (item.valueNumber !== null) return item.valueNumber;
    if (item.valueBoolean !== null) return item.valueBoolean;
    if (item.valueJson !== null) return this.sanitize(JSON.stringify(item.valueJson));
    return '';
  }

  private buildHeaders(form: FormEntity, submission?: SubmissionEntity): string[] {
    const base = [
      'submission_id',
      'form_id',
      'form_name',
      'form_version_id',
      'submitted_at',
      'responder_name',
      'responder_email',
      'status',
    ];
    const seen = new Set(base);
    const extra: string[] = [];

    const versions = [...(form.versions ?? [])].sort((a, b) => a.versionNumber - b.versionNumber);
    for (const version of versions) {
      const sections = [...version.sections].sort((a, b) => a.order - b.order);
      for (const section of sections) {
        const fields = [...section.fields].sort((a, b) => a.order - b.order);
        for (const field of fields) {
          if (!seen.has(field.code)) {
            seen.add(field.code);
            extra.push(field.code);
          }
        }
      }
    }

    if (submission) {
      for (const item of submission.items) {
        if (!seen.has(item.fieldCode)) {
          seen.add(item.fieldCode);
          extra.push(item.fieldCode);
        }
      }
    }

    return [...base, ...extra];
  }

  private mergeHeaders(current: string[], desired: string[]): string[] {
    if (current.length === 0) return desired;
    const merged = [...current];
    const known = new Set(current);
    for (const h of desired) {
      if (!known.has(h)) {
        merged.push(h);
        known.add(h);
      }
    }
    return merged;
  }

  private sanitize(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  }
}
