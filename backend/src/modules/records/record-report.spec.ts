import { BadRequestException } from '@nestjs/common';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import type { FormFieldEntity } from '../../database/entities';
import {
  collectFormFields,
  formatRecordValue,
  formColumns,
  phaseColumns,
  systemColumns,
  type RecordColumn,
  type ValueField,
} from './record-columns';
import { normalizeReportConfig } from './record-report-config';
import { buildReportDocument, groupRows, renderPdf, sortRows, type ReportRow } from './record-report-pdf';
import { csvCell, storedVariant } from './records.service';

const empty = { valueText: null, valueNumber: null, valueBoolean: null, valueJson: null };
const field = (fieldType: string, options: Array<[string, string]> = [], settingsJson: Record<string, unknown> = {}): ValueField => ({
  fieldType,
  options: options.map(([internalValue, displayLabel]) => ({ internalValue, displayLabel })),
  settingsJson,
});

describe('formatRecordValue', () => {
  it('mostra o rótulo da opção escolhida, não o valor interno', () => {
    const select = field(FormFieldType.SINGLE_SELECT, [['urg', 'Urgente']]);
    expect(formatRecordValue({ ...empty, valueText: 'urg' }, select)).toBe('Urgente');
    const multi = field(FormFieldType.MULTI_SELECT, [['a', 'Alfa'], ['b', 'Beta']]);
    expect(formatRecordValue({ ...empty, valueJson: ['a', 'b'] }, multi)).toBe('Alfa, Beta');
  });

  it('formata data, data e hora, moeda, sim/não e número no padrão brasileiro', () => {
    expect(formatRecordValue({ ...empty, valueText: '2026-11-03' }, field(FormFieldType.DATE))).toBe('03/11/2026');
    expect(formatRecordValue({ ...empty, valueText: '2026-11-03T15:30:00.000Z' }, field(FormFieldType.DATETIME))).toBe(
      '03/11/2026, 12:30',
    );
    expect(formatRecordValue({ ...empty, valueNumber: 1234.5 }, field(FormFieldType.CURRENCY))).toMatch(/^R\$\s1\.234,50$/);
    expect(formatRecordValue({ ...empty, valueBoolean: true }, field(FormFieldType.CHECKBOX))).toBe('Sim');
    expect(formatRecordValue({ ...empty, valueNumber: 1500 }, field(FormFieldType.NUMBER))).toBe('1.500');
  });

  it('usa prefixo, sufixo e casas do campo calculado', () => {
    const calc = field(FormFieldType.CALCULATED, [], { formulaPrefix: 'R$ ', formulaDecimals: 1 });
    expect(formatRecordValue({ ...empty, valueNumber: 10 }, calc)).toBe('R$ 10,0');
  });

  it('resume a tabela do ERP / pedido de itens numa linha', () => {
    const snapshot = {
      schemaVersion: 1,
      total: 7,
      columns: {
        source: [{ key: 'nome', label: 'Item' }],
        input: [{ id: 'qtd', label: 'Quantidade' }, { id: '__subtotal', label: 'Subtotal' }],
      },
      rows: [
        { sourceValues: { nome: 'Parafuso' }, answers: { qtd: 2, __subtotal: 2 } },
        { sourceValues: { nome: 'Porca' }, answers: { qtd: 5 } },
      ],
    };
    expect(formatRecordValue({ ...empty, valueJson: snapshot }, field(FormFieldType.ITEM_ORDER))).toBe(
      'Parafuso (Quantidade: 2); Porca (Quantidade: 5) · Total: 7',
    );
  });

  it('valor vazio vira texto vazio (a tabela mostra traço)', () => {
    expect(formatRecordValue(empty, field(FormFieldType.SHORT_TEXT))).toBe('');
  });
});

describe('colunas', () => {
  const formField = (code: string, label: string, extra: Partial<FormFieldEntity> = {}): FormFieldEntity =>
    ({ code, label, fieldType: FormFieldType.SHORT_TEXT, order: 0, settingsJson: {}, isSensitive: false, options: [], ...extra }) as FormFieldEntity;

  it('um campo por código, com o rótulo da versão mais nova e as opções de todas', () => {
    const fields = collectFormFields([
      {
        versionNumber: 1,
        sectionOrder: 0,
        field: formField('tipo', 'Tipo antigo', {
          fieldType: FormFieldType.SINGLE_SELECT,
          options: [{ internalValue: 'x', displayLabel: 'Velho', order: 0 }] as FormFieldEntity['options'],
        }),
      },
      {
        versionNumber: 2,
        sectionOrder: 0,
        field: formField('tipo', 'Tipo', {
          fieldType: FormFieldType.SINGLE_SELECT,
          options: [{ internalValue: 'y', displayLabel: 'Novo', order: 0 }] as FormFieldEntity['options'],
        }),
      },
      { versionNumber: 2, sectionOrder: 0, field: formField('titulo', 'Seção', { fieldType: FormFieldType.TITLE }) },
      { versionNumber: 2, sectionOrder: 1, field: formField('cpf', 'CPF', { isSensitive: true }) },
    ]);
    expect([...fields.keys()]).toEqual(['tipo', 'cpf']);
    expect(fields.get('tipo')?.label).toBe('Tipo');
    expect(fields.get('tipo')?.options.map((option) => option.displayLabel)).toEqual(['Novo', 'Velho']);

    const masked = formColumns(fields, false);
    expect(masked.find((column) => column.key === 'form:cpf')).toMatchObject({ masked: true, filter: 'none' });
    expect(masked.find((column) => column.key === 'form:tipo')).toMatchObject({ filter: 'choice' });
    expect(formColumns(fields, true).find((column) => column.key === 'form:cpf')).toMatchObject({ filter: 'text' });
  });

  it('campos de fase seguem a ordem das fases e não repetem código', () => {
    const phases = [
      { id: 'p2', label: 'Execução', order: 2 },
      { id: 'p1', label: 'Análise', order: 1 },
    ];
    const { columns } = phaseColumns(phases, [
      { phaseId: 'p2', code: 'obs', label: 'Obs execução', fieldType: FormFieldType.LONG_TEXT, order: 0, optionsJson: null, settingsJson: null },
      { phaseId: 'p1', code: 'obs', label: 'Obs análise', fieldType: FormFieldType.LONG_TEXT, order: 0, optionsJson: null, settingsJson: null },
      {
        phaseId: 'p1',
        code: 'ok',
        label: 'Aprovado?',
        fieldType: FormFieldType.SINGLE_SELECT,
        order: 1,
        optionsJson: [{ value: 's', label: 'Sim' }],
        settingsJson: null,
      },
    ]);
    expect(columns.map((column) => [column.key, column.phaseLabel])).toEqual([
      ['phase:obs', 'Análise'],
      ['phase:ok', 'Análise'],
    ]);
    expect(columns[1].options).toEqual([{ value: 's', label: 'Sim' }]);
  });
});

describe('normalizeReportConfig', () => {
  it('completa o que falta e descarta coluna repetida', () => {
    const config = normalizeReportConfig({ columns: [{ key: 'sys:title' }, 'sys:title', { key: 'form:x', label: ' Valor ' }] });
    expect(config).toMatchObject({
      layout: 'table',
      orientation: 'landscape',
      sortDir: 'asc',
      showSummary: true,
      showFilters: true,
      columns: [{ key: 'sys:title' }, { key: 'form:x', label: 'Valor' }],
    });
  });

  it('recusa configuração sem coluna ou com chave estranha', () => {
    expect(() => normalizeReportConfig({ columns: [] })).toThrow(BadRequestException);
    expect(() => normalizeReportConfig({ columns: [{ key: 'drop table' }] })).toThrow(BadRequestException);
    expect(() => normalizeReportConfig({ columns: [{ key: 'sys:title' }], groupBy: 'x' })).toThrow(BadRequestException);
  });
});

describe('relatório', () => {
  const row = (values: Record<string, string>, sortValues: Record<string, string | number> = {}): ReportRow => ({
    values,
    sortValues,
  });
  const rows = [
    row({ 'sys:title': 'B', 'sys:phase': 'Execução', 'form:valor': '10' }, { 'form:valor': 10, 'sys:phase': 2 }),
    row({ 'sys:title': 'A', 'sys:phase': 'Análise', 'form:valor': '9' }, { 'form:valor': 9, 'sys:phase': 1 }),
    row({ 'sys:title': 'C', 'sys:phase': 'Análise', 'form:valor': '' }, { 'sys:phase': 1 }),
  ];

  it('ordena por número quando há, com vazio sempre no fim', () => {
    expect(sortRows(rows, 'form:valor', 'asc').map((r) => r.values['sys:title'])).toEqual(['A', 'B', 'C']);
    expect(sortRows(rows, 'form:valor', 'desc').map((r) => r.values['sys:title'])).toEqual(['B', 'A', 'C']);
  });

  it('agrupa por fase na ordem do Kanban', () => {
    const groups = groupRows(rows, 'sys:phase', ['Análise', 'Execução']);
    expect(groups.map((group) => [group.label, group.rows.length])).toEqual([
      ['Análise', 2],
      ['Execução', 1],
    ]);
  });

  const catalog: RecordColumn[] = [
    ...systemColumns({ phases: [], assignees: [], statuses: [] }),
    { key: 'form:valor', label: 'Valor', group: 'form', filter: 'text' },
  ];
  const context = {
    processName: 'Compras',
    generatedAt: '14/11/2026, 10:00',
    generatedBy: 'Helena',
    filters: ['Fase: Análise'],
    phaseOrder: ['Análise', 'Execução'],
  };

  it('monta grupos, resumo, filtros e títulos de coluna trocados', () => {
    const config = normalizeReportConfig({
      title: 'Pedidos',
      columns: [{ key: 'sys:title', label: 'Pedido' }, { key: 'sys:phase' }, { key: 'form:valor' }, { key: 'form:sumiu' }],
      groupBy: 'sys:phase',
    });
    const doc = buildReportDocument(config, catalog, rows, context);
    const text = JSON.stringify(doc.content);
    expect(text).toContain('"Pedidos"');
    expect(text).toContain('Filtros: Fase: Análise');
    expect(text).toContain('"Pedido"');
    expect(text).toContain('Resumo');
    // Agrupado por fase: a coluna Fase sai da tabela (já está no título do grupo) e a que não existe é ignorada.
    const tables = (doc.content as Array<Record<string, unknown>>).filter((item) => 'table' in item);
    const header = ((tables[0].table as { body: Array<Array<{ text: string }>> }).body[0]).map((cell) => cell.text);
    expect(header).toEqual(['Pedido', 'Valor']);
  });

  it('gera um PDF de verdade, em tabela e em ficha', async () => {
    for (const layout of ['table', 'cards']) {
      const config = normalizeReportConfig({ layout, columns: [{ key: 'sys:title' }, { key: 'form:valor' }], groupBy: 'sys:phase' });
      const buffer = await renderPdf(buildReportDocument(config, catalog, rows, context));
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.length).toBeGreaterThan(1000);
    }
  });
});

describe('storedVariant (filtro de texto digitado como a tela mostra)', () => {
  it('traduz data e número brasileiros para o formato guardado', () => {
    expect(storedVariant('03/11/2026')).toBe('2026-11-03');
    expect(storedVariant('3/11')).toBe('-11-03');
    expect(storedVariant('83,3')).toBe('83.3');
    expect(storedVariant('1.234,5')).toBe('1234.5');
    expect(storedVariant('Frango')).toBeNull();
    expect(storedVariant('83')).toBeNull();
  });
});

describe('csvCell', () => {
  it('põe aspas quando há separador, aspas ou quebra e neutraliza fórmula', () => {
    expect(csvCell('simples')).toBe('simples');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('linha\nnova')).toBe('"linha\nnova"');
    expect(csvCell('=SOMA(A1)')).toBe("'=SOMA(A1)");
  });
});
