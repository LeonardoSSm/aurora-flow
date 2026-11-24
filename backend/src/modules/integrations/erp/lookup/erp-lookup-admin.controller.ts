import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ErpTableTestDto } from './erp-lookup.dto';
import { erpUnavailableException, ErpLookupUnavailableError } from './erp-lookup.errors';
import {
  type ErpLookupSource,
  ErpLookupService,
  type ErpTableDefinition,
} from './erp-lookup.service';
import { ErpTableFieldService } from './erp-table-field.service';
import type { ErpTableRow } from './erp-table.snapshot';

const MAX_TEST_PARAMETERS = 20;
const MAX_TEST_PARAMETER_LENGTH = 100;

/**
 * Para o construtor de formulário configurar campos "Lista do ERP" e "Tabela dinâmica do ERP".
 * Exige `forms.edit`, não `integrations.manage`: quem monta formulário escolhe a lista, mas não
 * vê URL nem token.
 */
@ApiTags('erp-lookup')
@ApiBearerAuth('access-token')
@Controller('erp/lookup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ErpLookupAdminController {
  constructor(
    private readonly lookup: ErpLookupService,
    private readonly tableFields: ErpTableFieldService,
  ) {}

  /** O que está ligado neste ambiente — o construtor esconde o que não está. */
  @Get('features')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Recursos de ERP ligados neste ambiente (ex.: Tabela dinâmica)' })
  features(): { erpTable: boolean } {
    return { erpTable: this.tableFields.isEnabled() };
  }

  @Get('connectors')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Conectores de ERP ativos (id e nome) para campos "Lista do ERP"' })
  listConnectors(): Promise<Array<{ id: string; name: string }>> {
    return this.lookup.listActiveConnectors();
  }

  @Get('connectors/:id/fontes')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Listas disponíveis na API erp-lookup de um conector' })
  async listSources(@Param('id', ParseUUIDPipe) id: string): Promise<ErpLookupSource[]> {
    try {
      return await this.lookup.listSources(id);
    } catch (err) {
      if (err instanceof ErpLookupUnavailableError) throw erpUnavailableException();
      throw err;
    }
  }

  @Get('connectors/:id/fontes/:fonte/tabelas')
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Tabelas de uma lista, para campos "Tabela dinâmica do ERP"' })
  async listTables(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fonte') fonte: string,
  ): Promise<{ tables: ErpTableDefinition[] }> {
    return { tables: await this.tableFields.listTables(id, fonte) };
  }

  /** POST só para levar os parâmetros no corpo; a consulta ao ERP é só leitura. */
  @Post('connectors/:id/fontes/:fonte/tabelas/:tabela/teste')
  @HttpCode(200)
  @RequirePermission('forms.edit')
  @ApiOperation({ summary: 'Testar a consulta de uma tabela do ERP (primeiras 20 linhas)' })
  testTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fonte') fonte: string,
    @Param('tabela') tabela: string,
    @Body() body: ErpTableTestDto,
  ): Promise<{ found: boolean; totalRows: number; rows: ErpTableRow[] }> {
    return this.tableFields.testTable(id, fonte, tabela, readTestParameters(body.parametros));
  }
}

function readTestParameters(raw: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(raw);
  if (entries.length > MAX_TEST_PARAMETERS) {
    throw new BadRequestException('Parâmetros demais.');
  }
  const parameters: Record<string, string> = {};
  for (const [name, value] of entries) {
    const text =
      typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
    if (!text) continue;
    if (text.length > MAX_TEST_PARAMETER_LENGTH) {
      throw new BadRequestException(`Parâmetro "${name}" muito longo.`);
    }
    parameters[name] = text;
  }
  return parameters;
}
