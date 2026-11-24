import { DomainEvent } from './domain-event.base';

/** Vínculo de uma pessoa com um processo criado, alterado ou removido (vai para a auditoria). */
export class ProcessMemberChangedEvent extends DomainEvent {
  readonly name = 'process_members.changed';
  constructor(
    actorId: string,
    readonly formId: string,
    readonly userId: string,
    readonly action: 'grant' | 'update' | 'revoke',
    /** Permissões depois da mudança (vazio ao remover). */
    readonly grants: Record<string, string>,
    /** Permissões antes (nulo se não havia vínculo). */
    readonly previous: Record<string, string> | null,
  ) {
    super(actorId);
  }
}
