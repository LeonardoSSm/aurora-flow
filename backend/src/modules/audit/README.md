# Audit & Domain Events

## Arquitetura

Operações de negócio emitem **Domain Events** via `EventEmitter2` (wildcard).  
O `AuditListener` escuta esses eventos e persiste registros na tabela `audit_events`.

```
Service → eventEmitter.emit(event.name, event)
              ↓  (async, não bloqueia o caller)
         AuditListener.@OnEvent(...)
              ↓
         AuditService.log(...)
              ↓
         audit_events (DB)
```

## Como criar um novo evento de domínio

1. **Defina a classe** em `backend/src/common/events/<módulo>-events.ts`:

```typescript
import { DomainEvent } from './domain-event.base';

export class OrderShippedEvent extends DomainEvent {
  readonly name = 'orders.shipped';
  constructor(
    actorId: string,
    readonly orderId: string,
    readonly trackingCode: string
  ) {
    super(actorId);
  }
}
```

2. **Emita no service** (injete `EventEmitter2`):

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderShippedEvent } from '../../common/events/order-events';

// No construtor:
constructor(private readonly eventEmitter: EventEmitter2, ...) {}

// No método de negócio:
this.eventEmitter.emit('orders.shipped', new OrderShippedEvent(actorId, order.id, tracking));
```

3. **Registre o listener** em `AuditListener` (`audit.listener.ts`):

```typescript
@OnEvent('orders.shipped', { async: true })
async onOrderShipped(event: OrderShippedEvent): Promise<void> {
  await this.auditService.log({
    actorId: event.actorId,
    module: 'orders',
    entity: 'order',
    entityId: event.orderId,
    action: 'ship',
    payload: { trackingCode: event.trackingCode }
  });
}
```

## Como registrar um listener próprio (fora do audit)

```typescript
@Injectable()
export class NotificationListener {
  @OnEvent('orders.shipped', { async: true })
  async onOrderShipped(event: OrderShippedEvent): Promise<void> {
    // enviar e-mail, push, etc.
  }
}
```

Registre como `provider` no módulo correspondente.

## Convenções de nomenclatura

| Padrão | Exemplo |
|--------|---------|
| `<módulo>.<ação_no_passado>` | `forms.created`, `responses.submitted` |
| Nomes em inglês, snake_case após o ponto | `auth.google_connect` |

## Eventos existentes hoje

### forms.*
| Evento | Classe | Dados |
|--------|--------|-------|
| `forms.created` | `FormCreatedEvent` | formId, formName, assignedUserId, googleSheetsEnabled |
| `forms.updated` | `FormUpdatedEvent` | formId, formName |
| `forms.status_changed` | `FormStatusChangedEvent` | formId, status |
| `forms.published` | `FormPublishedEvent` | formId |
| `forms.archived` | `FormArchivedEvent` | formId, previousStatus |
| `forms.duplicated` | `FormDuplicatedEvent` | formId, sourceFormId |
| `forms.google_sheet_created` | `GoogleSheetCreatedEvent` | formId, spreadsheetId, linkedAccountEmail |
| `forms.google_sync_reenqueued` | `GoogleSyncReenqueuedEvent` | formId, requeuedJobs, recoveredProcessingJobs |
| `forms.google_sync_reprocessed` | `GoogleSyncReprocessedEvent` | formId, createdJobs, skippedExistingJobs, skippedCompletedJobs |

### responses.*
| Evento | Classe | Dados |
|--------|--------|-------|
| `responses.submitted` | `ResponseSubmittedEvent` | submissionId, formId, formVersionId |
| `responses.exported` | `ResponseExportedEvent` | formId, format (csv/xlsx/pdf), count |

### auth.*
| Evento | Classe | Dados |
|--------|--------|-------|
| `auth.login` | `UserLoggedInEvent` | email |
| `auth.google_connect` | `GoogleConnectedEvent` | email, googleAccountEmail |
| `auth.google_disconnect` | `GoogleDisconnectedEvent` | email, googleAccountEmail |

### users.*
| Evento | Classe | Dados |
|--------|--------|-------|
| `users.created` | `UserCreatedEvent` | userId, email, role |
| `users.updated` | `UserUpdatedEvent` | userId, changes |
| `users.deactivated` | `UserDeactivatedEvent` | userId, email |
