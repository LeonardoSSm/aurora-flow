import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserEmailFieldService } from './user-email-field.service';
import type { SuggestedUser } from './user-email-suggestions';

/**
 * Sugestões de um campo "E-mail de usuário" enquanto o formulário é preenchido. Pública como o
 * resto do preenchimento; o serviço exige mínimo de letras e limita os resultados.
 */
@ApiTags('public')
@Controller('public/forms')
export class UserEmailPublicController {
  constructor(private readonly fields: UserEmailFieldService) {}

  @Get(':id/fields/:fieldCode/user-suggestions')
  // Cada pausa na digitação é uma busca, mas é rota anônima sobre usuários: folga menor que a do ERP.
  @Throttle({ default: { ttl: 60000, limit: 40 } })
  @ApiOperation({ summary: 'Pesquisar usuários sugeridos num campo "E-mail de usuário" (público)' })
  search(
    @Param('id', ParseUUIDPipe) formId: string,
    @Param('fieldCode') fieldCode: string,
    @Query('q') q?: string,
  ): Promise<{ users: SuggestedUser[] }> {
    return this.fields.searchField(formId, fieldCode, typeof q === 'string' ? q.slice(0, 120) : '');
  }
}
