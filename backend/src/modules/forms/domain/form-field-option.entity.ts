export interface FormFieldOptionProps {
  id: string;
  fieldId: string;
  internalValue: string;
  displayLabel: string;
  order: number;
}

export class FormFieldOption {
  readonly id: string;
  readonly fieldId: string;
  readonly internalValue: string;
  readonly displayLabel: string;
  readonly order: number;

  constructor(props: FormFieldOptionProps) {
    this.id = props.id;
    this.fieldId = props.fieldId;
    this.internalValue = props.internalValue;
    this.displayLabel = props.displayLabel;
    this.order = props.order;
  }
}
