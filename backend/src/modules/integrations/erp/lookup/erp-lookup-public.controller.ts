import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../../../auth/guards/optional-jwt-auth.guard';
import type { JwtPayload } from '../../../auth/types/jwt-payload.type';
import { ErpLookupFieldService } from './erp-lookup-field.service';
import type { ErpLookupDetails } from './erp-lookup.details';
import type { ErpLookupItem } from './erp-lookup.service';
import { ErpLookupDetailsQueryDto, ErpLookupSearchQueryDto, ErpTableLoadDto } from './erp-lookup.dto';
import { type ErpTableLoadResponse, ErpTableFieldService } from './erp-table-field.service';

/**
 * Pesquisa de um campo "Lista do ERP" enquanto o formulário é preenchido. Pública como o resto
 * do preenchimento (/public/forms, /responses/submit); com `exigirLogin` no campo, só responde
 * a quem manda um token válido.
 */
@ApiTags('public')
@Controller('public/forms')
export class ErpLookupPublicController {
  constructor(
    private readonly fieldService: ErpLookupFieldService,
    private readonly tableFields: ErpTableFieldService,
  ) {}

  @Get(':id/fields/:fieldCode/lookup')
  // Mais folga que o resto do formulário público (30/min): cada pausa na digitação é uma busca.
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Pesquisar opções de um campo "Lista do ERP" (público)' })
  search(
    @Param('id', ParseUUIDPipe) formId: string,
    @Param('fieldCode') fieldCode: string,
    @Query() query: ErpLookupSearchQueryDto,
    @Req() req: { user?: JwtPayload | null },
  ): Promise<{ items: ErpLookupItem[] }> {
    return this.fieldService.searchField(formId, fieldCode, query.q ?? '', Boolean(req.user));
  }

  /**
   * Linhas de um campo "Tabela dinâmica do ERP". POST só para não pôr o número do pedido na
   * URL (logs de proxy); a consulta ao ERP é só leitura.
   */
  @Post(':id/fields/:fieldCode/erp-table/load')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Carregar as linhas de um campo "Tabela dinâmica do ERP" (público)' })
  loadTable(
    @Param('id', ParseUUIDPipe) formId: string,
    @Param('fieldCode') fieldCode: string,
    @Body() body: ErpTableLoadDto,
    @Req() req: { user?: JwtPayload | null },
  ): Promise<ErpTableLoadResponse> {
    return this.tableFields.loadField(formId, fieldCode, body.dependencies, Boolean(req.user));
  }

  @Get(':id/fields/:fieldCode/lookup/detalhes')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Ficha do item escolhido num campo "Lista do ERP" (público)' })
  details(
    @Param('id', ParseUUIDPipe) formId: string,
    @Param('fieldCode') fieldCode: string,
    @Query() query: ErpLookupDetailsQueryDto,
    @Req() req: { user?: JwtPayload | null },
  ): Promise<{ detalhes: ErpLookupDetails | null }> {
    return this.fieldService.detailsField(formId, fieldCode, query.value, Boolean(req.user));
  }
}
