import { ConflictException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';

/**
 * A API erp-lookup não respondeu como deveria: fora do ar, MySQL do ERP fora, timeout, token
 * recusado, conector inativo ou lista configurada errada. Para quem preenche o formulário é
 * tudo a mesma coisa — "o banco do ERP está fora" —; o motivo real vai para o log.
 */
export class ErpLookupUnavailableError extends Error {
  constructor(readonly motivo: string) {
    super(`ERP indisponível: ${motivo}`);
  }
}

/** A API erp-lookup recusou a pesquisa (400), ex.: texto curto demais. */
export class ErpLookupBadRequestError extends Error {}

export const ERP_INDISPONIVEL_CODE = 'ERP_INDISPONIVEL';

export const ERP_INDISPONIVEL_MESSAGE =
  'O banco de dados do ERP está fora do ar no momento. Suas respostas não foram perdidas: tente enviar novamente em alguns minutos.';

/** 503 com `code` estável: é o que a web e o app usam para abrir o popup de "banco fora". */
export function erpUnavailableException(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    code: ERP_INDISPONIVEL_CODE,
    message: ERP_INDISPONIVEL_MESSAGE,
  });
}

export const ERP_TABLE_DESATIVADO_CODE = 'ERP_TABLE_DESATIVADO';

/** `ERP_TABLE_ENABLED=false`: o campo "Tabela dinâmica do ERP" está desligado neste ambiente. */
export function erpTableDisabledException(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    code: ERP_TABLE_DESATIVADO_CODE,
    message:
      'A tabela de itens do ERP está desativada no momento. Tente novamente mais tarde ou fale com o responsável pelo formulário.',
  });
}

export const ERP_TABLE_CHANGED_CODE = 'ERP_TABLE_CHANGED';

/**
 * Os itens mudaram no ERP entre o carregamento e o envio. `fields` = códigos dos campos de
 * tabela afetados, para o formulário recarregar só esses.
 */
export function erpTableChangedException(fields: string[]): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: ERP_TABLE_CHANGED_CODE,
    message:
      'Os itens foram alterados no ERP. Atualize a tabela e confira os valores novamente.',
    fields,
  });
}
