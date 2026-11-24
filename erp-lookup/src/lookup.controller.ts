import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TokenGuard } from './auth/token.guard';
import type {
  DefinicaoTabela,
  DetalhesItem,
  Fonte,
  ItemFonte,
  ModoFonte,
  ResultadoTabela,
} from './fontes/fonte.types';
import { FontesRegistry } from './fontes/fontes.registry';
import { TabelaInvalidaError } from './fontes/tabela';
import { MAX_CARACTERES, PesquisaQueryDto, ResolverQueryDto } from './lookup.dto';

export const MIN_CARACTERES_PESQUISA = 2;
export const LIMITE_PADRAO_PESQUISA = 20;
export const LIMITE_MAXIMO_PESQUISA = 50;
/** Modo lista devolve tudo de uma vez; este teto protege contra uma "lista curta" que cresceu. */
export const LIMITE_MAXIMO_LISTA = 500;

@Controller('fontes')
@UseGuards(TokenGuard)
export class LookupController {
  private readonly logger = new Logger(LookupController.name);

  constructor(private readonly registry: FontesRegistry) {}

  @Get()
  listar(): Array<{ id: string; label: string; modo: ModoFonte }> {
    return this.registry.listar().map(({ id, label, modo }) => ({ id, label, modo }));
  }

  @Get(':fonte')
  async pesquisar(
    @Param('fonte') id: string,
    @Query() query: PesquisaQueryDto,
  ): Promise<{ items: ItemFonte[] }> {
    const fonte = this.obter(id);
    const q = (query.q ?? '').trim();

    if (fonte.modo === 'pesquisa' && q.length < MIN_CARACTERES_PESQUISA) {
      throw new BadRequestException(`Digite pelo menos ${MIN_CARACTERES_PESQUISA} caracteres.`);
    }

    const maximo = fonte.modo === 'lista' ? LIMITE_MAXIMO_LISTA : LIMITE_MAXIMO_PESQUISA;
    const limit = Math.min(
      query.limit ?? (fonte.modo === 'lista' ? maximo : LIMITE_PADRAO_PESQUISA),
      maximo,
    );

    const inicio = Date.now();
    const items = await fonte.pesquisar(q, limit);
    // Sem o texto pesquisado no log: pode ser nome de cliente, documento etc.
    this.logger.log(`pesquisa fonte=${fonte.id} itens=${items.length} ${Date.now() - inicio}ms`);
    return { items };
  }

  @Get(':fonte/item')
  async resolver(@Param('fonte') id: string, @Query() query: ResolverQueryDto): Promise<ItemFonte> {
    const fonte = this.obter(id);
    const inicio = Date.now();
    const item = await fonte.resolver(query.value.trim());
    this.logger.log(
      `resolver fonte=${fonte.id} encontrado=${item !== null} ${Date.now() - inicio}ms`,
    );
    if (!item) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ITEM_NAO_ENCONTRADO',
        message: 'Item não encontrado nesta lista.',
      });
    }
    return item;
  }

  /**
   * Ficha completa de um item. `SEM_DETALHES` = a lista não tem ficha (o Tijuca só não mostra
   * nada); `ITEM_NAO_ENCONTRADO` = o código não existe.
   */
  @Get(':fonte/detalhes')
  async detalhar(
    @Param('fonte') id: string,
    @Query() query: ResolverQueryDto,
  ): Promise<DetalhesItem> {
    const fonte = this.obter(id);
    if (!fonte.detalhar) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'SEM_DETALHES',
        message: 'Esta lista não tem detalhes.',
      });
    }
    const inicio = Date.now();
    const detalhes = await fonte.detalhar(query.value.trim());
    this.logger.log(
      `detalhes fonte=${fonte.id} encontrado=${detalhes !== null} ${Date.now() - inicio}ms`,
    );
    if (!detalhes) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ITEM_NAO_ENCONTRADO',
        message: 'Item não encontrado nesta lista.',
      });
    }
    return detalhes;
  }

  /** Tabelas da fonte (campo "Tabela dinâmica do ERP"). Lista vazia = a fonte não tem tabelas. */
  @Get(':fonte/tabelas')
  listarTabelas(@Param('fonte') id: string): DefinicaoTabela[] {
    return this.obter(id).tabelas?.() ?? [];
  }

  /**
   * Linhas de uma tabela. Os parâmetros vêm na query string, um por parâmetro declarado; nada
   * além deles é aceito. `ITEM_NAO_ENCONTRADO` = o registro pai (ex.: o pedido) não existe.
   */
  @Get(':fonte/tabelas/:tabela')
  async consultarTabela(
    @Param('fonte') id: string,
    @Param('tabela') tabelaId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<ResultadoTabela> {
    const fonte = this.obter(id);
    const definicao = fonte.tabelas?.().find((tabela) => tabela.id === tabelaId);
    if (!definicao || !fonte.consultarTabela) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'TABELA_NAO_EXISTE',
        message: `Tabela "${tabelaId}" não existe nesta lista.`,
      });
    }
    const parametros = lerParametros(definicao, query);

    const inicio = Date.now();
    let resultado: ResultadoTabela | null;
    try {
      resultado = await fonte.consultarTabela(definicao.id, parametros);
    } catch (err) {
      if (err instanceof TabelaInvalidaError) {
        this.logger.error(`tabela fonte=${fonte.id} tabela=${definicao.id} ${err.message}`);
        throw new BadGatewayException({
          statusCode: 502,
          code: 'TABELA_INVALIDA',
          message: 'O ERP devolveu linhas sem chave válida.',
        });
      }
      throw err;
    }
    // Sem os parâmetros no log: número de pedido, código de cliente etc.
    this.logger.log(
      `tabela fonte=${fonte.id} tabela=${definicao.id} encontrado=${resultado !== null} linhas=${resultado?.linhas.length ?? 0} ${Date.now() - inicio}ms`,
    );
    if (!resultado) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ITEM_NAO_ENCONTRADO',
        message: 'Item não encontrado nesta lista.',
      });
    }
    return resultado;
  }

  /**
   * O `code` separa "a lista não existe" (configuração errada no Tijuca) de "o item não existe"
   * (resposta legítima do resolver): o backend trata os dois de forma diferente.
   */
  private obter(id: string): Fonte {
    const fonte = this.registry.obter(id);
    if (!fonte) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'LISTA_NAO_EXISTE',
        message: `Lista "${id}" não existe.`,
      });
    }
    return fonte;
  }
}

const NUMERO_PARAMETRO = /^-?\d{1,18}(\.\d{1,10})?$/;

/**
 * Query string → parâmetros da tabela: só os declarados, um valor cada, com até 100 caracteres;
 * obrigatório ausente e número mal formado são 400. Parâmetro desconhecido também é 400 (como o
 * `forbidNonWhitelisted` faz nas outras rotas).
 */
export function lerParametros(
  definicao: DefinicaoTabela,
  query: Record<string, unknown>,
): Record<string, string> {
  const declarados = new Map(definicao.parametros.map((p) => [p.nome, p]));
  const desconhecidos = Object.keys(query).filter((nome) => !declarados.has(nome));
  if (desconhecidos.length > 0) {
    throw new BadRequestException(`Parâmetro desconhecido: ${desconhecidos.join(', ')}.`);
  }

  const parametros: Record<string, string> = {};
  for (const parametro of definicao.parametros) {
    const bruto = query[parametro.nome];
    if (bruto !== undefined && typeof bruto !== 'string') {
      throw new BadRequestException(`Parâmetro "${parametro.nome}" deve ter um único valor.`);
    }
    const valor = (bruto ?? '').trim();
    if (!valor) {
      if (parametro.obrigatorio) {
        throw new BadRequestException(`Parâmetro "${parametro.nome}" é obrigatório.`);
      }
      continue;
    }
    if (valor.length > MAX_CARACTERES) {
      throw new BadRequestException(
        `Parâmetro "${parametro.nome}" deve ter até ${MAX_CARACTERES} caracteres.`,
      );
    }
    if (parametro.tipo === 'numero' && !NUMERO_PARAMETRO.test(valor)) {
      throw new BadRequestException(`Parâmetro "${parametro.nome}" deve ser um número.`);
    }
    parametros[parametro.nome] = valor;
  }
  return parametros;
}
