import { readApprovalEmail } from '../../lib/approval-email';
import type { NodeIssue } from '../../lib/node-issues';
import { getApproverSourceMode } from '../../lib/node-issues';
import { channelInfo } from '../../lib/notification-config';
import type { FlowNodeData } from '../../types/flow.types';

/** Dados que o resumo de uma etapa pode precisar e que não estão em `node.data` (ex. nomes). */
export interface SectionSummaryContext {
  formName?: string;
  endpointName?: string;
}

export interface NodeSection {
  id: string;
  label: string;
  /** Texto abaixo do título da etapa (o que antes ia num InfoCard no topo do formulário). */
  description?: string;
  /** Campos (as chaves de `getNodeIssues`) desta etapa — marcam "Falta preencher" na navegação. */
  fields: readonly string[];
  /** Resumo de uma linha mostrado na navegação, abaixo do nome da etapa. */
  summary?: (d: FlowNodeData, ctx: SectionSummaryContext) => string;
  /** Etapa única de um nó ainda sem mapa de etapas: sem cabeçalho, o formulário vai inteiro. */
  implicit?: boolean;
}

const text = (value: unknown) => String(value ?? '').trim();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const identification: NodeSection = {
  id: 'identificacao',
  label: 'Identificação',
  description: 'Como este gatilho aparece no canvas.',
  fields: ['label'],
  summary: (d) => text(d.label) || 'Sem alias',
};

function headersSection(): NodeSection {
  return {
    id: 'cabecalhos',
    label: 'Cabeçalhos',
    description: 'Pares chave/valor enviados junto com a requisição.',
    fields: ['headers'],
    summary: (d) => {
      const first = Array.isArray(d.headers)
        ? (d.headers as Array<{ key?: string }>).find((h) => text(h.key))
        : undefined;
      return first ? text(first.key) : 'Nenhum';
    },
  };
}

const INTERVAL_UNITS: Record<string, [string, string]> = {
  minutes: ['minuto', 'minutos'],
  hours: ['hora', 'horas'],
  days: ['dia', 'dias'],
};

function scheduleSummary(d: FlowNodeData): string {
  if (d.mode === 'cron') return text(d.cronExpression) || 'Expressão cron';
  const value = Number(d.intervalValue);
  if (!value) return 'Intervalo';
  const [one, many] = INTERVAL_UNITS[String(d.intervalUnit ?? 'minutes')] ?? INTERVAL_UNITS.minutes;
  return `A cada ${plural(value, one, many)}`;
}

function payloadFilterSummary(d: FlowNodeData): string {
  if (typeof d.payloadFilters === 'string') return 'JSON inválido';
  const entries = d.payloadFilters ? Object.entries(d.payloadFilters) : [];
  if (entries.length === 0) return 'Sem filtro';
  const [key, value] = entries[0];
  const first = `${key} = ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`;
  return entries.length > 1 ? `${first} +${entries.length - 1}` : first;
}

function approversSummary(d: FlowNodeData): string {
  switch (getApproverSourceMode(d)) {
    case 'field':
      return 'Campo do formulário';
    case 'dynamic':
      return 'Via payload';
    case 'phase_role':
      return 'Quem aprova a fase';
    case 'fixed': {
      const users = Array.isArray(d.assignedUserIds) ? d.assignedUserIds.length : 0;
      const emails = Array.isArray(d.approverEmails) ? d.approverEmails.length : 0;
      const parts = [
        users ? plural(users, 'usuário', 'usuários') : '',
        emails ? plural(emails, 'e-mail', 'e-mails') : '',
      ].filter(Boolean);
      return parts.join(' · ') || 'Lista fixa';
    }
  }
}

function approvalEmailSummary(d: FlowNodeData): string {
  const config = readApprovalEmail(d.emailApprovers);
  if (config.enabled !== true) return 'Desligado';
  return config.subject?.trim() || config.body?.trim() ? 'Texto personalizado' : 'Texto padrão';
}

function emailCount(raw: unknown): number {
  return String(raw ?? '')
    .split(/[,;\n]/)
    .filter((part) => part.trim()).length;
}

const DELIVERY_LABELS: Record<string, string> = {
  immediate: 'Imediato',
  background: 'Em segundo plano',
};
const PRIORITY_LABELS: Record<string, string> = { high: 'Alta', normal: 'Normal', low: 'Baixa' };

const NODE_SECTIONS: Partial<Record<string, readonly NodeSection[]>> = {
  // ── Gatilhos ──
  trigger_form_submit: [
    {
      id: 'origem',
      label: 'Origem',
      description:
        'Este fluxo é disparado automaticamente quando o formulário recebe uma resposta.',
      fields: ['formId'],
      summary: (d, ctx) =>
        d.formId ? (ctx.formName ?? 'Formulário selecionado') : 'Qualquer formulário',
    },
    identification,
  ],
  trigger_webhook_received: [
    {
      id: 'endpoint',
      label: 'Endpoint',
      description: 'Dispara quando um webhook externo é recebido.',
      fields: ['endpointId'],
      summary: (d, ctx) =>
        d.endpointId ? (ctx.endpointName ?? 'Endpoint selecionado') : 'Qualquer endpoint',
    },
    {
      id: 'filtro',
      label: 'Filtro',
      description: 'Só dispara quando o payload combinar com o filtro.',
      fields: ['payloadFilters'],
      summary: payloadFilterSummary,
    },
    {
      id: 'lote',
      label: 'Lote',
      description: 'Roda o fluxo uma vez para cada item de uma lista do payload.',
      fields: ['splitItemsPath'],
      summary: (d) => text(d.splitItemsPath) || 'Desligado',
    },
    identification,
  ],
  trigger_scheduled: [
    {
      id: 'quando',
      label: 'Quando',
      description:
        'Dispara sozinho, num intervalo fixo ou por expressão cron, sem depender de nenhum evento externo.',
      fields: ['mode', 'intervalValue', 'intervalUnit', 'cronExpression', 'timezone'],
      summary: scheduleSummary,
    },
    {
      id: 'limites',
      label: 'Limites',
      description: 'Proteções automáticas do agendamento.',
      fields: [],
      summary: () => 'Mínimo de 1 minuto',
    },
  ],
  trigger_approval_completed: [
    {
      id: 'principal',
      label: 'Aprovação concluída',
      description: 'Dispara quando uma aprovação é concluída.',
      fields: ['result'],
    },
  ],
  trigger_sla_warning: [
    {
      id: 'principal',
      label: 'SLA em alerta',
      description:
        'Dispara quando o prazo atinge o percentual de alerta: o SLA geral da solicitação ou o prazo de uma fase do Kanban.',
      fields: ['slaScope', 'phaseId'],
    },
  ],
  trigger_sla_breached: [
    {
      id: 'principal',
      label: 'SLA vencido',
      description:
        'Dispara quando o prazo vence — o SLA geral da solicitação ou o prazo de uma fase do Kanban. Use para avisar responsáveis ou escalar.',
      fields: ['slaScope', 'phaseId'],
    },
  ],

  // ── Condições ──
  condition_field_value: [
    {
      id: 'regra',
      label: 'Regra',
      description: 'O fluxo segue por este caminho quando o campo atende à condição.',
      fields: ['fieldCode', 'operator', 'value'],
    },
  ],
  condition_always_true: [
    {
      id: 'principal',
      label: 'Sempre verdadeiro',
      description:
        'Este caminho é seguido sempre que o nó anterior for executado com sucesso. Não requer configuração adicional.',
      fields: [],
    },
  ],

  // ── Ações ──
  action_create_approval: [
    {
      id: 'conteudo',
      label: 'Conteúdo',
      description: 'O que os aprovadores veem.',
      fields: ['title', 'description'],
      summary: () => 'Título e descrição',
    },
    {
      id: 'escopo',
      label: 'Escopo',
      description: 'O que esta aprovação decide.',
      fields: ['scope'],
      summary: (d) => (d.scope === 'phase' ? 'Fase atual' : 'Solicitação inteira'),
    },
    {
      id: 'aprovadores',
      label: 'Aprovadores',
      description: 'Quem decide e como os nomes chegam até aqui.',
      fields: [
        'approverSourceMode',
        'approvers',
        'approverFieldCode',
        'approversPath',
        'allowExternalApprovers',
      ],
      summary: approversSummary,
    },
    {
      id: 'modo',
      label: 'Regra',
      description: 'Basta um aprovar, todos aprovam, ou todos em ordem.',
      fields: ['approvalRule', 'approvalMode'],
      summary: (d) =>
        d.approverSourceMode === 'phase_role'
          ? 'Regra da fase'
          : d.approvalRule === 'all'
            ? 'Todos'
            : d.approvalRule === 'sequential' || (!d.approvalRule && d.approvalMode === 'sequential')
              ? 'Em ordem'
              : 'Qualquer um',
    },
    {
      id: 'email',
      label: 'E-mail',
      description:
        'Sai quando a aprovação é criada, para cada aprovador com usuário (nomeado ou pelo perfil).',
      fields: ['emailApprovers'],
      summary: approvalEmailSummary,
    },
  ],
  action_send_email: [
    {
      id: 'destinatarios',
      label: 'Destinatários',
      description: 'Para quem o e-mail vai.',
      fields: ['toEmail'],
      summary: (d) => {
        const n = emailCount(d.toEmail);
        return n ? plural(n, 'endereço', 'endereços') : 'Nenhum';
      },
    },
    {
      id: 'mensagem',
      label: 'Mensagem',
      description: 'Assunto e corpo. Clique numa variável para inserir no corpo.',
      fields: ['subject', 'body'],
      summary: () => 'Assunto e corpo',
    },
  ],
  action_webhook: [
    {
      id: 'requisicao',
      label: 'Requisição',
      description: 'Para onde os dados são enviados.',
      fields: ['method', 'webhookUrl'],
      summary: (d) => String(d.method ?? 'POST'),
    },
    headersSection(),
    {
      id: 'corpo',
      label: 'Corpo',
      description: 'O JSON enviado. Aceita variáveis.',
      fields: ['bodyTemplate'],
      summary: (d) => (text(d.bodyTemplate) ? 'JSON' : 'Vazio'),
    },
  ],
  action_http_check: [
    {
      id: 'requisicao',
      label: 'Requisição',
      description:
        'Chama uma API e guarda a resposta para os nós seguintes (ex: um nó de condição) usarem — diferente do nó Webhook, que é apenas disparar e esquecer.',
      fields: ['method', 'url', 'bodyTemplate'],
      summary: (d) => String(d.method ?? 'GET'),
    },
    headersSection(),
    {
      id: 'tempo',
      label: 'Tempo limite',
      description: 'Quanto esperar pela resposta antes de falhar.',
      fields: ['timeoutMs'],
      summary: (d) => `${Number(d.timeoutMs) || 15000} ms`,
    },
  ],
  action_ai_agent: [
    {
      id: 'agente',
      label: 'Agente',
      description:
        "Chama um agente da LOPS IA com a imagem do anexo do contexto (ex: vindo do gatilho 'Anexo enviado').",
      fields: ['agentSlug'],
      summary: (d) => text(d.agentName) || text(d.agentSlug) || 'Nenhum',
    },
    {
      id: 'autenticacao',
      label: 'Autenticação',
      description: 'Chave usada ao executar o agente.',
      fields: ['apiKey'],
      summary: (d) => (text(d.apiKey) ? 'Chave informada' : 'Sem chave'),
    },
    {
      id: 'mensagem',
      label: 'Mensagem',
      description: 'O que pedir ao agente.',
      fields: ['message', 'timeoutMs'],
      summary: (d) =>
        text(d.message) && text(d.message) !== 'Analise essa imagem.' ? 'Personalizada' : 'Padrão',
    },
  ],
  action_erp_operation: [
    {
      id: 'conector',
      label: 'Conector',
      description: 'Qual ERP recebe a operação. Conectores são criados em Administração > ERP.',
      fields: ['connectorId'],
      summary: (d) => text(d.connectorName) || 'Nenhum',
    },
    {
      id: 'operacao',
      label: 'Operação',
      description: 'O template de chamada que será executado.',
      fields: ['templateId'],
      summary: (d) => text(d.templateName) || 'Nenhuma',
    },
  ],
  action_notification: [
    {
      id: 'canal',
      label: 'Canal',
      description: 'Por onde a mensagem chega.',
      fields: ['channel'],
      summary: (d) => channelInfo(d.channel)?.label ?? 'Nenhum',
    },
    {
      id: 'destinatarios',
      label: 'Destinatários',
      description: 'Quem recebe. Combine pessoas, papéis e campos do formulário.',
      fields: ['recipients'],
      summary: (d) => {
        const n = Array.isArray(d.recipients) ? d.recipients.length : 0;
        return n ? plural(n, 'destinatário', 'destinatários') : 'Nenhum';
      },
    },
    {
      id: 'mensagem',
      label: 'Mensagem',
      description: 'Texto puro, sem HTML. Variáveis viram valores no envio.',
      fields: ['title', 'content'],
      summary: (d) => text(d.title) || 'Título e corpo',
    },
    {
      id: 'entrega',
      label: 'Entrega',
      description: 'Quando e com que prioridade a mensagem sai.',
      fields: ['deliveryMode', 'delayMinutes', 'priority'],
      summary: (d) =>
        `${DELIVERY_LABELS[String(d.deliveryMode ?? 'immediate')] ?? 'Imediato'} · ${
          PRIORITY_LABELS[String(d.priority ?? 'normal')] ?? 'Normal'
        }`,
    },
    {
      id: 'falhas',
      label: 'Falhas',
      description: 'Como o fluxo reage se o envio der errado.',
      fields: ['continueOnFailure', 'retryPolicy', 'idempotencyKeyTemplate'],
      summary: (d) => (d.continueOnFailure ? 'Continua o fluxo' : 'Interrompe o fluxo'),
    },
  ],
};

const IMPLICIT_SECTIONS: readonly NodeSection[] = [
  { id: 'config', label: 'Configuração', fields: [], implicit: true },
];

/** Etapas do modal para o tipo de nó; tipos ainda não migrados caem numa etapa única. */
export function getNodeSections(type: string): readonly NodeSection[] {
  return NODE_SECTIONS[type] ?? IMPLICIT_SECTIONS;
}

/**
 * Distribui as pendências pelas etapas. Uma pendência cujo campo nenhuma etapa declara vai para a
 * primeira — melhor sobrar um "!" do que o cabeçalho contar uma pendência que a navegação esconde.
 */
export function groupIssuesBySection(
  sections: readonly NodeSection[],
  issues: readonly NodeIssue[],
): Record<string, NodeIssue[]> {
  const grouped: Record<string, NodeIssue[]> = Object.fromEntries(sections.map((s) => [s.id, []]));
  for (const issue of issues) {
    const owner = sections.find((s) => s.fields.includes(issue.field)) ?? sections[0];
    grouped[owner.id].push(issue);
  }
  return grouped;
}
