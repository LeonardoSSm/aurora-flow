/**
 * Falha de nó que carrega o `output` do que já aconteceu (ex.: o id da notificação e a contagem de
 * destinatários que falharam). O motor grava esse `output` no `NodeExecutionResult` do nó
 * `failed` — assim a falha continua rastreável na execução, sem perder o contexto.
 */
export class NodeFailureError extends Error {
  constructor(
    message: string,
    readonly output?: unknown,
  ) {
    super(message);
    this.name = 'NodeFailureError';
  }
}
