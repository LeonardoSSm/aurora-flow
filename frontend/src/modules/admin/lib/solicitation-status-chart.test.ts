import { describe, expect, it } from 'vitest';
import { buildStatusChart, countActiveSolicitations } from './solicitation-status-chart';

describe('buildStatusChart', () => {
  it('junta código antigo e novo numa barra só (sem "Nova" duplicada)', () => {
    const rows = buildStatusChart({ new: 100, open: 5, completed: 3, resolved: 1 });
    expect(rows.map((r) => r.label)).toEqual(['Nova', 'Concluída']);
    expect(rows.find((r) => r.label === 'Nova')?.count).toBe(105);
    expect(rows.find((r) => r.label === 'Concluída')?.count).toBe(4);
  });

  it('status desconhecido aparece com o próprio código', () => {
    expect(buildStatusChart({ algo: 2 })).toEqual([{ label: 'algo', count: 2, color: '#9ca3af' }]);
  });
});

describe('countActiveSolicitations', () => {
  it('desconta concluídas e canceladas, inclusive canceled/resolved antigos', () => {
    expect(
      countActiveSolicitations(20, { new: 10, completed: 3, resolved: 2, cancelled: 1, canceled: 1 }),
    ).toBe(13);
  });
});
