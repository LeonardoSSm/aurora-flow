import { moveBackBarrier, moveBackMessage } from './phase-move-back';

describe('ponto sem volta (moveBackBarrier)', () => {
  // Triagem (0) → Aprovado (1, ponto sem volta) → Produção (2) → Entregue (3, ponto sem volta)
  const phases = [
    { id: 'p-tri', label: 'Triagem', order: 0, blockMoveBack: false },
    { id: 'p-apr', label: 'Aprovado', order: 1, blockMoveBack: true },
    { id: 'p-prod', label: 'Produção', order: 2 },
    { id: 'p-ent', label: 'Entregue', order: 3, blockMoveBack: true },
  ];

  it('avançar nunca é segurado', () => {
    expect(moveBackBarrier(phases, 0, 3)).toBeNull();
    expect(moveBackBarrier(phases, 2, 2)).toBeNull();
  });

  it('voltar para antes do ponto sem volta é segurado, inclusive saindo da própria fase marcada', () => {
    expect(moveBackBarrier(phases, 2, 0)?.id).toBe('p-apr');
    expect(moveBackBarrier(phases, 1, 0)?.id).toBe('p-apr');
  });

  it('voltar ATÉ o ponto sem volta (ou entre fases sem marca depois dele) pode', () => {
    expect(moveBackBarrier(phases, 2, 1)).toBeNull();
  });

  it('cruzando dois pontos, vale o mais à frente', () => {
    expect(moveBackBarrier(phases, 3, 0)?.id).toBe('p-ent');
    expect(moveBackBarrier(phases, 3, 2)?.id).toBe('p-ent');
  });

  it('sem nenhuma fase marcada, voltar é livre (como antes)', () => {
    expect(moveBackBarrier(phases.map((p) => ({ ...p, blockMoveBack: false })), 3, 0)).toBeNull();
  });

  it('a mensagem nomeia a fase', () => {
    expect(moveBackMessage({ label: 'Aprovado' })).toContain('"Aprovado", que é um ponto sem volta');
  });
});
