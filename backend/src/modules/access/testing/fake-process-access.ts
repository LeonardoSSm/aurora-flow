import type { ProcessPermissionScope } from '../../../common/constants/process-permission-catalog';
import { type AccessActor, ProcessAccessService, ProcessGrants } from '../process-access.service';

/** Vínculos de uma pessoa em teste: processo → código → escopo. */
export type FakeMemberships = Record<string, Record<string, ProcessPermissionScope>>;

export interface FakeAccessOptions {
  /** Vínculos por pessoa (id). */
  members?: Record<string, FakeMemberships>;
  /** Perfis com acesso total aos processos. */
  fullAccessRoles?: readonly string[];
  /** Todo mundo com acesso total (testes que não são sobre acesso). */
  everyoneFullAccess?: boolean;
  /** Monta as permissões da pessoa à mão (vence `members`/`fullAccessRoles`). */
  resolve?: (actor: AccessActor) => ProcessGrants;
  formsRepository?: unknown;
  solicitationsRepository?: unknown;
  submissionsRepository?: unknown;
  membersRepository?: unknown;
  /** Filtro de cards da fase pela resposta; sem ele, nenhum card é escondido. */
  cardFilter?: unknown;
}

export function grantsFor(userId: string, fullAccess: boolean, memberships: FakeMemberships = {}): ProcessGrants {
  return new ProcessGrants(
    userId,
    fullAccess,
    new Map(Object.entries(memberships).map(([formId, codes]) => [formId, new Map(Object.entries(codes))])),
  );
}

/**
 * ProcessAccessService de verdade, com as permissões de cada pessoa vindas da fixture em vez do banco.
 * O que ainda consulta o banco (formulário, card, aprovador) usa os repositórios passados.
 */
export function fakeProcessAccess(options: FakeAccessOptions = {}): ProcessAccessService {
  const service = new ProcessAccessService(
    { hasAny: jest.fn(), getAllForRole: jest.fn().mockResolvedValue({}) } as never,
    (options.formsRepository ?? {}) as never,
    (options.solicitationsRepository ?? {}) as never,
    (options.submissionsRepository ?? {}) as never,
    (options.membersRepository ?? {}) as never,
    (options.cardFilter ?? { hides: () => Promise.resolve(false), hiddenCards: () => Promise.resolve([]) }) as never,
  );
  const fullAccessRoles = new Set(options.fullAccessRoles ?? []);
  jest
    .spyOn(service, 'grantsOf')
    .mockImplementation((actor: AccessActor) =>
      Promise.resolve(
        options.resolve?.(actor) ??
        grantsFor(
          actor.sub,
          options.everyoneFullAccess === true || fullAccessRoles.has(actor.role),
          options.members?.[actor.sub] ?? {},
        ),
      ),
    );
  // Gravar vínculo fica registrado, sem banco: o teste confere a chamada.
  jest.spyOn(service, 'grantCreator').mockResolvedValue(undefined);
  jest.spyOn(service, 'writeMember').mockResolvedValue({} as never);
  jest.spyOn(service, 'addMemberIfMissing').mockResolvedValue(true);
  jest.spyOn(service, 'removeMember').mockResolvedValue(true);
  jest.spyOn(service, 'copyMembers').mockResolvedValue(undefined);
  return service;
}
