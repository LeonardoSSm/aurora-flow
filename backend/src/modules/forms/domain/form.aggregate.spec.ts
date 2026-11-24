import { FormStatus } from '../../../common/enums/form-status.enum';
import { FormFieldType } from '../../../common/enums/form-field-type.enum';
import { FormPublishError } from './errors/form-publish.error';
import { FieldCode } from './value-objects/field-code.vo';
import type { FormProps } from './form.aggregate';
import { Form } from './form.aggregate';
import { FormVersion } from './form-version.entity';
import { FormSection } from './form-section.entity';
import { FormField } from './form-field.entity';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeField(code: string, type: FormFieldType = FormFieldType.SHORT_TEXT): FormField {
  return new FormField({
    id: `field-${code}`,
    formVersionId: 'ver-1',
    sectionId: 'sec-1',
    code,
    label: code,
    fieldType: type,
    order: 1,
    required: false,
    settingsJson: {},
    conditionsJson: {},
    options: [],
  });
}

function makeSection(fields: FormField[]): FormSection {
  return new FormSection({
    id: 'sec-1',
    formVersionId: 'ver-1',
    title: 'Section',
    description: null,
    order: 1,
    fields,
  });
}

function makeVersion(
  versionNumber: number,
  fields: FormField[] = [makeField('name')],
  isPublished = false,
): FormVersion {
  return new FormVersion({
    id: `ver-${versionNumber}`,
    formId: 'form-1',
    versionNumber,
    titleDisplay: 'Form',
    descriptionDisplay: null,
    isPublished,
    publishedAt: isPublished ? new Date() : null,
    settingsJson: {},
    sections: [makeSection(fields)],
    createdAt: new Date(),
  });
}

function makeForm(
  overrides: Partial<FormProps> = {},
  versions: FormVersion[] = [makeVersion(1)],
): Form {
  return new Form({
    id: 'form-1',
    name: 'My Form',
    description: null,
    status: FormStatus.DRAFT,
    category: null,
    area: null,
    createdBy: 'user-1',
    assignedUserIds: [],
    googleSheetsEnabled: false,
    googleSheetsAutoCreate: false,
    googleSpreadsheetId: null,
    googleSpreadsheetUrl: null,
    googleSheetTitle: null,
    googleLinkedUserId: null,
    googleLastSyncedAt: null,
    googleLastError: null,
    versions,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// ── publishLatestVersion ──────────────────────────────────────────────────

describe('Form.publishLatestVersion', () => {
  it('sets status to PUBLISHED and marks latest version as published', () => {
    const v1 = makeVersion(1, [makeField('f1')], true);
    const v2 = makeVersion(2, [makeField('f2')]);
    const form = makeForm({ status: FormStatus.DRAFT }, [v1, v2]);

    form.publishLatestVersion();

    const published = form.versions.find((v) => v.versionNumber === 2);
    expect(form.status).toBe(FormStatus.PUBLISHED);
    expect(published?.isPublished).toBe(true);
    expect(published?.publishedAt).not.toBeNull();
  });

  it('unpublishes all other versions when publishing the latest', () => {
    const v1 = makeVersion(1, [makeField('f1')], true);
    const v2 = makeVersion(2, [makeField('f2')]);
    const form = makeForm({ status: FormStatus.DRAFT }, [v1, v2]);

    form.publishLatestVersion();

    const prev = form.versions.find((v) => v.versionNumber === 1);
    expect(prev?.isPublished).toBe(false);
    expect(prev?.publishedAt).toBeNull();
  });

  it('throws FormPublishError when there are no versions', () => {
    const form = makeForm({}, []);
    expect(() => form.publishLatestVersion()).toThrow(FormPublishError);
  });

  it('throws FormPublishError when latest version has no answerable fields', () => {
    const decorativeOnly = makeVersion(1, [makeField('t', FormFieldType.TITLE)]);
    const form = makeForm({}, [decorativeOnly]);
    expect(() => form.publishLatestVersion()).toThrow(FormPublishError);
  });

  it('throws FormPublishError when status transition is not allowed', () => {
    const form = makeForm({ status: FormStatus.ARCHIVED }, [makeVersion(1)]);
    expect(() => form.publishLatestVersion()).toThrow(FormPublishError);
  });

  it('works from PAUSED status (re-publish)', () => {
    const form = makeForm({ status: FormStatus.PAUSED }, [makeVersion(1)]);
    form.publishLatestVersion();
    expect(form.status).toBe(FormStatus.PUBLISHED);
  });
});

// ── archive ───────────────────────────────────────────────────────────────

describe('Form.archive', () => {
  it('changes status to ARCHIVED', () => {
    const form = makeForm({ status: FormStatus.DRAFT });
    form.archive();
    expect(form.status).toBe(FormStatus.ARCHIVED);
  });

  it('throws FormPublishError if already ARCHIVED', () => {
    const form = makeForm({ status: FormStatus.ARCHIVED });
    expect(() => form.archive()).toThrow(FormPublishError);
  });

  it('allows archive from PUBLISHED status', () => {
    const form = makeForm({ status: FormStatus.PUBLISHED });
    form.archive();
    expect(form.status).toBe(FormStatus.ARCHIVED);
  });
});

// ── duplicate ─────────────────────────────────────────────────────────────

describe('Form.duplicate', () => {
  it('returns a new Form with a different id', () => {
    const form = makeForm();
    const copy = form.duplicate('new-id', 'actor-2', null);
    expect(copy.id).toBe('new-id');
    expect(copy.id).not.toBe(form.id);
  });

  it('sets status to DRAFT regardless of original status', () => {
    const form = makeForm({ status: FormStatus.PUBLISHED });
    const copy = form.duplicate('new-id', 'actor-2', null);
    expect(copy.status).toBe(FormStatus.DRAFT);
  });

  it('sets createdBy to the actorId', () => {
    const form = makeForm({ createdBy: 'original-user' });
    const copy = form.duplicate('new-id', 'new-actor', null);
    expect(copy.createdBy).toBe('new-actor');
  });

  it('appends "(copia)" to the name', () => {
    const form = makeForm({ name: 'My Form' });
    const copy = form.duplicate('new-id', 'actor-2', null);
    expect(copy.name).toBe('My Form (copia)');
  });

  it('clears spreadsheet data', () => {
    const form = makeForm({
      googleSpreadsheetId: 'sheet-123',
      googleSpreadsheetUrl: 'https://...',
    });
    const copy = form.duplicate('new-id', 'actor-2', null);
    expect(copy.googleSpreadsheetId).toBeNull();
    expect(copy.googleSpreadsheetUrl).toBeNull();
  });

  it('prefers actorGoogleUserId over original googleLinkedUserId', () => {
    const form = makeForm({ googleLinkedUserId: 'original-google-user' });
    const copy = form.duplicate('new-id', 'actor-2', 'actor-google-user');
    expect(copy.googleLinkedUserId).toBe('actor-google-user');
  });

  it('falls back to original googleLinkedUserId when actor has no google account', () => {
    const form = makeForm({ googleLinkedUserId: 'original-google-user' });
    const copy = form.duplicate('new-id', 'actor-2', null);
    expect(copy.googleLinkedUserId).toBe('original-google-user');
  });
});

// ── FieldCode ─────────────────────────────────────────────────────────────

describe('FieldCode.create', () => {
  const valid = ['abc', 'a1', 'a_b', 'a'.repeat(119)];
  const invalid = ['', 'ABC', '1abc', '_abc', 'a b', 'a-b', 'a'.repeat(120)];

  for (const v of valid) {
    it(`accepts "${v.length > 20 ? v.slice(0, 10) + '...' : v}"`, () => {
      expect(() => FieldCode.create(v)).not.toThrow();
      expect(FieldCode.create(v).raw).toBe(v);
    });
  }

  for (const iv of invalid) {
    it(`rejects "${iv.length > 20 ? iv.slice(0, 10) + '...' : iv}"`, () => {
      expect(() => FieldCode.create(iv)).toThrow();
    });
  }
});

describe('FieldCode.fromLabel', () => {
  it('normalises accented characters', () => {
    expect(FieldCode.fromLabel('Ação').raw).toBe('acao');
  });

  it('converts spaces to underscores', () => {
    expect(FieldCode.fromLabel('first name').raw).toBe('first_name');
  });

  it('lowercases the result', () => {
    expect(FieldCode.fromLabel('MyField').raw).toBe('myfield');
  });

  it('strips leading non-letter characters', () => {
    expect(FieldCode.fromLabel('123abc').raw).toBe('abc');
  });
});
