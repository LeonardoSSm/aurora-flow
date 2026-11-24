/**
 * Ponto sem volta (`blockMoveBack` da fase): depois que o card chega a uma fase marcada (ou passa
 * dela), ele não volta para uma fase anterior a ela. Regra pura, usada por
 * `SolicitationsService.movePhase`; o web tem o espelho em kanban-phases/lib/phase-move-back.ts.
 *
 * Quem pode passar por cima (quem configura as fases, o processo) é decidido por quem chama.
 */

export type MoveBackPhaseLike = {
  id: string;
  label: string;
  order: number;
  blockMoveBack?: boolean | null;
};

/**
 * A fase que segura a volta do card de `fromOrder` para `toOrder`: a marcada mais à frente entre
 * o destino (exclusive) e a fase atual (inclusive). Voltar ATÉ a fase marcada pode; para antes
 * dela, não. Null = o card pode ir (não é volta, ou não cruza nenhum ponto sem volta).
 */
export function moveBackBarrier<T extends MoveBackPhaseLike>(
  phases: readonly T[],
  fromOrder: number,
  toOrder: number,
): T | null {
  if (toOrder >= fromOrder) return null;
  let barrier: T | null = null;
  for (const phase of phases) {
    if (phase.blockMoveBack !== true) continue;
    if (phase.order <= toOrder || phase.order > fromOrder) continue;
    if (!barrier || phase.order > barrier.order) barrier = phase;
  }
  return barrier;
}

export function moveBackMessage(barrier: Pick<MoveBackPhaseLike, 'label'>): string {
  return `O card já chegou à fase "${barrier.label}", que é um ponto sem volta: ele não pode voltar para uma fase anterior a ela. Quem configura as fases do processo pode devolvê-lo.`;
}
