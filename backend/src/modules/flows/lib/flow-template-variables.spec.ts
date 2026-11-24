import type { FlowExecutionContext } from '../types/flow.types';
import {
  BUILTIN_FLOW_VARIABLES,
  SAMPLE_FLOW_VARIABLES,
  buildFlowTemplateVariables,
} from './flow-template-variables';

function ctx(overrides: Partial<FlowExecutionContext> = {}): FlowExecutionContext {
  return { eventName: 'test', ...overrides } as FlowExecutionContext;
}

describe('variáveis da aprovação', () => {
  it('título e descrição da aprovação do contexto', () => {
    const vars = buildFlowTemplateVariables({
      eventName: 'x',
      approval: { id: 'a1', title: 'Retirar de rota', description: 'Retire e aprove', status: 'pending' } as never,
    });
    expect(vars).toMatchObject({ approval_title: 'Retirar de rota', approval_description: 'Retire e aprove' });
  });
});

describe('buildFlowTemplateVariables', () => {
  it('expõe todas as variáveis embutidas, vazias quando não há contexto', () => {
    const vars = buildFlowTemplateVariables(ctx());
    for (const { name } of BUILTIN_FLOW_VARIABLES) {
      expect(vars).toHaveProperty(name, '');
    }
  });

  it('o mapa de exemplo cobre exatamente as variáveis embutidas', () => {
    expect(Object.keys(SAMPLE_FLOW_VARIABLES).sort()).toEqual(
      BUILTIN_FLOW_VARIABLES.map((v) => v.name).sort(),
    );
  });

  it('resolve variáveis da solicitação, do solicitante e do responsável', () => {
    const vars = buildFlowTemplateVariables(
      ctx({
        form: { name: 'Compras' } as never,
        solicitation: {
          id: 'sol-1',
          title: 'Cadeiras',
          status: 'in_progress',
          priority: 'high',
          trackingToken: 'tok123',
          assignee: { fullName: 'João Lima' },
          createdByUser: { fullName: 'Criador', email: 'criador@x.com' },
          submission: { responderName: 'Maria', responderEmail: 'maria@x.com' },
        } as never,
      }),
      { frontendUrl: 'https://flow.exemplo.com/' },
    );
    expect(vars).toMatchObject({
      form_name: 'Compras',
      solicitation_number: 'sol-1',
      solicitation_title: 'Cadeiras',
      solicitation_status: 'in_progress',
      solicitation_priority: 'high',
      solicitation_requester_name: 'Maria',
      solicitation_requester_email: 'maria@x.com',
      solicitation_responsible_name: 'João Lima',
      tracking_url: 'https://flow.exemplo.com/acompanhar/tok123',
    });
  });

  it('solicitante cai para o usuário criador quando não há submissão', () => {
    const vars = buildFlowTemplateVariables(
      ctx({ solicitation: { id: 's', createdByUser: { fullName: 'Criador', email: 'c@x.com' } } as never }),
    );
    expect(vars.solicitation_requester_name).toBe('Criador');
    expect(vars.solicitation_requester_email).toBe('c@x.com');
  });

  it('monta o link da aprovação e o status', () => {
    const vars = buildFlowTemplateVariables(ctx({ approval: { id: 'a b', status: 'approved' } as never }), {
      frontendUrl: 'https://f.com',
    });
    expect(vars.approval_link).toBe('https://f.com/aprovacoes?id=a%20b');
    expect(vars.approval_status).toBe('approved');
  });

  it('formata a data de envio em pt-BR no fuso de São Paulo', () => {
    const vars = buildFlowTemplateVariables(
      ctx({ submission: { submittedAt: new Date('2026-10-05T17:32:10.000Z') } as never }),
    );
    expect(vars.submitted_at).toBe('05/10/2026, 14:32:10');
  });

  describe('campos do formulário e metadata', () => {
    it('expõe campos escalares pelo código, convertendo para texto', () => {
      const vars = buildFlowTemplateVariables(
        ctx({ fields: { nome: 'Maria', qtd: 3, urgente: true, vazio: null, tags: ['a', 'b'] } }),
      );
      expect(vars).toMatchObject({ nome: 'Maria', qtd: '3', urgente: 'true', vazio: '', tags: 'a, b' });
    });

    it('ignora objetos, listas de objetos e códigos que não são identificadores', () => {
      const vars = buildFlowTemplateVariables(
        ctx({ fields: { obj: { a: 1 }, lista: [{ a: 1 }], 'com-hifen': 'x', '1abc': 'y' } }),
      );
      expect(vars).not.toHaveProperty('obj');
      expect(vars).not.toHaveProperty('lista');
      expect(vars).not.toHaveProperty('com-hifen');
      expect(vars).not.toHaveProperty('1abc');
    });

    it('variáveis embutidas vencem campos com o mesmo nome; campos vencem metadata', () => {
      const vars = buildFlowTemplateVariables(
        ctx({
          form: { name: 'Real' } as never,
          fields: { form_name: 'FALSO', x: 'campo' },
          metadata: { x: 'meta', y: 'meta-y' },
        }),
      );
      expect(vars.form_name).toBe('Real');
      expect(vars.x).toBe('campo');
      expect(vars.y).toBe('meta-y');
    });

    it('não deixa um campo chamado __proto__ poluir o mapa', () => {
      const fields = JSON.parse('{"__proto__": "x", "constructor": "y", "ok": "z"}') as Record<string, unknown>;
      const vars = buildFlowTemplateVariables(ctx({ fields }));
      expect(Object.getPrototypeOf(vars)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).x).toBeUndefined();
      expect(vars.ok).toBe('z');
    });
  });

  describe('payload do webhook', () => {
    it('expõe caminhos pontuados em payload.*', () => {
      const vars = buildFlowTemplateVariables(
        ctx({
          metadata: {
            payload: {
              header: { numeroPedido: 'P-123', valor: 18500.5 },
              itens: [{ codigo: 'A1' }, { codigo: 'B2' }],
              emails: ['a@x.com', 'b@x.com'],
              nulo: null,
            },
          },
        }),
      );
      expect(vars['payload.header.numeroPedido']).toBe('P-123');
      expect(vars['payload.header.valor']).toBe('18500.5');
      expect(vars['payload.itens.0.codigo']).toBe('A1');
      expect(vars['payload.itens.1.codigo']).toBe('B2');
      expect(vars['payload.emails']).toBe('a@x.com, b@x.com');
      expect(vars['payload.nulo']).toBe('');
    });

    it('limita profundidade e quantidade de variáveis', () => {
      const deep = { a: { b: { c: { d: { e: { f: 'fundo' } } } } } };
      const vars = buildFlowTemplateVariables(ctx({ metadata: { payload: deep } }));
      expect(vars).not.toHaveProperty('payload.a.b.c.d.e.f');

      const wide = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, String(i)]));
      const manyVars = buildFlowTemplateVariables(ctx({ metadata: { payload: wide } }));
      const payloadKeys = Object.keys(manyVars).filter((k) => k.startsWith('payload.'));
      expect(payloadKeys.length).toBeLessThanOrEqual(200);
    });

    it('payload ausente ou não-objeto não quebra', () => {
      expect(() => buildFlowTemplateVariables(ctx({ metadata: { payload: 'texto' } }))).not.toThrow();
      expect(() => buildFlowTemplateVariables(ctx({ metadata: { payload: null } }))).not.toThrow();
    });
  });
});
