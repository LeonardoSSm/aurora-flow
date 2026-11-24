import { DomainError } from '../../../common/domain/value-object.base';
import type { FormSection } from './form-section.entity';

export class MutatingPublishedVersionError extends DomainError {
  constructor() {
    super('Cannot mutate a published version.');
  }
}

export interface FormVersionProps {
  id: string;
  formId: string;
  versionNumber: number;
  titleDisplay: string;
  descriptionDisplay: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  settingsJson: Record<string, unknown>;
  sections: FormSection[];
  createdAt: Date;
}

export class FormVersion {
  readonly id: string;
  readonly formId: string;
  readonly versionNumber: number;
  readonly titleDisplay: string;
  readonly descriptionDisplay: string | null;
  private _isPublished: boolean;
  private _publishedAt: Date | null;
  readonly settingsJson: Record<string, unknown>;
  private readonly _sections: FormSection[];
  readonly createdAt: Date;

  constructor(props: FormVersionProps) {
    this.id = props.id;
    this.formId = props.formId;
    this.versionNumber = props.versionNumber;
    this.titleDisplay = props.titleDisplay;
    this.descriptionDisplay = props.descriptionDisplay;
    this._isPublished = props.isPublished;
    this._publishedAt = props.publishedAt;
    this.settingsJson = props.settingsJson;
    this._sections = props.sections;
    this.createdAt = props.createdAt;
  }

  get isPublished(): boolean {
    return this._isPublished;
  }

  get publishedAt(): Date | null {
    return this._publishedAt;
  }

  get sections(): readonly FormSection[] {
    return this._sections;
  }

  markPublished(): void {
    this._isPublished = true;
    this._publishedAt = new Date();
  }

  markUnpublished(): void {
    this._isPublished = false;
    this._publishedAt = null;
  }

  countAnswerableFields(): number {
    const DECORATIVE = new Set(['title', 'description', 'divider', 'file_download']);
    return this._sections.flatMap((s) => s.fields).filter((f) => !DECORATIVE.has(f.fieldType))
      .length;
  }

  structureHash(): string {
    const structure = this._sections.map((s) => ({
      title: s.title,
      fields: s.fields.map((f) => ({ code: f.code, type: f.fieldType })),
    }));
    return JSON.stringify(structure);
  }
}
