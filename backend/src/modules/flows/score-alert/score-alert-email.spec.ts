import { EMAIL_INLINE_IMAGES } from '../../notifications/email-assets/email-inline-images';
import {
  SCORE_ALERT_BACKGROUND_CID,
  SCORE_ALERT_LOGO_CID,
  buildScoreAlertEmailHtml,
  buildScoreOverview,
  scoreAlertPreheader,
} from './score-alert-email';
import type { ScoreAlert, ScoreAlertField } from './score-alert';

function field(code: string, sectionTitle: string, order: number, settingsJson: Record<string, unknown>): ScoreAlertField {
  return { code, label: `Campo ${code}`, sectionTitle, sectionOrder: order, order: 1, settingsJson };
}

const fields: ScoreAlertField[] = [
  field('iso', 'Isolamento', 1, { scoreMode: 'section' }),
  field('bar', 'Barreira <crítica>', 2, { scoreMode: 'section', scoreLimit: 80 }),
  field('agua', 'Água', 3, { scoreMode: 'section' }),
  field('reg', 'Registros', 4, { scoreMode: 'section' }),
  field('media', 'RESULTADO', 9, {
    scoreMode: 'result',
    scoreMark: 70,
    scoreAlert: { enabled: true, sectionsBelow: true, resultBelow: 80, channel: 'email', recipients: [{ type: 'custom', value: 'a@b.c' }] },
  }),
];
const values = new Map<string, number | null>([
  ['iso', 83.3],
  ['bar', 75],
  ['agua', 50],
  ['reg', null],
  ['media', 69.4],
]);

const alert: ScoreAlert = {
  channel: 'email',
  recipients: [{ type: 'custom', value: 'a@b.c' }],
  sectionsBelow: [
    { label: 'Barreira <crítica>', value: 75, limit: 80 },
    { label: 'Água', value: 50, limit: 70 },
  ],
  resultsBelow: [{ label: 'Campo media', value: 69.4, limit: 80 }],
  backgroundImageId: null,
  always: false,
  labelFieldCode: null,
  subject: null,
};

describe('buildScoreOverview', () => {
  it('todas as seções com nota, com o limite de cada uma; sem nota fica de fora', () => {
    expect(buildScoreOverview(fields, values)).toEqual({
      sections: [
        { label: 'Isolamento', value: 83.3, limit: 70, below: false },
        { label: 'Barreira <crítica>', value: 75, limit: 80, below: true },
        { label: 'Água', value: 50, limit: 70, below: true },
      ],
      results: [{ label: 'Campo media', value: 69.4, limit: 80, below: true }],
    });
  });
});

describe('buildScoreAlertEmailHtml', () => {
  const context = {
    formName: 'Checklist <script>alert(1)</script>',
    responderName: 'Ana "Auditora"',
    submittedAt: new Date('2026-10-21T18:55:00Z'),
    link: 'https://flow.exemplo.com/respostas/f1?x=1&y=2',
  };
  const html = buildScoreAlertEmailHtml(alert, buildScoreOverview(fields, values), context);

  it('escapa tudo que vem de dados (formulário, quem respondeu, seção)', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('Checklist &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Ana &quot;Auditora&quot;');
    expect(html).toContain('Barreira &lt;crítica&gt;');
  });

  it('tabela com nota e limite; linha abaixo do limite em vermelho com "abaixo"; resumo no topo', () => {
    expect(html).toContain('Notas por seção');
    expect(html).toMatch(/bgcolor="#fdecec"[^>]*>Barreira &lt;crítica&gt;<\/td>\n<td[^>]*>75%<br><span[^>]*>abaixo<\/span><\/td>\n<td[^>]*>80%<\/td>/);
    expect(html).toMatch(/bgcolor="#ffffff"[^>]*>Isolamento<\/td>\n<td[^>]*>83,3%<\/td>\n<td[^>]*>70%<\/td>/);
    expect(html).toContain('2 seções ficaram abaixo do limite e resultado abaixo do mínimo.');
    expect(html).toMatch(/bgcolor="#fdecec"[^>]*>Campo media<\/td>\n<td[^>]*>69,4%<br>/);
  });

  it('identidade visual à prova de Gmail: arte embutida (cid) de fundo atrás do cartão, cores por bgcolor/background-color', () => {
    // Fundo de cor junto: se a imagem não vier, fica o cinza da marca.
    expect(html).toContain(
      `background="cid:${SCORE_ALERT_BACKGROUND_CID}" bgcolor="#e6e7e9" style="background-color:#e6e7e9;background-image:url('cid:${SCORE_ALERT_BACKGROUND_CID}');`,
    );
    // A arte que o canal de e-mail anexa é justamente a que o HTML pede.
    expect(EMAIL_INLINE_IMAGES[SCORE_ALERT_BACKGROUND_CID]).toBeDefined();
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/[;"\s]background:/);
    const fills = html.match(/background-color:#[0-9a-f]{6}/g) ?? [];
    const attrs = html.match(/bgcolor="#[0-9a-f]{6}"/g) ?? [];
    // Toda célula com fundo tem o atributo; o link do botão repete a cor sem atributo (não existe em <a>).
    expect(attrs.length).toBe(fills.length - 1);
  });

  it('rodapé com a marca do Tijuca Flow (cid registrado, selo branco) e sem o texto técnico de configuração', () => {
    expect(html).toContain(`background="cid:${SCORE_ALERT_LOGO_CID}" bgcolor="#ffffff"`);
    expect(EMAIL_INLINE_IMAGES[SCORE_ALERT_LOGO_CID]).toEqual(expect.objectContaining({ contentType: 'image/png' }));
    expect(html).toContain('>Tijuca Flow</td>');
    expect(html).toContain('Aviso automático do Tijuca Flow<br>Tijuca Alimentos');
    expect(html).not.toContain('configurado no campo');
  });

  it('texto de prévia escondido logo no início do corpo: quem respondeu, seções abaixo e o resultado com o mínimo', () => {
    const overview = buildScoreOverview(fields, values);
    expect(scoreAlertPreheader(alert, overview, { responderName: 'Frango Tropical' })).toBe(
      'Frango Tropical: 2 seções abaixo do limite · Campo media 69,4% (mínimo 80%)',
    );
    // Rótulo com "(%)" no fim não repete o símbolo; uma seção só fica no singular.
    const umaSecao = { ...alert, sectionsBelow: alert.sectionsBelow.slice(0, 1) };
    const comPercent = { ...overview, results: overview.results.map((row) => ({ ...row, label: 'Média (%)' })) };
    expect(scoreAlertPreheader(umaSecao, comPercent, { responderName: 'Ana' })).toBe('Ana: 1 seção abaixo do limite · Média 69,4% (mínimo 80%)');

    expect(html).toMatch(
      /<body[^>]*>\n<div style="display:none;[^"]*">Ana &quot;Auditora&quot;: 2 seções abaixo do limite · Campo media 69,4% \(mínimo 80%\)(&#847;&zwnj;&nbsp;)+<\/div>/,
    );
  });

  it('unidade auditada em destaque: título do cartão, nome do formulário embaixo, prévia e <title>', () => {
    const comUnidade = buildScoreAlertEmailHtml(alert, buildScoreOverview(fields, values), { ...context, unitLabel: 'Frango <Tropical>' });
    expect(comUnidade).toMatch(/font-size:22px;[^"]*">Frango &lt;Tropical&gt;<\/p>\n<p [^>]*>Checklist &lt;script&gt;/);
    expect(comUnidade).toContain('<title>Auditoria abaixo do esperado — Frango &lt;Tropical&gt;</title>');
    expect(comUnidade).toMatch(/display:none;[^"]*">Frango &lt;Tropical&gt;: 2 seções abaixo do limite/);
    // A prévia usa a unidade; sem ela, quem respondeu.
    expect(scoreAlertPreheader(alert, buildScoreOverview(fields, values), { responderName: 'Ana', unitLabel: 'Granja 3' })).toMatch(
      /^Granja 3: /,
    );
  });

  it('envio de sempre sem nada abaixo: "Auditoria dentro do esperado", faixa verde e prévia com o resultado', () => {
    const emDia: ScoreAlert = { ...alert, always: true, sectionsBelow: [], resultsBelow: [] };
    const valores = new Map<string, number | null>([['iso', 90], ['bar', 85], ['agua', 100], ['media', 91.7]]);
    const overview = buildScoreOverview(fields, valores);
    const emDiaHtml = buildScoreAlertEmailHtml(emDia, overview, { ...context, unitLabel: 'Ovos Pataca' });
    expect(emDiaHtml).toContain('>Auditoria dentro do esperado</p>');
    expect(emDiaHtml).toContain('<title>Auditoria dentro do esperado — Ovos Pataca</title>');
    expect(emDiaHtml).toMatch(/bgcolor="#ecfdf3"[^>]*border-left:4px solid #067647;color:#067647;[^>]*>Todas as seções ficaram dentro do limite\.<\/td>/);
    expect(emDiaHtml).not.toContain('abaixo</span>');
    expect(scoreAlertPreheader(emDia, overview, { responderName: 'Ana', unitLabel: 'Ovos Pataca' })).toBe(
      'Ovos Pataca: todas as seções dentro do limite · Campo media 91,7% (mínimo 80%)',
    );
  });

  it('botão "Ver a resposta" com o link escapado; data no fuso de Brasília', () => {
    expect(html).toContain('href="https://flow.exemplo.com/respostas/f1?x=1&amp;y=2"');
    expect(html).toContain('>Ver a resposta</a>');
    expect(html).toContain('21/10/2026, 15:55');
  });

  it('link que não é http(s) não vira botão', () => {
    const semLink = buildScoreAlertEmailHtml(alert, buildScoreOverview(fields, values), {
      ...context,
      link: 'javascript:alert(1)',
    });
    expect(semLink).not.toContain('Ver a resposta');
    expect(semLink).not.toContain('javascript:');
  });
});
