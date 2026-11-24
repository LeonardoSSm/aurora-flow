import { GoogleSheetsHeadersService } from './google-sheets-headers.service';
import type { FormEntity, SubmissionEntity } from '../../../database/entities';

function makeService(): GoogleSheetsHeadersService {
  return new GoogleSheetsHeadersService(null as never);
}

function makeForm(fieldCodes: string[]): FormEntity {
  return {
    name: 'Test Form',
    googleSpreadsheetId: 'sheet-1',
    versions: [
      {
        versionNumber: 1,
        sections: [
          {
            order: 0,
            fields: fieldCodes.map((code, i) => ({ code, order: i })),
          },
        ],
      },
    ],
  } as unknown as FormEntity;
}

function makeSubmission(
  items: Array<{
    fieldCode: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueBoolean?: boolean | null;
    valueJson?: Record<string, unknown> | null;
  }>,
): SubmissionEntity {
  return {
    id: 'sub-1',
    formId: 'form-1',
    formVersionId: 'ver-1',
    status: 'submitted',
    submittedAt: new Date('2024-06-01T10:00:00Z'),
    responderName: 'Alice',
    responderEmail: 'alice@example.com',
    items: items.map((it) => ({
      fieldCode: it.fieldCode,
      valueText: it.valueText ?? null,
      valueNumber: it.valueNumber ?? null,
      valueBoolean: it.valueBoolean ?? null,
      valueJson: it.valueJson ?? null,
    })),
  } as unknown as SubmissionEntity;
}

describe('GoogleSheetsHeadersService.buildSheetRow', () => {
  const svc = makeService();
  const BASE = [
    'submission_id',
    'form_id',
    'form_name',
    'form_version_id',
    'submitted_at',
    'responder_name',
    'responder_email',
    'status',
  ];

  it('maps base columns correctly for a 3-field form', () => {
    const form = makeForm(['field_a', 'field_b', 'field_c']);
    const headers = [...BASE, 'field_a', 'field_b', 'field_c'];
    const sub = makeSubmission([
      { fieldCode: 'field_a', valueText: 'hello' },
      { fieldCode: 'field_b', valueNumber: 42 },
      { fieldCode: 'field_c', valueBoolean: true },
    ]);

    const row = svc.buildSheetRow(headers, form, sub);

    expect(row[headers.indexOf('submission_id')]).toBe('sub-1');
    expect(row[headers.indexOf('form_name')]).toBe('Test Form');
    expect(row[headers.indexOf('submitted_at')]).toBe('2024-06-01T10:00:00.000Z');
    expect(row[headers.indexOf('responder_name')]).toBe('Alice');
    expect(row[headers.indexOf('field_a')]).toBe('hello');
    expect(row[headers.indexOf('field_b')]).toBe(42);
    expect(row[headers.indexOf('field_c')]).toBe(true);
  });

  it('returns empty string for headers whose field is absent from submission items', () => {
    const form = makeForm(['field_x', 'field_y', 'field_z']);
    const headers = [...BASE, 'field_x', 'field_y', 'field_z'];
    const sub = makeSubmission([{ fieldCode: 'field_x', valueText: 'present' }]);

    const row = svc.buildSheetRow(headers, form, sub);

    expect(row[headers.indexOf('field_x')]).toBe('present');
    expect(row[headers.indexOf('field_y')]).toBe('');
    expect(row[headers.indexOf('field_z')]).toBe('');
  });

  it('serialises valueJson as a JSON string', () => {
    const form = makeForm(['field_json']);
    const headers = [...BASE, 'field_json'];
    const sub = makeSubmission([{ fieldCode: 'field_json', valueJson: { key: 'val', n: 1 } }]);

    const row = svc.buildSheetRow(headers, form, sub);

    expect(row[headers.indexOf('field_json')]).toBe('{"key":"val","n":1}');
  });

  it('prefixes formula-injection characters with a single quote', () => {
    const form = makeForm(['evil']);
    const headers = [...BASE, 'evil'];
    const sub = makeSubmission([{ fieldCode: 'evil', valueText: '=SUM(A1:A10)' }]);

    const row = svc.buildSheetRow(headers, form, sub);

    expect(row[headers.indexOf('evil')]).toBe("'=SUM(A1:A10)");
  });

  it('returns empty string when submitted_at is null', () => {
    const form = makeForm([]);
    const headers = [...BASE];
    const sub = { ...makeSubmission([]), submittedAt: null } as unknown as SubmissionEntity;

    const row = svc.buildSheetRow(headers, form, sub);

    expect(row[headers.indexOf('submitted_at')]).toBe('');
  });
});

describe('GoogleSheetsHeadersService.stringifyItemValue', () => {
  const svc = makeService();

  const item = (overrides: object): never =>
    ({
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      valueJson: null,
      ...overrides,
    }) as never;

  it('returns sanitized valueText', () =>
    expect(svc.stringifyItemValue(item({ valueText: 'hi' }))).toBe('hi'));
  it('returns valueNumber as number', () =>
    expect(svc.stringifyItemValue(item({ valueNumber: 3.14 }))).toBe(3.14));
  it('returns valueBoolean as boolean', () =>
    expect(svc.stringifyItemValue(item({ valueBoolean: false }))).toBe(false));
  it('returns JSON string for valueJson', () =>
    expect(svc.stringifyItemValue(item({ valueJson: { x: 1 } }))).toBe('{"x":1}'));
  it('returns empty string when all null', () => expect(svc.stringifyItemValue(item({}))).toBe(''));
});
