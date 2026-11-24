/**
 * Espelho no web do "ponto sem volta" (`blockMoveBack`, backend kanban-phases/phase-move-back.ts):
 * depois que o card chega a uma fase marcada, ele não volta para uma fase anterior a ela. Serve só
 * para o quadro não oferecer nem tentar o movimento — quem garante é o backend, que também deixa
 * passar quem configura as fases e as automações do processo.
 */

type ColumnLike = { id: string; label: string; blockMoveBack?: boolean };

/**
 * A coluna que segura a volta de `fromId` para `toId` (as colunas vêm na ordem das fases): a
 * marcada mais à frente entre o destino (exclusive) e a atual (inclusive). Null = pode ir.
 */
export function moveBackBarrier<T extends ColumnLike>(columns: readonly T[], fromId: string, toId: string): T | null {
  const from = columns.findIndex((c) => c.id === fromId);
  const to = columns.findIndex((c) => c.id === toId);
  if (from < 0 || to < 0 || to >= from) return null;
  for (let i = from; i > to; i -= 1) {
    if (columns[i].blockMoveBack === true) return columns[i];
  }
  return null;
}

export function moveBackMessage(barrier: Pick<ColumnLike, 'label'>): string {
  return `O card já chegou à fase "${barrier.label}", que é um ponto sem volta: ele não pode voltar para uma fase anterior a ela. Quem configura as fases do processo pode devolvê-lo.`;
}
