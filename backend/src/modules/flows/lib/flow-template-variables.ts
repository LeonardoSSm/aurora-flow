import { DEFAULT_SCHEDULE_TIMEZONE } from './compute-next-run';
import type { FlowExecutionContext } from '../types/flow.types';
import { CHOICE_VALUE_SUFFIX } from './flow-field-labels';

/**
 * Variáveis `{{...}}` disponíveis para o nó de notificação, extraídas do contexto de execução do
 * fluxo. Mesmos nomes do `interpolate` do motor (e do WhatsApp) — para o usuário é uma lista só —,
 * mas aqui o resultado é um mapa **plano e somente de texto**: nada de objetos, funções ou
 * protótipos chega ao renderizador.
 *
 * Precedência (igual à do motor): variáveis embutidas > campos do formulário > metadata.
 * Além disso, `payload.a.b` expõe o payload do webhook (ctx.metadata.payload) por caminho.
 */

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_PAYLOAD_VARIABLES = 200;
const MAX_PAYLOAD_DEPTH = 4;

export type FlowTemplateVariables = Record<string, string>;

/** Nomes embutidos, na ordem em que o editor os lista. */
export const BUILTIN_FLOW_VARIABLES: ReadonlyArray<{ name: string; label: string; sample: string }> = [
  { name: 'form_name', label: 'Nome do formulário', sample: 'Compra de materiais' },
  { name: 'responder_name', label: 'Nome do respondente', sample: 'Maria Souza' },
  { name: 'responder_email', label: 'E-mail do respondente', sample: 'maria.souza@exemplo.com' },
  { name: 'submitted_at', label: 'Data de envio', sample: '05/10/2026 14:32:10' },
  { name: 'solicitation_number', label: 'Número da solicitação', sample: '3f6c1e2a-0000-4000-8000-000000000001' },
  { name: 'solicitation_title', label: 'Título da solicitação', sample: 'Compra de 10 cadeiras' },
  { name: 'solicitation_status', label: 'Status da solicitação', sample: 'in_progress' },
  { name: 'solicitation_priority', label: 'Prioridade da solicitação', sample: 'medium' },
  { name: 'solicitation_requester_name', label: 'Solicitante', sample: 'Maria Souza' },
  { name: 'solicitation_requester_email', label: 'E-mail do solicitante', sample: 'maria.souza@exemplo.com' },
  { name: 'solicitation_responsible_name', label: 'Responsável', sample: 'João Lima' },
  { name: 'tracking_url', label: 'Link de acompanhamento', sample: 'https://flow.exemplo.com/acompanhar/abc123' },
  { name: 'approval_link', label: 'Link de aprovação', sample: 'https://flow.exemplo.com/aprovacoes?id=abc123' },
  { name: 'approval_title', label: 'Título da aprovação', sample: 'Retirar de rota: pedido 123456' },
  { name: 'approval_description', label: 'Descrição da aprovação', sample: 'Retire o pedido da rota e aprove.' },
  { name: 'approval_status', label: 'Resultado da aprovação', sample: 'approved' },
];

export const SAMPLE_FLOW_VARIABLES: Readonly<FlowTemplateVariables> = Object.freeze(
  Object.fromEntries(BUILTIN_FLOW_VARIABLES.map((v) => [v.name, v.sample])),
);

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ''
      : value.toLocaleString('pt-BR', { timeZone: DEFAULT_SCHEDULE_TIMEZONE });
  }
  if (Array.isArray(value)) {
    const parts = value.map((entry) => (typeof entry === 'object' ? null : toText(entry)));
    return parts.every((part) => part !== null) ? (parts as string[]).join(', ') : null;
  }
  return null; // objeto: não é variável de texto
}

function addScalarEntries(
  target: FlowTemplateVariables,
  source: Record<string, unknown> | undefined,
): void {
  for (const [key, raw] of Object.entries(source ?? {})) {
    if (!IDENTIFIER_RE.test(key) || Object.prototype.hasOwnProperty.call(target, key)) continue;
    const text = toText(raw);
    if (text !== null) target[key] = text;
  }
}

function addPayloadEntries(target: FlowTemplateVariables, payload: unknown): void {
  let count = 0;
  const walk = (value: unknown, path: string, depth: number): void => {
    if (count >= MAX_PAYLOAD_VARIABLES) return;
    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      if (depth >= MAX_PAYLOAD_DEPTH) return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (!IDENTIFIER_RE.test(key) && !/^\d+$/.test(key)) continue;
        walk(child, `${path}.${key}`, depth + 1);
      }
      return;
    }
    if (Array.isArray(value)) {
      const joined = toText(value);
      if (joined !== null) {
        target[path] = joined;
        count += 1;
      }
      value.forEach((child, index) => {
        if (child && typeof child === 'object') {
          if (depth < MAX_PAYLOAD_DEPTH) walk(child, `${path}.${index}`, depth + 1);
        }
      });
      return;
    }
    const text = toText(value);
    if (text !== null) {
      target[path] = text;
      count += 1;
    }
  };
  if (payload && typeof payload === 'object') walk(payload, 'payload', 0);
}

export function buildFlowTemplateVariables(
  ctx: FlowExecutionContext,
  options: { frontendUrl?: string } = {},
): FlowTemplateVariables {
  const frontendUrl = (options.frontendUrl ?? '').replace(/\/$/, '');
  const solicitation = ctx.solicitation;
  const submission = ctx.submission ?? solicitation?.submission ?? undefined;

  const requesterName =
    solicitation?.submission?.responderName ??
    solicitation?.submission?.responderEmail ??
    solicitation?.createdByUser?.fullName ??
    '';
  const requesterEmail =
    solicitation?.submission?.responderEmail ?? solicitation?.createdByUser?.email ?? '';

  const variables: FlowTemplateVariables = {
    form_name: ctx.form?.name ?? '',
    responder_name: ctx.submission?.responderName ?? '',
    responder_email: ctx.submission?.responderEmail ?? '',
    submitted_at:
      submission?.submittedAt instanceof Date
        ? (toText(submission.submittedAt) ?? '')
        : '',
    solicitation_number: solicitation?.id ?? '',
    solicitation_title: solicitation?.title ?? '',
    solicitation_status: solicitation?.status ?? '',
    solicitation_priority: solicitation?.priority ?? '',
    solicitation_requester_name: requesterName,
    solicitation_requester_email: requesterEmail,
    solicitation_responsible_name: solicitation?.assignee?.fullName ?? '',
    tracking_url: solicitation?.trackingToken
      ? `${frontendUrl}/acompanhar/${solicitation.trackingToken}`
      : '',
    approval_link: ctx.approval ? `${frontendUrl}/aprovacoes?id=${encodeURIComponent(ctx.approval.id)}` : '',
    approval_status: ctx.approval?.status ?? '',
    approval_title: ctx.approval?.title ?? '',
    approval_description: ctx.approval?.description ?? '',
  };

  // Escolha: `{{campo}}` é o rótulo e `{{campo_valor}}` o valor interno (campo de verdade com esse
  // nome ganha). Ver flow-field-labels.ts.
  for (const [code, label] of Object.entries(ctx.fieldLabels ?? {})) {
    if (!IDENTIFIER_RE.test(code) || Object.prototype.hasOwnProperty.call(variables, code)) continue;
    variables[code] = label;
    const valueKey = `${code}${CHOICE_VALUE_SUFFIX}`;
    if (!Object.prototype.hasOwnProperty.call(ctx.fields ?? {}, valueKey)) {
      variables[valueKey] = toText(ctx.fields?.[code]) ?? '';
    }
  }
  addScalarEntries(variables, ctx.fields);
  addScalarEntries(variables, ctx.metadata as Record<string, unknown> | undefined);
  addPayloadEntries(variables, ctx.metadata?.payload);
  return variables;
}
