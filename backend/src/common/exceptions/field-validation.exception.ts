import { HttpStatus, UnprocessableEntityException } from '@nestjs/common';

export type FieldErrorMap = Record<string, string>;

export class FieldValidationException extends UnprocessableEntityException {
  constructor(errors: FieldErrorMap, message = 'Erro de validacao') {
    super({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      errors,
    });
  }
}
