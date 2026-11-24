import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SaveItemListDto, SetItemListActiveDto } from './dto/save-item-list.dto';
import { ItemListsService, type ItemListDetail, type ItemListSummary } from './item-lists.service';

/**
 * Listas de itens reutilizáveis (opções de campos de seleção). Ler é livre para quem está logado;
 * criar e editar exige poder editar formulários.
 */
@ApiTags('item-lists')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('item-lists')
export class ItemListsController {
  constructor(private readonly service: ItemListsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar as listas de itens (arquivadas só com ?arquivadas=1)' })
  list(@Query('arquivadas') archived?: string): Promise<ItemListSummary[]> {
    return this.service.list(archived === '1' || archived === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lista de itens com os itens e onde está em uso' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ItemListDetail> {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission('item_lists.manage')
  @ApiOperation({ summary: 'Criar lista de itens' })
  create(@Body() dto: SaveItemListDto, @CurrentUser() user: JwtPayload): Promise<ItemListDetail> {
    return this.service.create(dto, user?.sub ?? null);
  }

  @Put(':id')
  @RequirePermission('item_lists.manage')
  @ApiOperation({
    summary: 'Salvar lista de itens (substitui os itens e atualiza os campos ligados a ela)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemListDto,
  ): Promise<ItemListDetail> {
    return this.service.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('item_lists.manage')
  @ApiOperation({ summary: 'Arquivar ou reativar a lista de itens' })
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetItemListActiveDto,
  ): Promise<ItemListDetail> {
    return this.service.setActive(id, dto.isActive);
  }
}
