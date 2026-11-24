import { DomainError, ValueObject } from '../../../../common/domain/value-object.base';

export class InvalidFieldCodeError extends DomainError {
  constructor(raw: string) {
    super(`Invalid field code: "${raw}". Must match /^[a-z][a-z0-9_]{0,118}$/`);
  }
}

const REGEX = /^[a-z][a-z0-9_]{0,118}$/;

export class FieldCode extends ValueObject<string> {
  protected readonly value: string;

  private constructor(value: string) {
    super();
    this.value = value;
  }

  static create(raw: string): FieldCode {
    if (!REGEX.test(raw)) throw new InvalidFieldCodeError(raw);
    return new FieldCode(raw);
  }

  static fromLabel(label: string): FieldCode {
    const normalized = label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 119);
    if (!REGEX.test(normalized)) throw new InvalidFieldCodeError(label);
    return new FieldCode(normalized);
  }

  get raw(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
