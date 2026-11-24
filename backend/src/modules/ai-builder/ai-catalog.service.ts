import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AreaEntity, ItemListEntity, RoleEntity, UserEntity } from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { QueryFormsDto } from '../forms/dto/query-forms.dto';
import { FormsService } from '../forms/forms.service';
import { ErpLookupService } from '../integrations/erp/lookup/erp-lookup.service';

/**
 * O que existe no sistema, para a LOPS IA montar o processo com referências de verdade. Só
 * estrutura e cadastro — nunca respostas, solicitações ou dados de clientes.
 */
@Injectable()
export class AiCatalogService {
  private readonly logger = new Logger(AiCatalogService.name);

  constructor(
    private readonly formsService: FormsService,
    private readonly erpLookup: ErpLookupService,
    @InjectRepository(RoleEntity) private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(AreaEntity) private readonly areasRepository: Repository<AreaEntity>,
    @InjectRepository(UserEntity) private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(ItemListEntity) private readonly itemListsRepository: Repository<ItemListEntity>,
  ) {}

  async roles(): Promise<Array<{ code: string; name: string; description: string | null; activeUsers: number }>> {
    const roles = await this.rolesRepository.find({ order: { name: 'ASC' } });
    const counts: Array<{ role: string; total: string }> = await this.usersRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'total')
      .where('user.isActive = true')
      .groupBy('user.role')
      .getRawMany();
    const byRole = new Map(counts.map((row) => [row.role, Number(row.total)]));
    return roles.map((role) => ({
      code: role.code,
      name: role.name,
      description: role.description,
      activeUsers: byRole.get(role.code) ?? 0,
    }));
  }

  async areas(): Promise<Array<{ id: string; name: string }>> {
    const areas = await this.areasRepository.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return areas.map((area) => ({ id: area.id, name: area.name }));
  }

  /** Busca pontual (nome ou e-mail), no máximo 10 — nunca a lista inteira de pessoas. */
  async searchUsers(
    search: string | undefined,
  ): Promise<Array<{ name: string; email: string; role: string; area: string | null }>> {
    const term = (search ?? '').trim();
    if (term.length < 2) throw new BadRequestException('Informe ao menos 2 letras do nome ou do e-mail.');
    const users = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.area', 'area')
      .where('user.isActive = true')
      .andWhere('(user.fullName ILIKE :term OR user.email ILIKE :term)', { term: `%${term.replace(/[%_]/g, '')}%` })
      .orderBy('user.fullName', 'ASC')
      .take(10)
      .getMany();
    return users.map((user) => ({ name: user.fullName, email: user.email, role: user.role, area: user.area?.name ?? null }));
  }

  async itemLists(): Promise<Array<{ id: string; name: string; description: string | null; items: number; sample: string[] }>> {
    const lists = await this.itemListsRepository.find({
      where: { isActive: true },
      relations: { items: true },
      order: { name: 'ASC' },
    });
    return lists.map((list) => {
      const active = (list.items ?? []).filter((item) => item.isActive).sort((a, b) => a.order - b.order);
      return {
        id: list.id,
        name: list.name,
        description: list.description,
        items: active.length,
        sample: active.slice(0, 8).map((item) => item.name),
      };
    });
  }

  /** Conectores do ERP e as listas ("fontes") de cada um, para o campo "Lista do ERP". */
  async erp(): Promise<Array<{ connectorId: string; name: string; sources: Array<{ fonte: string; label: string; modo: string }>; error?: string }>> {
    const connectors = await this.erpLookup.listActiveConnectors();
    return Promise.all(
      connectors.map(async (connector) => {
        try {
          const sources = await this.erpLookup.listSources(connector.id);
          return {
            connectorId: connector.id,
            name: connector.name,
            sources: sources.map((source) => ({ fonte: source.id, label: source.label, modo: source.modo })),
          };
        } catch (error) {
          this.logger.warn(`Catálogo ERP: conector ${connector.id} indisponível: ${(error as Error).message}`);
          return { connectorId: connector.id, name: connector.name, sources: [], error: 'ERP indisponível agora.' };
        }
      }),
    );
  }

  /** O que a pessoa monta no editor de fluxos (precisa de credencial): só para a IA saber que existe. */
  async integrations(): Promise<Record<string, unknown>> {
    const erpConnectors = await this.erpLookup.listActiveConnectors();
    return {
      note:
        'A IA não configura integrações com credencial. Monte o processo e registre em "pending" o que a pessoa deve ligar no editor de fluxos.',
      available: [
        { kind: 'erp', label: 'Operações no ERP e campos "Lista do ERP"', connectors: erpConnectors.map((connector) => connector.name) },
        { kind: 'google_sheets', label: 'Planilha do Google (por processo, no Criador)' },
        { kind: 'webhook', label: 'Webhook de saída e de entrada (editor de fluxos)' },
        { kind: 'whatsapp', label: 'Mensagem por WhatsApp (nó Notificação, canal whatsapp)' },
        { kind: 'lops_ai_agent', label: 'Agente da LOPS IA dentro de um fluxo (editor de fluxos)' },
      ],
    };
  }

  async processes(
    actor: JwtPayload,
    search: string | undefined,
  ): Promise<Array<{ id: string; name: string; description: string | null; status: string; category: string | null; area: string | null; updatedAt: Date }>> {
    // Mesma listagem da tela: só o que a pessoa enxerga (área, responsável, perfil).
    const query: QueryFormsDto = { search: search?.trim() ? search.trim() : undefined, page: 1, limit: 30 };
    const page = await this.formsService.findAll(query, actor.sub);
    return page.data.map((form) => ({
      id: form.id,
      name: form.name,
      description: form.description,
      status: form.status,
      category: form.category,
      area: form.area,
      updatedAt: form.updatedAt,
    }));
  }
}
