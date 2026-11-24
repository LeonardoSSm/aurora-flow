import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { BancoIndisponivelError, BancoNaoConfiguradoError } from './db/mysql.service';

/**
 * Banco fora (ou não configurado) vira 503 com um `code` estável, que o backend do Tijuca
 * traduz no popup "banco do ERP fora do ar".
 */
@Catch(BancoIndisponivelError, BancoNaoConfiguradoError)
export class BancoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BancoExceptionFilter.name);

  catch(error: BancoIndisponivelError | BancoNaoConfiguradoError, host: ArgumentsHost): void {
    const naoConfigurado = error instanceof BancoNaoConfiguradoError;
    const code = naoConfigurado ? 'BANCO_NAO_CONFIGURADO' : 'BANCO_INDISPONIVEL';

    // Só o código do driver: a mensagem pode trazer trechos do SQL.
    this.logger.error(
      `${code}${naoConfigurado ? '' : ` (${(error as BancoIndisponivelError).codigo})`}`,
    );

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, code, message: error.message });
  }
}
