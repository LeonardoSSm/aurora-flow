import { describe, expect, it } from 'vitest';
import type { ResponseItem } from '../types';
import type { ResponseFieldMeta } from './response-formatters';
import { buildResponseScorecard, sortResponseItems } from './response-scorecard';

function meta(overrides: Partial<ResponseFieldMeta> & { position: number; sectionId: string }): ResponseFieldMeta {
  return {
    label: 'Campo',
    fieldType: 'single_select',
    options: [],
    settingsJson: {},
    sectionTitle: overrides.sectionId.toUpperCase(),
    ...overrides,
  };
}

function item(fieldCode: string, valueNumber: number | string | null = null, valueText: string | null = null): ResponseItem {
  return { id: `i-${fieldCode}`, fieldCode, valueText, valueNumber: valueNumber as number | null, valueBoolean: null, valueJson: null };
}

// Formulário com dois caminhos: s1 → (frango: s2, s3) ou (postura: s4), todos terminam no Resultado.
const metaByCode: Record<string, ResponseFieldMeta> = {
  unidade: meta({ position: 0, sectionId: 's1' }),
  q2: meta({ position: 1, sectionId: 's2' }),
  conf_s2: meta({
    position: 2,
    sectionId: 's2',
    fieldType: 'calculated',
    label: 'Conformidade (%) — S2',
    settingsJson: { formula: 'CONFORMIDADE({q2})', formulaDecimals: 1, formulaSuffix: '%', optionScores: { q2: { a: 1, b: 0 } } },
  }),
  q3: meta({ position: 3, sectionId: 's3' }),
  conf_s3: meta({
    position: 4,
    sectionId: 's3',
    fieldType: 'calculated',
    settingsJson: { formula: 'CONFORMIDADE({q3})', formulaDecimals: 1, formulaSuffix: '%' },
  }),
  q4: meta({ position: 5, sectionId: 's4' }),
  conf_s4: meta({
    position: 6,
    sectionId: 's4',
    fieldType: 'calculated',
    settingsJson: { formula: 'CONFORMIDADE({q4})', formulaDecimals: 1, formulaSuffix: '%' },
  }),
  atingiram: meta({
    position: 7,
    sectionId: 'res',
    fieldType: 'calculated',
    label: 'Seções que atingiram o marco',
    settingsJson: { formula: 'ATINGIRAM(70; {conf_s2}; {conf_s3}; {conf_s4})', formulaDecimals: 1, formulaSuffix: '%' },
  }),
  media: meta({
    position: 8,
    sectionId: 'res',
    fieldType: 'calculated',
    label: 'Média',
    settingsJson: { formula: 'MEDIAPREENCHIDOS({conf_s2}; {conf_s3}; {conf_s4})', formulaDecimals: 1, formulaSuffix: '%' },
  }),
};

describe('sortResponseItems', () => {
  it('põe as respostas na ordem do formulário e manda campo desconhecido para o fim', () => {
    const items = [item('conf_s2', 50), item('fantasma'), item('q3'), item('unidade'), item('q2')];
    expect(sortResponseItems(items, metaByCode).map((i) => i.fieldCode)).toEqual([
      'unidade',
      'q2',
      'conf_s2',
      'q3',
      'fantasma',
    ]);
  });
});

describe('buildResponseScorecard', () => {
  // Caminho do frango: s2 pontuada, s3 respondida mas sem nota; s4 (postura) não percorrida.
  const items = [
    item('unidade', null, 'frango'),
    item('q2', null, 'a'),
    item('conf_s2', '100'), // o numeric do Postgres chega como texto
    item('q3', null, 'x'),
    item('atingiram', 100),
    item('media', 100),
  ];

  it('mostra as seções percorridas com nota, marco e "sem nota"; a do outro caminho fica de fora', () => {
    const scorecard = buildResponseScorecard(items, metaByCode);
    expect(scorecard?.mark).toBe(70);
    expect(scorecard?.sections).toEqual([
      { code: 'conf_s2', label: 'S2', value: 100, formatted: '100,0%', percent: true, reachedMark: true, pointsText: '1 de 1 ponto' },
      { code: 'conf_s3', label: 'S3', value: null, formatted: 'Sem nota', percent: true, reachedMark: null, pointsText: null },
    ]);
    expect(scorecard?.results.map((r) => [r.label, r.formatted])).toEqual([
      ['Seções que atingiram o marco', '100,0%'],
      ['Média', '100,0%'],
    ]);
  });

  it('seção abaixo do marco fica marcada como "abaixo"', () => {
    const scorecard = buildResponseScorecard(
      [item('q2', null, 'b'), item('conf_s2', 40), item('atingiram', 0)],
      metaByCode,
    );
    expect(scorecard?.sections[0].reachedMark).toBe(false);
  });

  it('sem marco (sem ATINGIRAM), a nota aparece sem comparação', () => {
    const { atingiram: _atingiram, ...semMarco } = metaByCode;
    const scorecard = buildResponseScorecard([item('q2', null, 'a'), item('conf_s2', 80)], semMarco);
    expect(scorecard?.mark).toBeNull();
    expect(scorecard?.sections[0].reachedMark).toBeNull();
  });

  it('formulário com cálculo comum (ex.: total em R$) não ganha quadro', () => {
    const comum: Record<string, ResponseFieldMeta> = {
      qtd: meta({ position: 0, sectionId: 's1', fieldType: 'number' }),
      total: meta({
        position: 1,
        sectionId: 's1',
        fieldType: 'calculated',
        settingsJson: { formula: '{qtd} * 10', formulaPrefix: 'R$ ' },
      }),
    };
    expect(buildResponseScorecard([item('qtd', 3), item('total', 30)], comum)).toBeNull();
  });

  it('pontos somados (SOMA, sem %) aparecem sem barra', () => {
    const soma: Record<string, ResponseFieldMeta> = {
      p1: meta({ position: 0, sectionId: 's1' }),
      pontos: meta({
        position: 1,
        sectionId: 's1',
        fieldType: 'calculated',
        settingsJson: { formula: 'SOMA({p1})', optionScores: { p1: { a: 10 } } },
      }),
    };
    expect(buildResponseScorecard([item('p1', null, 'a'), item('pontos', 10)], soma)?.sections[0].percent).toBe(false);
  });
});


describe('modo "Pontos"', () => {
  const pontos: Record<string, ResponseFieldMeta> = {
    p1: meta({ position: 0, sectionId: 'iso' }),
    p2: meta({ position: 1, sectionId: 'iso' }),
    piquete: meta({ position: 2, sectionId: 'iso' }),
    multi: meta({ position: 3, sectionId: 'iso' }),
    conf_iso: meta({
      position: 4,
      sectionId: 'iso',
      fieldType: 'calculated',
      settingsJson: {
        formula: 'CONFORMIDADE({p1}; {p2}; {piquete}; {multi})',
        formulaSuffix: '%',
        optionScores: {
          p1: { sim: 1, nao: 0 },
          p2: { sim: 0, nao: 1 }, // negativa
          piquete: { sim: 1, nao: 0, na: null },
          multi: { a: 2, b: 1, c: 0 },
        },
      },
    }),
    conf_bar: meta({
      position: 5,
      sectionId: 'bar',
      fieldType: 'calculated',
      settingsJson: { formula: 'CONFORMIDADE({q})', optionScores: { q: { sim: 1, nao: 0 } } },
    }),
    q: meta({ position: 6, sectionId: 'bar' }),
    geral: meta({
      position: 7,
      sectionId: 'res',
      fieldType: 'calculated',
      label: 'Atingiram',
      settingsJson: { formula: 'ATINGIRAM(70; {conf_iso}; {conf_bar})', formulaSuffix: '%' },
    }),
    media: meta({
      position: 8,
      sectionId: 'res',
      fieldType: 'calculated',
      label: 'Média',
      settingsJson: { formula: 'MEDIAPREENCHIDOS({conf_iso}; {conf_bar})', formulaSuffix: '%' },
    }),
  };
  const items = [
    item('p1', null, 'sim'),
    item('p2', null, 'sim'), // negativa respondida "sim": 0 de 1
    item('piquete', null, 'na'), // não conta
    { ...item('multi'), valueJson: ['a', 'b'] }, // 3 de 3
    item('conf_iso', '80'),
    item('q', null, 'nao'),
    item('conf_bar', '0'),
    item('geral', '50'),
    item('media', '40'),
  ];

  it('pontos de cada seção com a regra da CONFORMIDADE (N/A fora, negativa invertida, várias marcadas)', () => {
    const scorecard = buildResponseScorecard(items, pontos);
    expect(scorecard?.sections.map((row) => [row.label, row.pointsText])).toEqual([
      ['ISO', '4 de 5 pontos'],
      ['BAR', '0 de 1 ponto'],
    ]);
  });

  it('o % de seções no marco vira "x de y seções"; a média continua em %', () => {
    const scorecard = buildResponseScorecard(items, pontos);
    expect(scorecard?.results.map((row) => [row.label, row.pointsText])).toEqual([
      ['Atingiram', '1 de 2 seções'],
      ['Média', null],
    ]);
  });
});
