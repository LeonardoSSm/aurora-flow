import { describe, expect, it } from 'vitest';
import { moveBackBarrier, moveBackMessage } from './phase-move-back';

describe('ponto sem volta no quadro (moveBackBarrier)', () => {
  // Triagem → Aprovado (sem volta) → Produção → Entregue (sem volta)
  const columns = [
    { id: 'tri', label: 'Triagem' },
    { id: 'apr', label: 'Aprovado', blockMoveBack: true },
    { id: 'prod', label: 'Produção' },
    { id: 'ent', label: 'Entregue', blockMoveBack: true },
  ];

  it('avançar nunca é segurado', () => {
    expect(moveBackBarrier(columns, 'tri', 'ent')).toBeNull();
  });

  it('voltar para antes da fase marcada é segurado, inclusive saindo dela', () => {
    expect(moveBackBarrier(columns, 'prod', 'tri')?.id).toBe('apr');
    expect(moveBackBarrier(columns, 'apr', 'tri')?.id).toBe('apr');
  });

  it('voltar até a fase marcada pode', () => {
    expect(moveBackBarrier(columns, 'prod', 'apr')).toBeNull();
  });

  it('cruzando duas, vale a mais à frente', () => {
    expect(moveBackBarrier(columns, 'ent', 'tri')?.id).toBe('ent');
  });

  it('coluna desconhecida não segura nada', () => {
    expect(moveBackBarrier(columns, 'x', 'tri')).toBeNull();
  });

  it('mensagem igual à do servidor', () => {
    expect(moveBackMessage({ label: 'Aprovado' })).toBe(
      'O card já chegou à fase "Aprovado", que é um ponto sem volta: ele não pode voltar para uma fase anterior a ela. Quem configura as fases do processo pode devolvê-lo.',
    );
  });
});
