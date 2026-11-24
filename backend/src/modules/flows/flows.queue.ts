import type { FlowTriggerNodeType } from './types/flow.types';

import { DEFAULT_FLOW_QUEUE } from '../../common/constants/product';

export const DEFAULT_FLOW_SUBMISSION_QUEUE = DEFAULT_FLOW_QUEUE;

export type FlowSubmissionJob = {
  kind?: 'submission';
  submissionId: string;
  formId: string;
  formVersionId: string;
  emittedAt: string;
};

export type FlowContextJob = {
  kind: 'flow_context';
  flowId: string;
  triggerType: FlowTriggerNodeType;
  /**
   * Nó gatilho (do tipo `triggerType`) por onde a execução entra. Ausente em jobs publicados
   * antes de existirem vários gatilhos por fluxo — aí vale o primeiro gatilho desse tipo.
   */
  entryNodeId?: string | null;
  eventName: string;
  submissionId?: string | null;
  solicitationId?: string | null;
  approvalId?: string | null;
  /** Anexo que disparou o fluxo (trigger_attachment_uploaded) — carrega ctx.attachment. */
  attachmentId?: string | null;
  actorId?: string | null;
  flowEventDepth?: number;
  metadata?: Record<string, unknown>;
  emittedAt: string;
};

/**
 * Retoma uma FlowExecutionEntity parada em action_create_approval (status 'waiting_approval'),
 * agora que a aprovação (approvalId) foi decidida. Publicado por FlowsApprovalListener ao lado
 * dos FlowContextJob normais de trigger_approval_completed — são independentes: um continua a
 * MESMA execução pausada, o outro pode iniciar fluxos novos que reagem à decisão.
 */
export type FlowResumeJob = {
  kind: 'flow_resume';
  executionId: string;
  approvalId: string;
  emittedAt: string;
};

/**
 * Retoma uma FlowExecutionEntity parada em action_wait_for_phase_fields (status
 * 'waiting_phase_fields'), agora que a fase esperada (`metadata.phaseId`) teve seus campos
 * salvos. Espelha FlowResumeJob, trocando a decisão de aprovação pelo evento de campos de fase
 * salvos — `metadata` carrega phaseId/phaseLabel/approverRoleCode frescos da fase recém-salva.
 */
export type FlowResumePhaseFieldsJob = {
  kind: 'flow_resume_phase_fields';
  executionId: string;
  metadata: Record<string, unknown>;
  emittedAt: string;
};

export type FlowQueueJob =
  | FlowSubmissionJob
  | FlowContextJob
  | FlowResumeJob
  | FlowResumePhaseFieldsJob;

export function isFlowContextJob(job: FlowQueueJob | null | undefined): job is FlowContextJob {
  return job?.kind === 'flow_context';
}

export function isFlowResumeJob(job: FlowQueueJob | null | undefined): job is FlowResumeJob {
  return job?.kind === 'flow_resume';
}

export function isFlowResumePhaseFieldsJob(
  job: FlowQueueJob | null | undefined,
): job is FlowResumePhaseFieldsJob {
  return job?.kind === 'flow_resume_phase_fields';
}
