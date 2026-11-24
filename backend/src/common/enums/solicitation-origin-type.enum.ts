export enum SolicitationOriginType {
  MANUAL = 'manual',
  FORM_SUBMISSION = 'form_submission',
  WEBHOOK = 'webhook',
  /** Encaminhada por um fluxo a partir de um card de outro processo, com as respostas copiadas. */
  PROCESS_HANDOFF = 'process_handoff',
}
