import { FormStatus } from '../../../common/enums/form-status.enum';
import { FormPublishError } from './errors/form-publish.error';
import type { FormVersion } from './form-version.entity';

export interface FormProps {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  category: string | null;
  area: string | null;
  createdBy: string;
  assignedUserIds: string[];
  googleSheetsEnabled: boolean;
  googleSheetsAutoCreate: boolean;
  googleSpreadsheetId: string | null;
  googleSpreadsheetUrl: string | null;
  googleSheetTitle: string | null;
  googleLinkedUserId: string | null;
  googleLastSyncedAt: Date | null;
  googleLastError: string | null;
  versions: FormVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const ALLOWED_TRANSITIONS: Record<FormStatus, FormStatus[]> = {
  [FormStatus.DRAFT]: [FormStatus.PUBLISHED, FormStatus.ARCHIVED],
  [FormStatus.PUBLISHED]: [FormStatus.PAUSED, FormStatus.EXPIRED, FormStatus.ARCHIVED],
  [FormStatus.PAUSED]: [FormStatus.PUBLISHED, FormStatus.EXPIRED, FormStatus.ARCHIVED],
  [FormStatus.EXPIRED]: [FormStatus.DRAFT, FormStatus.ARCHIVED],
  [FormStatus.ARCHIVED]: [FormStatus.DRAFT],
};

export class Form {
  private _id: string;
  private _name: string;
  private _description: string | null;
  private _status: FormStatus;
  private _category: string | null;
  private _area: string | null;
  private _createdBy: string;
  private _assignedUserIds: string[];
  private _googleSheetsEnabled: boolean;
  private _googleSheetsAutoCreate: boolean;
  private _googleSpreadsheetId: string | null;
  private _googleSpreadsheetUrl: string | null;
  private _googleSheetTitle: string | null;
  private _googleLinkedUserId: string | null;
  private _googleLastSyncedAt: Date | null;
  private _googleLastError: string | null;
  private _versions: FormVersion[];
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: FormProps) {
    this._id = props.id;
    this._name = props.name;
    this._description = props.description;
    this._status = props.status;
    this._category = props.category;
    this._area = props.area;
    this._createdBy = props.createdBy;
    this._assignedUserIds = props.assignedUserIds;
    this._googleSheetsEnabled = props.googleSheetsEnabled;
    this._googleSheetsAutoCreate = props.googleSheetsAutoCreate;
    this._googleSpreadsheetId = props.googleSpreadsheetId;
    this._googleSpreadsheetUrl = props.googleSpreadsheetUrl;
    this._googleSheetTitle = props.googleSheetTitle;
    this._googleLinkedUserId = props.googleLinkedUserId;
    this._googleLastSyncedAt = props.googleLastSyncedAt;
    this._googleLastError = props.googleLastError;
    this._versions = props.versions;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get id(): string {
    return this._id;
  }
  get name(): string {
    return this._name;
  }
  get description(): string | null {
    return this._description;
  }
  get status(): FormStatus {
    return this._status;
  }
  get category(): string | null {
    return this._category;
  }
  get area(): string | null {
    return this._area;
  }
  get createdBy(): string {
    return this._createdBy;
  }
  get assignedUserIds(): string[] {
    return [...this._assignedUserIds];
  }
  get googleSheetsEnabled(): boolean {
    return this._googleSheetsEnabled;
  }
  get googleSheetsAutoCreate(): boolean {
    return this._googleSheetsAutoCreate;
  }
  get googleSpreadsheetId(): string | null {
    return this._googleSpreadsheetId;
  }
  get googleSpreadsheetUrl(): string | null {
    return this._googleSpreadsheetUrl;
  }
  get googleSheetTitle(): string | null {
    return this._googleSheetTitle;
  }
  get googleLinkedUserId(): string | null {
    return this._googleLinkedUserId;
  }
  get googleLastSyncedAt(): Date | null {
    return this._googleLastSyncedAt;
  }
  get googleLastError(): string | null {
    return this._googleLastError;
  }
  get versions(): readonly FormVersion[] {
    return this._versions;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  rename(name: string): void {
    this._name = name;
  }

  changeDescription(description: string | null): void {
    this._description = description;
  }

  publishLatestVersion(): void {
    const latest = this.latestVersion();

    if (!latest) {
      throw new FormPublishError('O formulário não possui nenhuma versão para publicar.');
    }

    if (latest.countAnswerableFields() === 0) {
      throw new FormPublishError(
        'O formulário precisa ter ao menos um campo respondível antes de ser publicado.',
      );
    }

    if (!ALLOWED_TRANSITIONS[this._status]?.includes(FormStatus.PUBLISHED)) {
      throw new FormPublishError(
        `Transição de status de '${this._status}' para 'published' não é permitida.`,
      );
    }

    for (const v of this._versions) {
      v.markUnpublished();
    }
    latest.markPublished();
    this._status = FormStatus.PUBLISHED;
  }

  archive(): void {
    if (this._status === FormStatus.ARCHIVED) {
      throw new FormPublishError('O formulário já está arquivado.');
    }
    this._status = FormStatus.ARCHIVED;
  }

  applyTransition(next: FormStatus): void {
    if (!ALLOWED_TRANSITIONS[this._status]?.includes(next)) {
      throw new FormPublishError(
        `Transição de status de '${this._status}' para '${next}' não é permitida.`,
      );
    }
    this._status = next;
  }

  duplicate(newId: string, actorId: string, actorGoogleUserId: string | null): Form {
    const source = this.latestVersion();
    return new Form({
      id: newId,
      name: `${this._name} (copia)`,
      description: this._description,
      status: FormStatus.DRAFT,
      category: this._category,
      area: this._area,
      createdBy: actorId,
      assignedUserIds: [...this._assignedUserIds],
      googleSheetsEnabled: this._googleSheetsEnabled,
      googleSheetsAutoCreate: this._googleSheetsAutoCreate,
      googleSpreadsheetId: null,
      googleSpreadsheetUrl: null,
      googleSheetTitle: null,
      googleLinkedUserId: actorGoogleUserId ?? this._googleLinkedUserId,
      googleLastSyncedAt: null,
      googleLastError: null,
      versions: source ? [source] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private latestVersion(): FormVersion | undefined {
    return [...this._versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }
}
