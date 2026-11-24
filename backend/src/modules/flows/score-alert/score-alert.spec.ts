import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { SolicitationOriginType } from '../../../common/enums/solicitation-origin-type.enum';
import { SolicitationCreatedEvent } from '../../../common/events/solicitation-events';
import {
  FormFieldEntity,
  SolicitationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../../database/entities';
import {
  buildScoreAlertMessage,
  evaluateScoreAlerts,
  scoreAlertSubject,
  type ScoreAlert,
  type ScoreAlertField,
} from './score-alert';
import { ScoreAlertListener } from './score-alert.listener';

const recipients = [{ type: 'custom' as const, value: 'qualidade@exemplo.com' }];

function section(code: string, title: string, order: number, extra: Record<string, unknown> = {}): ScoreAlertField {
  return {
    code,
    label: `Pontuação (%) — ${title}`,
    sectionTitle: title,
    sectionOrder: order,
    order: 9,
    settingsJson: { scoreMode: 'section', ...extra },
  };
}

function result(code: string, settings: Record<string, unknown>): ScoreAlertField {
  return { code, label: code === 'media' ? 'Média das seções' : 'Seções no marco', sectionTitle: 'RESULTADO', sectionOrder: 99, order: 1, settingsJson: { scoreMode: 'result', ...settings } };
}

const fields: ScoreAlertField[] = [
  section('isolamento', 'Isolamento', 1),
  section('barreira', 'Barreira', 2, { scoreLimit: 80 }), // seção crítica: limite próprio
  section('agua', 'Água', 3),
  section('registros', 'Registros', 4),
  result('atingiram', {
    scoreMark: 70,
    scoreAlert: { enabled: true, sectionsBelow: true, channel: 'email', recipients },
  }),
  result('media', {
    scoreResultMeasure: 'average',
    scoreAlert: { enabled: true, resultBelow: 80, channel: 'email', recipients },
  }),
];

describe('evaluateScoreAlerts', () => {
  const values = new Map<string, number | null>([
    ['isolamento', 83.3],
    ['barreira', 75], // acima do marco (70), abaixo do limite próprio (80)
    ['agua', 50],
    ['registros', null], // sem nota: não entra
    ['atingiram', 66.7],
    ['media', 69.4],
  ]);

  it('junta seções abaixo (limite próprio ou marco) e resultado abaixo numa mensagem só', () => {
    expect(evaluateScoreAlerts(fields, values)).toEqual([
      {
        channel: 'email',
        recipients,
        sectionsBelow: [
          { label: 'Barreira', value: 75, limit: 80 },
          { label: 'Água', value: 50, limit: 70 },
        ],
        resultsBelow: [{ label: 'Média das seções', value: 69.4, limit: 80 }],
        backgroundImageId: null,
        always: false,
        labelFieldCode: null,
        subject: null,
      },
    ]);
  });

  it('"sempre que for respondido": manda mesmo com tudo em dia, e ainda aponta as seções abaixo', () => {
    const sempre = (extra: Record<string, unknown> = {}) => [
      section('isolamento', 'Isolamento', 1),
      section('agua', 'Água', 2),
      // Sem "seções abaixo" nem mínimo marcados: o envio de sempre basta.
      result('media', { scoreAlert: { enabled: true, trigger: 'always', channel: 'email', recipients, labelFieldCode: ' unidade ', ...extra } }),
    ];
    const emDia = evaluateScoreAlerts(sempre(), new Map([['isolamento', 90], ['agua', 100], ['media', 95]]));
    expect(emDia).toEqual([
      expect.objectContaining({ always: true, sectionsBelow: [], resultsBelow: [], labelFieldCode: 'unidade' }),
    ]);

    const comProblema = evaluateScoreAlerts(sempre(), new Map([['isolamento', 90], ['agua', 40], ['media', 65]]));
    expect(comProblema[0].sectionsBelow).toEqual([{ label: 'Água', value: 40, limit: 70 }]);
  });

  it('arte própria do formulário: a do primeiro resultado do grupo que tiver uma', () => {
    const comArte = fields.map((field) =>
      field.code === 'media'
        ? result('media', { scoreAlert: { enabled: true, resultBelow: 80, channel: 'email', recipients, backgroundImageId: ' img-1 ' } })
        : field,
    );
    expect(evaluateScoreAlerts(comArte, values)[0].backgroundImageId).toBe('img-1');
  });

  it('limite é "abaixo de": igual ao limite não avisa; tudo em dia não gera nada', () => {
    const ok = new Map<string, number | null>([['isolamento', 70], ['barreira', 80], ['agua', 100], ['media', 80]]);
    expect(evaluateScoreAlerts(fields, ok)).toEqual([]);
  });

  it('canais ou destinatários diferentes viram mensagens separadas', () => {
    const outro = result('media', {
      scoreAlert: { enabled: true, resultBelow: 80, channel: 'in_app', recipients: [{ type: 'users', userIds: ['u1'] }] },
    });
    const alerts = evaluateScoreAlerts([...fields.slice(0, 5), outro], values);
    expect(alerts.map((alert) => alert.channel)).toEqual(['email', 'in_app']);
  });

  it('aviso desligado, sem destinatário ou sem gatilho não faz nada', () => {
    const off = [
      section('agua', 'Água', 1),
      result('a', { scoreAlert: { enabled: false, sectionsBelow: true, channel: 'email', recipients } }),
      result('b', { scoreAlert: { enabled: true, sectionsBelow: true, channel: 'email', recipients: [] } }),
      result('c', { scoreAlert: { enabled: true, channel: 'email', recipients } }),
    ];
    expect(evaluateScoreAlerts(off, new Map([['agua', 10], ['a', 0], ['b', 0], ['c', 0]]))).toEqual([]);
  });
});

describe('buildScoreAlertMessage', () => {
  it('diz quais seções, os limites e onde ver', () => {
    const { title, body } = buildScoreAlertMessage(
      {
        channel: 'email',
        recipients,
        sectionsBelow: [{ label: 'Barreira', value: 50, limit: 70 }],
        resultsBelow: [{ label: 'Média das seções', value: 76.4, limit: 80 }],
        backgroundImageId: null,
        always: false,
        labelFieldCode: null,
        subject: null,
      },
      { formName: 'Checklist', responderName: 'Auditoria Frango', submittedAt: null, link: 'https://app/respostas/f1' },
    );
    expect(title).toBe('Auditoria abaixo do esperado — Checklist');
    expect(body).toContain('1 seção ficou abaixo do limite:');
    expect(body).toContain('• Barreira: 50% (limite 70%)');
    expect(body).toContain('• Média das seções: 76,4% (mínimo 80%)');
    expect(body).toContain('Ver a resposta: https://app/respostas/f1');
    expect(body).toContain('Resposta: Auditoria Frango');
  });

  it('assunto próprio: {unidade} vira a unidade (sem ela, o formulário), {formulario} o formulário; uma linha só', () => {
    const base: ScoreAlert = {
      channel: 'email',
      recipients,
      sectionsBelow: [{ label: 'Barreira', value: 50, limit: 70 }],
      resultsBelow: [],
      backgroundImageId: null,
      always: true,
      labelFieldCode: 'unidade',
      subject: 'Checklist Biosseguridade - {unidade}',
    };
    const context = { formName: 'Checklist', responderName: null, submittedAt: null, link: null };
    expect(scoreAlertSubject(base, { ...context, unitLabel: 'Ovos Santa Lucia' })).toBe('Checklist Biosseguridade - Ovos Santa Lucia');
    expect(buildScoreAlertMessage(base, { ...context, unitLabel: 'Ovos Santa Lucia' }).title).toBe(
      'Checklist Biosseguridade - Ovos Santa Lucia',
    );
    expect(scoreAlertSubject(base, context)).toBe('Checklist Biosseguridade - Checklist');
    expect(scoreAlertSubject({ ...base, subject: '{ Unidade }\n— {formulário}' }, { ...context, unitLabel: 'Granja 3' })).toBe(
      'Granja 3 — Checklist',
    );
    // Sem assunto próprio (ou só espaços): o padrão com a situação.
    expect(scoreAlertSubject({ ...base, subject: '  ' }, { ...context, unitLabel: 'Granja 3' })).toBe(
      'Auditoria abaixo do esperado — Granja 3',
    );
  });

  it('assunto próprio do resultado chega ao aviso', () => {
    const comAssunto = fields.map((field) =>
      field.code === 'atingiram'
        ? result('atingiram', {
            scoreMark: 70,
            scoreAlert: { enabled: true, sectionsBelow: true, channel: 'email', recipients, subject: ' Checklist - {unidade} ' },
          })
        : field,
    );
    const values = new Map<string, number | null>([['agua', 50], ['media', 90]]);
    expect(evaluateScoreAlerts(comAssunto, values)[0].subject).toBe('Checklist - {unidade}');
  });

  it('com a unidade: no assunto e no começo do texto; tudo em dia vira "dentro do esperado"', () => {
    const emDia = buildScoreAlertMessage(
      { channel: 'email', recipients, sectionsBelow: [], resultsBelow: [], backgroundImageId: null, always: true, labelFieldCode: 'unidade', subject: null },
      { formName: 'Checklist', responderName: 'Ana', submittedAt: null, link: null, unitLabel: ' Frango Tropical ' },
    );
    expect(emDia.title).toBe('Auditoria dentro do esperado — Frango Tropical');
    expect(emDia.body.split('\n')[0]).toBe('Frango Tropical · Checklist');
    expect(emDia.body).toContain('Todas as seções dentro do limite.');
  });
});

describe('ScoreAlertListener', () => {
  function setup(
    items: Array<{ fieldCode: string; valueNumber: string | null }>,
    arte: { global?: string | null; existentes?: string[]; campos?: ScoreAlertField[] } = {},
  ) {
    const repos = new Map<unknown, { findOne?: jest.Mock; find?: jest.Mock }>([
      [SubmissionEntity, { findOne: jest.fn().mockResolvedValue({ id: 's1', formId: 'f1', formVersionId: 'v1', responderName: 'Auditoria', submittedAt: null, form: { name: 'Checklist' } }) }],
      [
        FormFieldEntity,
        {
          find: jest.fn().mockResolvedValue(
            (arte.campos ?? fields).map((field) => ({
              code: field.code,
              label: field.label,
              order: field.order,
              settingsJson: field.settingsJson,
              section: { title: field.sectionTitle, order: field.sectionOrder },
            })),
          ),
          // Pergunta que identifica a auditoria: a opção "opcao_2" é a unidade "Frango Tropical".
          findOne: jest.fn().mockResolvedValue({
            code: 'unidade',
            options: [
              { internalValue: 'opcao_1', displayLabel: 'Ovos Pataca' },
              { internalValue: 'opcao_2', displayLabel: 'Frango Tropical' },
            ],
          }),
        },
      ],
      [
        SubmissionItemEntity,
        {
          find: jest.fn().mockResolvedValue(items),
          findOne: jest.fn(async ({ where }: { where: { fieldCode: string } }) =>
            where.fieldCode === 'unidade' ? { fieldCode: 'unidade', valueText: 'opcao_2' } : null,
          ),
        },
      ],
      [SolicitationEntity, { findOne: jest.fn().mockResolvedValue({ id: 'sol1' }) }],
    ]);
    const dataSource = { getRepository: jest.fn((entity: unknown) => repos.get(entity)) };
    const notifications = {
      enqueue: jest.fn().mockResolvedValue({ message: { id: 'n1' }, recipients: [], created: true }),
      dispatch: jest.fn().mockResolvedValue({}),
    };
    const resolver = { resolve: jest.fn().mockResolvedValue([{ source: 'custom', address: 'qualidade@exemplo.com' }]) };
    const config = { get: jest.fn().mockReturnValue('https://flow.local/') };
    const existentes = new Set(arte.existentes ?? []);
    const emailImages = {
      scoreAlertBackgroundId: jest.fn().mockResolvedValue(arte.global ?? null),
      exists: jest.fn(async (id: string | null | undefined) => Boolean(id && existentes.has(id))),
    };
    const listener = new ScoreAlertListener(
      dataSource as unknown as DataSource,
      notifications as never,
      resolver as never,
      config as unknown as ConfigService,
      emailImages as never,
    );
    return { listener, notifications, resolver };
  }

  const event = (origin = SolicitationOriginType.FORM_SUBMISSION) =>
    new SolicitationCreatedEvent(null, 'sol1', origin, 'f1', 's1');

  it('envia uma notificação, idempotente pelo envio, e dispara na hora', async () => {
    const { listener, notifications } = setup([
      { fieldCode: 'agua', valueNumber: '50' },
      { fieldCode: 'media', valueNumber: '90' },
    ]);
    await listener.handleSolicitationCreated(event());
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    const input = notifications.enqueue.mock.calls[0][0];
    expect(input.channel).toBe('email');
    expect(input.idempotencyKey).toMatch(/^score-alert:s1:[0-9a-f]{16}$/);
    expect(input.idempotencyKey.length).toBeLessThanOrEqual(100);
    // E-mail: o resumo abre o texto puro (é dele que o Gmail tira a prévia da caixa de entrada).
    expect(input.body.startsWith('Auditoria: 1 seção abaixo do limite\n\n')).toBe(true);
    expect(input.body).toContain('• Água: 50% (limite 70%)');
    // Link direto para a resposta deste envio (abre o detalhe por cima da lista do formulário).
    expect(input.body).toContain('Ver a resposta: https://flow.local/registros/f1?solicitacao=sol1');
    expect(input.origin).toEqual({ solicitationId: 'sol1' });
    expect(notifications.dispatch).toHaveBeenCalledWith('n1');
  });

  it('no e-mail manda também a versão formatada (tabela das seções)', async () => {
    const { listener, notifications } = setup([{ fieldCode: 'agua', valueNumber: '50' }]);
    await listener.handleSolicitationCreated(event());
    expect(notifications.enqueue.mock.calls[0][0].html).toContain('Notas por seção');
  });

  it('arte de fundo: sem nada trocado, a padrão', async () => {
    const { listener, notifications } = setup([{ fieldCode: 'agua', valueNumber: '50' }]);
    await listener.handleSolicitationCreated(event());
    expect(notifications.enqueue.mock.calls[0][0].html).toContain("url('cid:tijuca-fundo-57anos')");
  });

  it('arte de fundo: a geral da Administração, quando existe', async () => {
    const { listener, notifications } = setup([{ fieldCode: 'agua', valueNumber: '50' }], {
      global: 'geral-1',
      existentes: ['geral-1'],
    });
    await listener.handleSolicitationCreated(event());
    const { html } = notifications.enqueue.mock.calls[0][0];
    expect(html).toContain("url('cid:email-image-geral-1')");
    expect(html).toContain('background-position:center top'); // arte trocada vai centralizada
  });

  it('arte de fundo: a do formulário vence a geral; imagem que não existe mais é ignorada', async () => {
    const comArte = (id: string): ScoreAlertField[] =>
      fields.map((field) =>
        field.code === 'media'
          ? result('media', { scoreAlert: { enabled: true, resultBelow: 80, channel: 'email', recipients, backgroundImageId: id } })
          : field,
      );
    const cases: Array<[string, string]> = [
      ['form-1', 'email-image-form-1'],
      ['apagada', 'email-image-geral-1'],
    ];
    for (const [id, cid] of cases) {
      const { listener, notifications } = setup([{ fieldCode: 'media', valueNumber: '50' }], {
        global: 'geral-1',
        existentes: ['geral-1', 'form-1'],
        campos: comArte(id),
      });
      await listener.handleSolicitationCreated(event());
      expect(notifications.enqueue.mock.calls[0][0].html).toContain(`url('cid:${cid}')`);
    }
  });

  it('"sempre" + unidade: manda com tudo em dia, com o rótulo da opção (não o valor interno) no assunto', async () => {
    const campos: ScoreAlertField[] = [
      ...fields.slice(0, 4),
      result('media', { scoreAlert: { enabled: true, trigger: 'always', channel: 'email', recipients, labelFieldCode: 'unidade' } }),
    ];
    const { listener, notifications } = setup(
      [
        { fieldCode: 'isolamento', valueNumber: '90' },
        { fieldCode: 'media', valueNumber: '95' },
      ],
      { campos },
    );
    await listener.handleSolicitationCreated(event());
    const input = notifications.enqueue.mock.calls[0][0];
    expect(input.title).toBe('Auditoria dentro do esperado — Frango Tropical');
    expect(input.body.startsWith('Frango Tropical: todas as seções dentro do limite')).toBe(true);
    expect(input.html).toContain('>Frango Tropical</p>');
  });

  it('tudo acima dos limites: não manda nada', async () => {
    const { listener, notifications } = setup([
      { fieldCode: 'isolamento', valueNumber: '100' },
      { fieldCode: 'media', valueNumber: '95' },
    ]);
    await listener.handleSolicitationCreated(event());
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('card que não veio de envio de formulário é ignorado', async () => {
    const { listener, notifications } = setup([{ fieldCode: 'agua', valueNumber: '10' }]);
    await listener.handleSolicitationCreated(event(SolicitationOriginType.MANUAL));
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('erro ao enviar vira log, não derruba a criação do card', async () => {
    const { listener, notifications } = setup([{ fieldCode: 'agua', valueNumber: '10' }]);
    notifications.enqueue.mockRejectedValueOnce(new Error('canal fora'));
    await expect(listener.handleSolicitationCreated(event())).resolves.toBeUndefined();
  });
});
