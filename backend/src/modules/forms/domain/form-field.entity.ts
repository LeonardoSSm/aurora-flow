import type { FormFieldType } from '../../../common/enums/form-field-type.enum';
import type { FormFieldOption } from './form-field-option.entity';

export interface FormFieldProps {
  id: string;
  formVersionId: string;
  sectionId: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  order: number;
  required: boolean;
  settingsJson: Record<string, unknown>;
  conditionsJson: Record<string, unknown>;
  options: FormFieldOption[];
}

export class FormField {
  readonly id: string;
  readonly formVersionId: string;
  readonly sectionId: string;
  readonly code: string;
  readonly label: string;
  readonly fieldType: FormFieldType;
  readonly order: number;
  readonly required: boolean;
  readonly settingsJson: Record<string, unknown>;
  readonly conditionsJson: Record<string, unknown>;
  private readonly _options: FormFieldOption[];

  constructor(props: FormFieldProps) {
    this.id = props.id;
    this.formVersionId = props.formVersionId;
    this.sectionId = props.sectionId;
    this.code = props.code;
    this.label = props.label;
    this.fieldType = props.fieldType;
    this.order = props.order;
    this.required = props.required;
    this.settingsJson = props.settingsJson;
    this.conditionsJson = props.conditionsJson;
    this._options = props.options;
  }

  get options(): readonly FormFieldOption[] {
    return this._options;
  }
}
