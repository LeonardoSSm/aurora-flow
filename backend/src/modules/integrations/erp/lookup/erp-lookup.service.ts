import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { ErpConnectorEntity } from '../../../../database/entities/erp-connector.entity';
import { ErpConnectorService } from '../erp-connector.service';
import { type ErpLookupDetails, toErpLookupDetails } from './erp-lookup.details';
import { ErpLookupBadRequestError, ErpLookupUnavailableError } from './erp-lookup.errors';
import type { ErpLookupMode } from './erp-lookup.settings';
import {
  ERP_TABLE_MAX_ROW_KEY,
  ERP_TABLE_MAX_ROWS,
  ERP_TABLE_MAX_TEXT,
  type ErpTableSourceColumnType,
} from './erp-table.settings';
import type { ErpCellValue, ErpTableRow } from './erp-table.snapshot';

export interface ErpLookupItem {
  value: string;
  label: string;
}

/** Tabela de uma lista do erp-lookup, no contrato do Tijuca (§5.1 do documento). */
export interface ErpTableDefinition {
  id: string;
  label: string;
  parameters: Array<{ name: string; type: 'text' | 'number'; required: boolean }>;
  columns: Array<{ key: string; label: string; type: ErpTableSourceColumnType }>;
  /** `null` = a API não declarou a chave de linha: a tabela não pode ser usada. */
  rowKey: string | null;
  maxRows: number;
}

export interface ErpLookupSource {
  id: string;
  label: string;
  modo: ErpLookupMode;
}

/** Quem preenche espera a lista aparecer enquanto digita: não adianta esperar mais que isso. */
const MAX_TIMEOUT_MS = 5000;
/** Lista curta (modo lista, sem texto) muda pouco: evita ir ao ERP a cada formulário aberto. */
const LIST_CACHE_TTL_MS = 5 * 60_000;
/** O envio confere cada código; reenvio logo em seguida (ex.: erro em outro campo) reaproveita. */
const RESOLVE_CACHE_TTL_MS = 60_000;
/** Quem escolheu o pedido pode trocar e voltar; a ficha muda pouco em meio minuto. */
const DETAILS_CACHE_TTL_MS = 30_000;
/** Só para o carregamento no formulário; o envio sempre consulta de novo (ver `queryTable`). */
const TABLE_CACHE_TTL_MS = 30_000;
const TABLE_CACHE_MAX_ROWS = 100;
const MAX_CACHE_ENTRIES = 500;
const MAX_LABEL_LENGTH = 500;

type CacheEntry = { expiresAt: number; value: unknown };

/**
 * Cliente da API erp-lookup. Cada campo "Lista do ERP" aponta para um Conector de ERP (URL +
 * token, cadastrados em Administração → ERP) e para uma lista ("fonte") dessa API.
 */
@Injectable()
export class ErpLookupService {
  private readonly logger = new Logger(ErpLookupService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(ErpConnectorEntity)
    private readonly connectorsRepo: Repository<ErpConnectorEntity>,
    private readonly erpConnectorService: ErpConnectorService,
  ) {}

  /** Para o construtor de formulário: só id e nome, nunca URL nem token. */
  async listActiveConnectors(): Promise<Array<{ id: string; name: string }>> {
    const connectors = await this.connectorsRepo.find({
      where: { isActive: true },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
    return connectors.map(({ id, name }) => ({ id, name }));
  }

  async listSources(connectorId: string): Promise<ErpLookupSource[]> {
    const data = await this.request(connectorId, '/fontes');
    if (!Array.isArray(data)) {
      throw new ErpLookupUnavailableError('resposta inesperada em /fontes');
    }
    return data
      .filter(
        (row): row is { id: string; label: string; modo: string } =>
          !!row &&
          typeof (row as Record<string, unknown>).id === 'string' &&
          typeof (row as Record<string, unknown>).label === 'string',
      )
      .map((row) => ({
        id: row.id,
        label: row.label,
        modo: row.modo === 'lista' ? 'lista' : 'pesquisa',
      }));
  }

  /** `q` vazio só faz sentido no modo lista — e é o único caso que vai para o cache. */
  async search(
    connectorId: string,
    fonte: string,
    q: string,
    limit?: number,
  ): Promise<ErpLookupItem[]> {
    const cacheKey = q ? null : `lista|${connectorId}|${fonte}|${limit ?? ''}`;
    const cached = cacheKey ? this.getCached<ErpLookupItem[]>(cacheKey) : undefined;
    if (cached) return cached;

    const data = await this.request(connectorId, `/fontes/${encodeURIComponent(fonte)}`, {
      q: q || undefined,
      limit,
    });
    const rawItems = (data as { items?: unknown } | null)?.items;
    if (!Array.isArray(rawItems)) {
      throw new ErpLookupUnavailableError(`resposta inesperada na lista "${fonte}"`);
    }
    const items = rawItems.map(toItem).filter((item): item is ErpLookupItem => item !== null);

    if (cacheKey) this.setCached(cacheKey, items, LIST_CACHE_TTL_MS);
    return items;
  }

  /** `null` quando o código não existe (ou saiu dos filtros da lista) no ERP. */
  async resolve(connectorId: string, fonte: string, value: string): Promise<ErpLookupItem | null> {
    const cacheKey = `item|${connectorId}|${fonte}|${value}`;
    const cached = this.getCached<ErpLookupItem | null>(cacheKey);
    if (cached !== undefined) return cached;

    const data = await this.request(
      connectorId,
      `/fontes/${encodeURIComponent(fonte)}/item`,
      { value },
      { nullOn404: (code) => code === 'ITEM_NAO_ENCONTRADO' },
    );
    const item = data === null ? null : toItem(data);
    if (data !== null && !item) {
      throw new ErpLookupUnavailableError(
        `resposta inesperada ao conferir item da lista "${fonte}"`,
      );
    }

    this.setCached(cacheKey, item, RESOLVE_CACHE_TTL_MS);
    return item;
  }

  /**
   * Ficha completa de um item. `null` quando o código não existe, quando a lista não tem ficha
   * (`SEM_DETALHES`) ou quando a API é anterior às fichas (404 sem `code`): o formulário só
   * não mostra a ficha. Lista inexistente continua sendo configuração errada → indisponível.
   */
  async details(
    connectorId: string,
    fonte: string,
    value: string,
  ): Promise<ErpLookupDetails | null> {
    const cacheKey = `detalhes|${connectorId}|${fonte}|${value}`;
    const cached = this.getCached<ErpLookupDetails | null>(cacheKey);
    if (cached !== undefined) return cached;

    const data = await this.request(
      connectorId,
      `/fontes/${encodeURIComponent(fonte)}/detalhes`,
      { value },
      { nullOn404: (code) => code !== 'LISTA_NAO_EXISTE' },
    );
    const details = data === null ? null : toErpLookupDetails(data);
    if (data !== null && !details) {
      throw new ErpLookupUnavailableError(`resposta inesperada na ficha da lista "${fonte}"`);
    }

    this.setCached(cacheKey, details, DETAILS_CACHE_TTL_MS);
    return details;
  }

  /** Tabelas que uma lista expõe (campo "Tabela dinâmica do ERP"), para o construtor. */
  async listTables(connectorId: string, fonte: string): Promise<ErpTableDefinition[]> {
    const data = await this.request(connectorId, `/fontes/${encodeURIComponent(fonte)}/tabelas`);
    if (!Array.isArray(data)) {
      throw new ErpLookupUnavailableError(`resposta inesperada nas tabelas da lista "${fonte}"`);
    }
    return data
      .map(toTableDefinition)
      .filter((table): table is ErpTableDefinition => table !== null);
  }

  /**
   * Linhas de uma tabela. `null` quando o registro pai (ex.: o pedido) não existe. Com
   * `useCache: false` vai sempre ao ERP — é o caso do envio, que precisa ver se algo mudou desde
   * que a tabela foi carregada no formulário.
   */
  async queryTable(
    connectorId: string,
    fonte: string,
    dataset: string,
    parameters: Record<string, string>,
    options: { useCache: boolean },
  ): Promise<ErpTableRow[] | null> {
    const sortedParams = Object.fromEntries(
      Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)),
    );
    const cacheKey = `tabela|${connectorId}|${fonte}|${dataset}|${JSON.stringify(sortedParams)}`;
    if (options.useCache) {
      const cached = this.getCached<ErpTableRow[] | null>(cacheKey);
      if (cached !== undefined) return cached;
    }

    const data = await this.request(
      connectorId,
      `/fontes/${encodeURIComponent(fonte)}/tabelas/${encodeURIComponent(dataset)}`,
      sortedParams,
      { nullOn404: (code) => code === 'ITEM_NAO_ENCONTRADO' },
    );
    const rows = data === null ? null : toTableRows(data);
    if (data !== null && !rows) {
      throw new ErpLookupUnavailableError(`resposta inesperada na tabela "${dataset}"`);
    }

    // Grava mesmo quando não usou: o próximo carregamento aproveita o que o envio acabou de ver.
    // Tabela grande não entra: o cache é compartilhado (500 entradas) e ficaria pesado.
    if (!rows || rows.length <= TABLE_CACHE_MAX_ROWS) {
      this.setCached(cacheKey, rows, TABLE_CACHE_TTL_MS);
    }
    return rows;
  }

  private async request(
    connectorId: string,
    path: string,
    params?: Record<string, string | number | undefined>,
    options: { nullOn404?: (code: unknown) => boolean } = {},
  ): Promise<unknown> {
    const connector = await this.connectorsRepo.findOne({ where: { id: connectorId } });
    if (!connector?.isActive) {
      throw this.unavailable(connectorId, path, 'conector inexistente ou inativo');
    }

    const url = `${connector.baseUrl.replace(/\/$/, '')}${path}`;
    let token: string;
    try {
      this.erpConnectorService.validateInternalUrl(url);
      token = await this.erpConnectorService.getValidToken(connector);
    } catch (err) {
      throw this.unavailable(connectorId, path, err instanceof Error ? err.message : String(err));
    }

    let response;
    try {
      response = await axios.get<unknown>(url, {
        params,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: Math.min(connector.timeoutMs || MAX_TIMEOUT_MS, MAX_TIMEOUT_MS),
        validateStatus: () => true,
      });
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      throw this.unavailable(connectorId, path, typeof code === 'string' ? code : 'falha de rede');
    }

    const body = response.data as { code?: unknown; message?: unknown } | null;
    if (response.status === 200) {
      return response.data;
    }
    if (response.status === 404 && options.nullOn404?.(body?.code)) {
      return null;
    }
    if (response.status === 400) {
      const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
      throw new ErpLookupBadRequestError(
        typeof message === 'string' ? message : 'Pesquisa inválida.',
      );
    }
    const code = typeof body?.code === 'string' ? ` ${body.code}` : '';
    throw this.unavailable(connectorId, path, `HTTP ${response.status}${code}`);
  }

  /** Loga o motivo real (sem o texto pesquisado) e devolve o erro genérico de indisponibilidade. */
  private unavailable(
    connectorId: string,
    path: string,
    motivo: string,
  ): ErpLookupUnavailableError {
    this.logger.warn({ connectorId, path, motivo }, 'Consulta à API erp-lookup falhou');
    return new ErpLookupUnavailableError(motivo);
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private setCached(key: string, value: unknown, ttlMs: number): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Map guarda a ordem de inserção: o primeiro é o mais antigo.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  }
}

const TABLE_COLUMN_TYPES: Record<string, ErpTableSourceColumnType> = {
  texto: 'text',
  numero: 'number',
  moeda: 'currency',
  data: 'date',
  booleano: 'boolean',
};

/** Contrato em português da API erp-lookup → contrato do Tijuca (§5.1 do documento). */
function toTableDefinition(raw: unknown): ErpTableDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const table = raw as Record<string, unknown>;
  if (typeof table.id !== 'string' || typeof table.label !== 'string') return null;
  const parameters = (Array.isArray(table.parametros) ? table.parametros : [])
    .filter(
      (p): p is { nome: string; tipo?: unknown; obrigatorio?: unknown } =>
        !!p && typeof (p as { nome?: unknown }).nome === 'string',
    )
    .map((p) => ({
      name: p.nome,
      type: p.tipo === 'numero' ? ('number' as const) : ('text' as const),
      required: p.obrigatorio === true,
    }));
  const columns = (Array.isArray(table.colunas) ? table.colunas : [])
    .filter(
      (c): c is { chave: string; label?: unknown; tipo?: unknown } =>
        !!c && typeof (c as { chave?: unknown }).chave === 'string',
    )
    .map((c) => ({
      key: c.chave,
      label: typeof c.label === 'string' ? c.label : c.chave,
      type: TABLE_COLUMN_TYPES[String(c.tipo)] ?? 'text',
    }));
  return {
    id: table.id,
    label: table.label,
    parameters,
    columns,
    rowKey: typeof table.chaveLinha === 'string' ? table.chaveLinha : null,
    maxRows:
      typeof table.maxLinhas === 'number' && table.maxLinhas > 0
        ? Math.min(table.maxLinhas, ERP_TABLE_MAX_ROWS)
        : ERP_TABLE_MAX_ROWS,
  };
}

/** Só aceita o formato inteiro: chave texto não vazia e únicas, valores escalares. */
function toTableRows(raw: unknown): ErpTableRow[] | null {
  const linhas = (raw as { linhas?: unknown } | null)?.linhas;
  if (!Array.isArray(linhas) || linhas.length > ERP_TABLE_MAX_ROWS) return null;
  const seen = new Set<string>();
  const rows: ErpTableRow[] = [];
  for (const linha of linhas) {
    const { chave, valores } = (linha ?? {}) as { chave?: unknown; valores?: unknown };
    if (
      typeof chave !== 'string' ||
      !chave ||
      chave.length > ERP_TABLE_MAX_ROW_KEY ||
      seen.has(chave) ||
      !valores ||
      typeof valores !== 'object' ||
      Array.isArray(valores)
    ) {
      return null;
    }
    seen.add(chave);
    const values: Record<string, ErpCellValue> = {};
    for (const [key, value] of Object.entries(valores as Record<string, unknown>)) {
      if (
        value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        values[key] = value;
      } else if (typeof value === 'string') {
        values[key] = value.slice(0, ERP_TABLE_MAX_TEXT);
      }
    }
    rows.push({ key: chave, values });
  }
  return rows;
}

function toItem(raw: unknown): ErpLookupItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const { value, label } = raw as { value?: unknown; label?: unknown };
  if ((typeof value !== 'string' && typeof value !== 'number') || typeof label !== 'string') {
    return null;
  }
  return { value: String(value), label: label.slice(0, MAX_LABEL_LENGTH) };
}
