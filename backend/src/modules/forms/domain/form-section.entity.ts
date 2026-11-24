import type { FormField } from './form-field.entity';

export interface FormSectionProps {
  id: string;
  formVersionId: string;
  title: string;
  description: string | null;
  order: number;
  fields: FormField[];
}

export class FormSection {
  readonly id: string;
  readonly formVersionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly order: number;
  private readonly _fields: FormField[];

  constructor(props: FormSectionProps) {
    this.id = props.id;
    this.formVersionId = props.formVersionId;
    this.title = props.title;
    this.description = props.description;
    this.order = props.order;
    this._fields = props.fields;
  }

  get fields(): readonly FormField[] {
    return this._fields;
  }
}
