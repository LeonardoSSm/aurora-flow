import {
  countActive,
  dayEndIso,
  dayStartIso,
  defaultReportConfig,
  describeFilter,
  describePeriod,
  EMPTY_FILTERS,
  moveItem,
  presetDays,
  sanitizeColumns,
  sanitizeReportConfig,
  toRequestFilters,
} from './records-lib';
import type { RecordColumn } from '../types';

const phase: RecordColumn = {
  key: 'sys:phase',
  label: 'Fase',
  group: 'system',
  filter: 'choice',
  options: [
    { value: 'p1', label: 'Análise' },
    { value: 'p2', label: 'Execução' },
  ],
};

describe('período', () => {
  const now = new Date(2026, 10, 14, 15, 30); // 14/11/2026

  it('atalhos contam a partir de hoje, no fuso de quem usa', () => {
    expect(presetDays('today', now)).toEqual({ from: '2026-11-14', to: '2026-11-14' });
    expect(presetDays('last7', now)).toEqual({ from: '2026-11-08', to: '2026-11-14' });
    expect(presetDays('thisMonth', now)).toEqual({ from: '2026-11-01', to: '2026-11-14' });
    expect(presetDays('lastMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetDays('all', now)).toBeNull();
  });

  it('o dia vira o início e o fim do dia local', () => {
    expect(new Date(dayStartIso('2026-11-14') ?? '').getHours()).toBe(0);
    const end = new Date(dayEndIso('2026-11-14') ?? '');
    expect([end.getHours(), end.getMinutes(), end.getDate()]).toEqual([23, 59, 14]);
    expect(dayStartIso('14/11/2026')).toBeUndefined();
  });

  it('descreve o período para o chip', () => {
    expect(describePeriod({ dateField: 'createdAt', fromDay: '2026-11-01', toDay: '2026-11-14' })).toBe(
      'Aberto de 01/11/2026 a 14/11/2026',
    );
    expect(describePeriod({ dateField: 'updatedAt', fromDay: '2026-11-14', toDay: '2026-11-14' })).toBe(
      'Atualizado em 14/11/2026',
    );
    expect(describePeriod({ dateField: 'createdAt', fromDay: '', toDay: '' })).toBeNull();
  });
});

describe('filtros', () => {
  it('só manda ao servidor o que restringe', () => {
    const request = toRequestFilters({
      ...EMPTY_FILTERS,
      search: '  lote 12 ',
      fromDay: '2026-11-01',
      filters: [
        { key: 'sys:phase', values: ['p1'] },
        { key: 'form:obs', text: '   ' },
        { key: 'form:tipo', values: [] },
        { key: 'form:lote', text: ' L-1 ' },
      ],
    });
    expect(request.search).toBe('lote 12');
    expect(request.from).toBe(dayStartIso('2026-11-01'));
    expect(request.to).toBeUndefined();
    expect(request.filters).toEqual([
      { key: 'sys:phase', values: ['p1'] },
      { key: 'form:lote', text: 'L-1' },
    ]);
    expect(countActive({ ...EMPTY_FILTERS, search: 'x', toDay: '2026-11-01', filters: [{ key: 'a', values: [] }] })).toBe(2);
  });

  it('chip com rótulos das opções, sim/não e texto', () => {
    expect(describeFilter(phase, { key: 'sys:phase', values: ['p1', 'p2'] })).toBe('Fase: Análise, Execução');
    expect(
      describeFilter({ key: 'form:ok', label: 'Conforme?', group: 'form', filter: 'boolean' }, { key: 'form:ok', values: ['false'] }),
    ).toBe('Conforme?: Não');
    expect(describeFilter({ key: 'form:lote', label: 'Lote', group: 'form', filter: 'text' }, { key: 'form:lote', text: 'L-1' })).toBe(
      'Lote contém “L-1”',
    );
    expect(describeFilter(phase, { key: 'sys:phase', values: ['p1', 'p2', 'x', 'y'] })).toBe('Fase: Análise, Execução e mais 2');
  });
});

describe('colunas e relatório', () => {
  const meta = { columns: [phase, { ...phase, key: 'sys:title', label: 'Título' }], defaultColumns: ['sys:title', 'sys:phase'] };

  it('colunas guardadas que sumiram caem fora; nada sobrando volta ao padrão', () => {
    expect(sanitizeColumns(['sys:phase', 'form:sumiu'], meta)).toEqual(['sys:phase']);
    expect(sanitizeColumns(['form:sumiu'], meta)).toEqual(['sys:title', 'sys:phase']);
    expect(sanitizeColumns(null, meta)).toEqual(['sys:title', 'sys:phase']);
  });

  it('o montador começa com as colunas da tela', () => {
    const config = defaultReportConfig('Compras', ['sys:title', 'sys:phase']);
    expect(config).toMatchObject({ title: 'Registros · Compras', orientation: 'portrait', layout: 'table' });
    expect(config.columns).toEqual([{ key: 'sys:title' }, { key: 'sys:phase' }]);
  });

  it('modelo com coluna que o processo perdeu: a coluna some sem erro', () => {
    const config = {
      ...defaultReportConfig('X', ['sys:title', 'form:sumiu']),
      groupBy: 'form:sumiu',
      sortBy: 'sys:title',
    };
    const clean = sanitizeReportConfig(config, meta.columns);
    expect(clean.columns).toEqual([{ key: 'sys:title' }]);
    expect(clean.groupBy).toBeNull();
    expect(clean.sortBy).toBe('sys:title');
  });

  it('move item na lista sem perder ninguém', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});
