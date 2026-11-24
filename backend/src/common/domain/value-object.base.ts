export abstract class ValueObject<T> {
  protected abstract readonly value: T;

  equals(other: ValueObject<T>): boolean {
    if (other?.constructor !== this.constructor) return false;
    return JSON.stringify(this.value) === JSON.stringify((other as this).value);
  }

  abstract toString(): string;
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
