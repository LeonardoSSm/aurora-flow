import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

type HttpLabels = {
  method: string;
  route: string;
  status_code: string;
};

type DbLabels = {
  operation: string;
};

type RabbitMqPublishResult = 'success' | 'failed' | 'disabled' | 'backpressure';
type RabbitMqConsumeResult = 'success' | 'failed';

type RabbitMqLabels<T extends string> = {
  queue: string;
  result: T;
};

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  private readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  private readonly httpRequestsInFlight: Gauge<'method'>;
  private readonly dbQueriesTotal: Counter<'operation'>;
  private readonly dbQueryErrorsTotal: Counter<'operation'>;
  private readonly dbSlowQueryDuration: Histogram<'operation'>;
  private readonly rabbitMqConnectionUp: Gauge<'connection'>;
  private readonly rabbitMqMessagesPublishedTotal: Counter<'queue' | 'result'>;
  private readonly rabbitMqPublishDuration: Histogram<'queue' | 'result'>;
  private readonly rabbitMqMessagesConsumedTotal: Counter<'queue' | 'result'>;
  private readonly rabbitMqMessageProcessingDuration: Histogram<'queue' | 'result'>;
  private readonly flowExecutionsTotal: Counter<'flow_id' | 'status'>;
  private readonly flowExecutionDuration: Histogram<'status'>;
  private readonly flowNodeExecutionsTotal: Counter<'node_type' | 'status'>;
  private readonly dlqMessages: Gauge<'queue'>;
  private readonly solicitationsByStatus: Gauge<'status'>;
  private readonly solicitationsSlaBreachedTotal: Gauge<never>;
  private readonly solicitationsBySlaStatus: Gauge<'sla_status'>;
  private readonly approvalsPendingTotal: Gauge<never>;
  private readonly kanbanMovesTotal: Counter<'from_status' | 'to_status'>;
  private readonly solicitationsCreatedTotal: Counter<'origin_type'>;
  private readonly solicitationsByArea: Gauge<'area_code'>;
  private readonly approvalsDecidedTotal: Counter<'decision'>;
  private readonly solicitationCompletionHours: Histogram<never>;
  private readonly webhookDeliveriesTotal: Counter<'status'>;
  private readonly inboundWebhookEventsTotal: Counter<'status'>;
  private readonly whatsappMessagesTotal: Counter<'status' | 'provider'>;
  private readonly notificationsCreatedTotal: Counter<'channel'>;
  private readonly notificationAttemptsTotal: Counter<'channel' | 'provider' | 'result'>;
  private readonly notificationAttemptDuration: Histogram<'channel' | 'provider'>;
  private readonly notificationRecipientsDue: Gauge<never>;
  private readonly erpConnectorUp: Gauge<'connector_id' | 'connector_name'>;
  private readonly erpOperationsTotal: Counter<'connector_name' | 'status'>;
  private readonly erpOperationDuration: Histogram<'connector_name'>;
  private readonly erpAuthFailuresTotal: Counter<'connector_name'>;

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'formhub_',
    });

    this.httpRequestsTotal = new Counter({
      name: 'formhub_http_requests_total',
      help: 'Total de requisicoes HTTP processadas pela API.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'formhub_http_request_duration_seconds',
      help: 'Duracao das requisicoes HTTP em segundos.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'formhub_http_requests_in_flight',
      help: 'Quantidade de requisicoes HTTP em andamento.',
      labelNames: ['method'],
      registers: [this.registry],
    });

    this.dbQueriesTotal = new Counter({
      name: 'formhub_db_queries_total',
      help: 'Total de queries executadas pela API, agrupadas pela operacao SQL.',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.dbQueryErrorsTotal = new Counter({
      name: 'formhub_db_query_errors_total',
      help: 'Total de queries com erro na camada TypeORM, agrupadas pela operacao SQL.',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.dbSlowQueryDuration = new Histogram({
      name: 'formhub_db_slow_query_duration_seconds',
      help: 'Duracao das queries lentas reportadas pelo TypeORM em segundos.',
      labelNames: ['operation'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });

    this.rabbitMqConnectionUp = new Gauge({
      name: 'formhub_rabbitmq_connection_up',
      help: 'Estado da conexao RabbitMQ da API. 1 conectado, 0 desconectado.',
      labelNames: ['connection'],
      registers: [this.registry],
    });

    this.rabbitMqMessagesPublishedTotal = new Counter({
      name: 'formhub_rabbitmq_messages_published_total',
      help: 'Total de publicacoes RabbitMQ feitas pela API.',
      labelNames: ['queue', 'result'],
      registers: [this.registry],
    });

    this.rabbitMqPublishDuration = new Histogram({
      name: 'formhub_rabbitmq_publish_duration_seconds',
      help: 'Duracao das tentativas de publicacao no RabbitMQ em segundos.',
      labelNames: ['queue', 'result'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.rabbitMqMessagesConsumedTotal = new Counter({
      name: 'formhub_rabbitmq_messages_consumed_total',
      help: 'Total de mensagens RabbitMQ processadas pela API.',
      labelNames: ['queue', 'result'],
      registers: [this.registry],
    });

    this.rabbitMqMessageProcessingDuration = new Histogram({
      name: 'formhub_rabbitmq_message_processing_duration_seconds',
      help: 'Duracao do processamento de mensagens RabbitMQ pela API em segundos.',
      labelNames: ['queue', 'result'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });

    this.flowExecutionsTotal = new Counter({
      name: 'formhub_flow_executions_total',
      help: 'Total de execucoes de fluxo, agrupadas por fluxo e status final.',
      labelNames: ['flow_id', 'status'],
      registers: [this.registry],
    });

    this.flowExecutionDuration = new Histogram({
      name: 'formhub_flow_execution_duration_seconds',
      help: 'Duracao total das execucoes de fluxo em segundos.',
      labelNames: ['status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.flowNodeExecutionsTotal = new Counter({
      name: 'formhub_flow_node_executions_total',
      help: 'Total de execucoes de nos de fluxo, agrupadas por tipo e status.',
      labelNames: ['node_type', 'status'],
      registers: [this.registry],
    });

    this.dlqMessages = new Gauge({
      name: 'formhub_rabbitmq_dlq_messages',
      help: 'Quantidade atual de mensagens na dead-letter queue.',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.solicitationsByStatus = new Gauge({
      name: 'formhub_solicitations_by_status',
      help: 'Quantidade atual de solicitacoes por status.',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.solicitationsSlaBreachedTotal = new Gauge({
      name: 'formhub_solicitations_sla_breached_total',
      help: 'Total de solicitacoes com SLA vencido.',
      labelNames: [],
      registers: [this.registry],
    });
    this.solicitationsSlaBreachedTotal.set(0);

    this.solicitationsBySlaStatus = new Gauge({
      name: 'formhub_solicitations_by_sla_status',
      help: 'Quantidade atual de solicitacoes por status de SLA.',
      labelNames: ['sla_status'],
      registers: [this.registry],
    });

    this.approvalsPendingTotal = new Gauge({
      name: 'formhub_approvals_pending_total',
      help: 'Quantidade atual de aprovacoes pendentes.',
      labelNames: [],
      registers: [this.registry],
    });
    this.approvalsPendingTotal.set(0);

    this.kanbanMovesTotal = new Counter({
      name: 'formhub_kanban_moves_total',
      help: 'Total de movimentacoes de cards no Kanban por par de status.',
      labelNames: ['from_status', 'to_status'],
      registers: [this.registry],
    });

    this.solicitationsCreatedTotal = new Counter({
      name: 'formhub_solicitations_created_total',
      help: 'Total de solicitacoes criadas, agrupadas por tipo de origem.',
      labelNames: ['origin_type'],
      registers: [this.registry],
    });

    this.solicitationsByArea = new Gauge({
      name: 'formhub_solicitations_by_area',
      help: 'Quantidade atual de solicitacoes abertas por area.',
      labelNames: ['area_code'],
      registers: [this.registry],
    });

    this.approvalsDecidedTotal = new Counter({
      name: 'formhub_approvals_decided_total',
      help: 'Total de aprovacoes decididas, agrupadas por decisao.',
      labelNames: ['decision'],
      registers: [this.registry],
    });

    this.solicitationCompletionHours = new Histogram({
      name: 'formhub_solicitation_completion_hours',
      help: 'Tempo total em horas ate a conclusao de solicitacoes.',
      labelNames: [],
      buckets: [1, 4, 8, 24, 48, 72, 168, 336, 720],
      registers: [this.registry],
    });

    this.webhookDeliveriesTotal = new Counter({
      name: 'formhub_webhook_deliveries_total',
      help: 'Total de entregas de webhook outbound, agrupadas por status.',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.inboundWebhookEventsTotal = new Counter({
      name: 'formhub_inbound_webhook_events_total',
      help: 'Total de eventos de webhook recebidos, agrupados por status.',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.whatsappMessagesTotal = new Counter({
      name: 'formhub_whatsapp_messages_total',
      help: 'Total de mensagens WhatsApp, agrupadas por status e provedor.',
      labelNames: ['status', 'provider'],
      registers: [this.registry],
    });

    this.notificationsCreatedTotal = new Counter({
      name: 'formhub_notifications_created_total',
      help: 'Total de notificacoes criadas (ex.: nos action_notification), por canal.',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.notificationAttemptsTotal = new Counter({
      name: 'formhub_notification_attempts_total',
      help: 'Total de tentativas de envio de notificacao, por canal, provedor e resultado (success, retry, failed, abandoned).',
      labelNames: ['channel', 'provider', 'result'],
      registers: [this.registry],
    });

    this.notificationAttemptDuration = new Histogram({
      name: 'formhub_notification_attempt_duration_seconds',
      help: 'Duracao das tentativas de envio de notificacao em segundos.',
      labelNames: ['channel', 'provider'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30],
      registers: [this.registry],
    });

    this.notificationRecipientsDue = new Gauge({
      name: 'formhub_notification_recipients_due',
      help: 'Destinatarios de notificacao prontos para envio (pending/scheduled vencidos) no ultimo ciclo do worker — backlog.',
      registers: [this.registry],
    });

    this.erpConnectorUp = new Gauge({
      name: 'formhub_erp_connector_up',
      help: 'Estado do conector ERP. 1 = acessível e auth válida, 0 = falha.',
      labelNames: ['connector_id', 'connector_name'],
      registers: [this.registry],
    });

    this.erpOperationsTotal = new Counter({
      name: 'formhub_erp_operations_total',
      help: 'Total de operações ERP por conector e status final.',
      labelNames: ['connector_name', 'status'],
      registers: [this.registry],
    });

    this.erpOperationDuration = new Histogram({
      name: 'formhub_erp_operation_duration_seconds',
      help: 'Duração das operações ERP em segundos.',
      labelNames: ['connector_name'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.erpAuthFailuresTotal = new Counter({
      name: 'formhub_erp_auth_failures_total',
      help: 'Total de falhas de autenticação (401) em conectores ERP.',
      labelNames: ['connector_name'],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  incrementInFlight(method: string): void {
    this.httpRequestsInFlight.inc({ method });
  }

  decrementInFlight(method: string): void {
    this.httpRequestsInFlight.dec({ method });
  }

  observeHttpRequest(labels: HttpLabels, durationSeconds: number): void {
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSeconds);
  }

  incrementDbQuery(labels: DbLabels): void {
    this.dbQueriesTotal.inc(labels);
  }

  incrementDbQueryError(labels: DbLabels): void {
    this.dbQueryErrorsTotal.inc(labels);
  }

  observeDbSlowQuery(labels: DbLabels, durationSeconds: number): void {
    this.dbSlowQueryDuration.observe(labels, durationSeconds);
  }

  setRabbitMqConnectionUp(isUp: boolean): void {
    this.rabbitMqConnectionUp.set({ connection: 'default' }, isUp ? 1 : 0);
  }

  observeRabbitMqPublish(
    labels: RabbitMqLabels<RabbitMqPublishResult>,
    durationSeconds: number,
  ): void {
    this.rabbitMqMessagesPublishedTotal.inc(labels);
    this.rabbitMqPublishDuration.observe(labels, durationSeconds);
  }

  observeRabbitMqMessage(
    labels: RabbitMqLabels<RabbitMqConsumeResult>,
    durationSeconds: number,
  ): void {
    this.rabbitMqMessagesConsumedTotal.inc(labels);
    this.rabbitMqMessageProcessingDuration.observe(labels, durationSeconds);
  }

  recordFlowExecution(flowId: string, status: string, durationMs: number): void {
    this.flowExecutionsTotal.inc({ flow_id: flowId, status });
    this.flowExecutionDuration.observe({ status }, durationMs / 1000);
  }

  recordFlowNodeExecution(nodeType: string, status: string): void {
    this.flowNodeExecutionsTotal.inc({ node_type: nodeType, status });
  }

  setDlqMessages(queue: string, count: number): void {
    this.dlqMessages.set({ queue }, count);
  }

  incrementSolicitationsByStatus(status: string): void {
    this.solicitationsByStatus.inc({ status }, 1);
  }

  decrementSolicitationsByStatus(status: string): void {
    this.solicitationsByStatus.dec({ status }, 1);
  }

  incrementKanbanMoves(fromStatus: string, toStatus: string): void {
    this.kanbanMovesTotal.inc({ from_status: fromStatus, to_status: toStatus });
  }

  setSolicitationsSlaBreachedTotal(count: number): void {
    this.solicitationsSlaBreachedTotal.set(count);
  }

  setSolicitationsBySlaStatus(counts: Record<string, number>): void {
    this.solicitationsBySlaStatus.reset();
    for (const [slaStatus, count] of Object.entries(counts)) {
      this.solicitationsBySlaStatus.set({ sla_status: slaStatus }, count);
    }
  }

  setApprovalsPendingTotal(count: number): void {
    this.approvalsPendingTotal.set(count);
  }

  incrementSolicitationsCreatedTotal(originType: string): void {
    this.solicitationsCreatedTotal.inc({ origin_type: originType });
  }

  setSolicitationsByArea(counts: Record<string, number>): void {
    this.solicitationsByArea.reset();
    for (const [areaCode, count] of Object.entries(counts)) {
      this.solicitationsByArea.set({ area_code: areaCode }, count);
    }
  }

  incrementApprovalsDecided(decision: string): void {
    this.approvalsDecidedTotal.inc({ decision });
  }

  observeSolicitationCompletionHours(hours: number): void {
    this.solicitationCompletionHours.observe(hours);
  }

  incrementWebhookDeliveries(status: string): void {
    this.webhookDeliveriesTotal.inc({ status });
  }

  incrementInboundWebhookEvents(status: string): void {
    this.inboundWebhookEventsTotal.inc({ status });
  }

  incrementWhatsAppMessages(status: string, provider: string): void {
    this.whatsappMessagesTotal.inc({ status, provider });
  }

  incrementNotificationsCreated(channel: string): void {
    this.notificationsCreatedTotal.inc({ channel });
  }

  recordNotificationAttempt(
    channel: string,
    provider: string,
    result: 'success' | 'retry' | 'failed' | 'abandoned',
    durationSeconds: number,
  ): void {
    this.notificationAttemptsTotal.inc({ channel, provider, result });
    this.notificationAttemptDuration.observe({ channel, provider }, durationSeconds);
  }

  setNotificationRecipientsDue(count: number): void {
    this.notificationRecipientsDue.set(count);
  }

  setErpConnectorUp(connectorId: string, connectorName: string, isUp: boolean): void {
    this.erpConnectorUp.set({ connector_id: connectorId, connector_name: connectorName }, isUp ? 1 : 0);
  }

  recordErpOperation(connectorName: string, status: 'success' | 'failed' | 'auth_error' | 'timeout', durationMs: number): void {
    this.erpOperationsTotal.inc({ connector_name: connectorName, status });
    this.erpOperationDuration.observe({ connector_name: connectorName }, durationMs / 1000);
  }

  incrementErpAuthFailures(connectorName: string): void {
    this.erpAuthFailuresTotal.inc({ connector_name: connectorName });
  }
}
