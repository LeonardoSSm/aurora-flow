import { EXAMPLE_PROCESS } from './example-blueprint';
import { normalizeBlueprint, toCode } from './normalize-blueprint';
import { validateBlueprint, type BlueprintContext } from './validate-blueprint';

const ctx: BlueprintContext = {
  roleCodes: new Set(['admin', 'gerente']),
  userIdByEmail: new Map([['leonardo.sousa@empresa.com', 'user-leo']]),
  areaIds: new Set(),
  itemListIds: new Set(),
};

const errorsOf = (bp: unknown): string[] =>
  validateBlueprint(bp, ctx).errors.map((issue) => `${issue.path}: ${issue.message}`);

/** Como o Gemini da LOPS montou o "Processo Teste LOPS AI" (conversa de 2026-10-15). */
const GEMINI_STYLE = {
  blueprint: {
    name: 'Processo Teste LOPS AI',
    form: {
      type: 'stepper',
      sections: [
        {
          title: 'Email',
          fields: [
            { code: 'nome', type: 'short_text', label: 'Nome', is_required: false },
            { code: 'idade', type: 'number', label: 'Idade' },
            { code: 'genero', type: 'single_select', label: 'Gênero', config: { options: ['Masculino', 'Feminino'] } },
          ],
        },
        {
          title: 'Feedback',
          fields: [
            { name: 'Pontuação', type: 'scale', config: { min: 1, max: 5 } },
            { name: 'Avalie', type: 'textarea' },
          ],
        },
      ],
    },
    phases: [
      { name: 'Novo', actors: ['leonardo.sousa@empresa.com'], approval: null },
      {
        name: 'Pendente',
        actors: ['leonardo.sousa@empresa.com'],
        approval: { approvers: ['leonardo.sousa@empresa.com'], type: 'qualquer um' },
      },
      { name: 'Concluído', isTerminal: true },
    ],
  },
};

describe('normalizeBlueprint', () => {
  it('o processo no formato que o Gemini mandou passa na conferência depois de ajustado', () => {
    const { blueprint, adjusted } = normalizeBlueprint(GEMINI_STYLE);
    expect(errorsOf(blueprint)).toEqual([]);
    expect(blueprint).toMatchObject({
      form: {
        mode: 'stepper',
        sections: [
          {
            key: 'email',
            fields: [
              { code: 'nome', required: false },
              {},
              { options: [{ value: 'Masculino', label: 'Masculino' }, { value: 'Feminino', label: 'Feminino' }] },
            ],
          },
          { key: 'feedback', fields: [{ code: 'pontuacao', label: 'Pontuação', settings: { min: 1, max: 5 } }, { code: 'avalie', type: 'long_text' }] },
        ],
      },
      phases: [
        { key: 'novo', label: 'Novo', actors: { users: ['leonardo.sousa@empresa.com'] } },
        { key: 'pendente', approval: { approvers: { users: ['leonardo.sousa@empresa.com'] }, rule: 'any' } },
        { key: 'concluido', terminal: true },
      ],
    });
    expect((blueprint as { phases: Array<Record<string, unknown>> }).phases[0]).not.toHaveProperty('approval');
    expect(adjusted.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['blueprint', 'form.type', 'form.sections[0].fields[2].config', 'phases[1].approval.type']),
    );
  });

  it('não mexe no processo que já está no formato do manual', () => {
    const { blueprint, adjusted } = normalizeBlueprint(EXAMPLE_PROCESS);
    expect(adjusted).toEqual([]);
    expect(blueprint).toEqual(EXAMPLE_PROCESS);
    expect(blueprint).not.toBe(EXAMPLE_PROCESS);
  });

  it('aceita o processo como texto JSON', () => {
    const { blueprint, adjusted } = normalizeBlueprint(JSON.stringify(EXAMPLE_PROCESS));
    expect(blueprint).toEqual(EXAMPLE_PROCESS);
    expect(adjusted).toHaveLength(1);
  });

  it('texto que não é JSON fica como veio para a conferência recusar', () => {
    const { blueprint } = normalizeBlueprint('crie um processo de compras');
    expect(blueprint).toBe('crie um processo de compras');
    expect(errorsOf(blueprint)).toEqual([': O corpo precisa ser um objeto com o processo.']);
  });

  it('códigos gerados não repetem os que a IA já usou', () => {
    const { blueprint } = normalizeBlueprint({
      name: 'X',
      form: { sections: [{ title: 'Dados', fields: [{ code: 'valor', type: 'currency', label: 'Valor' }, { label: 'Valor', type: 'money' }] }] },
      phases: [
        { label: 'Triagem', sections: [{ title: 'Valor', fields: [{ label: 'Parecer', type: 'texto_longo' }] }] },
        { label: 'Fim', terminal: true },
      ],
    });
    expect(errorsOf(blueprint)).toEqual([]);
    const bp = blueprint as { form: { sections: Array<{ fields: Array<{ code: string; type: string }> }> }; phases: Array<{ sections?: Array<{ key: string }> }> };
    expect(bp.form.sections[0].fields.map((field) => field.code)).toEqual(['valor', 'valor_2']);
    expect(bp.form.sections[0].fields[1].type).toBe('currency');
    expect(bp.phases[0].sections?.[0].key).toBe('valor_3');
  });

  it('ramificação pelo nome da opção vira o valor; caixa de seleção por value vira checked', () => {
    const { blueprint, adjusted } = normalizeBlueprint({
      name: 'X',
      form: {
        sections: [
          {
            key: 'tipo',
            title: 'Tipo',
            fields: [
              { code: 'tipo', label: 'Tipo', type: 'select', options: [{ value: 'compra', label: 'Compra' }, { value: 'servico', label: 'Serviço' }] },
              { code: 'urgente', label: 'Urgente?', type: 'boolean' },
            ],
            next: { branches: [{ field: 'tipo', option: 'Serviço', to: 'servico' }, { field: 'urgente', value: true, goTo: 'submit' }] },
          },
          { key: 'servico', title: 'Serviço', fields: [{ code: 'escopo', label: 'Escopo', type: 'text' }] },
        ],
      },
      phases: [{ label: 'Análise' }, { label: 'Fim', terminal: true }],
    });
    expect(errorsOf(blueprint)).toEqual([]);
    expect((blueprint as { form: { sections: Array<{ next?: unknown }> } }).form.sections[0].next).toEqual({
      branches: [
        { field: 'tipo', option: 'servico', goTo: 'servico' },
        { field: 'urgente', checked: true, goTo: 'submit' },
      ],
    });
    expect(adjusted.map((issue) => issue.path)).toContain('form.sections[0].next.branches[0].option');
  });

  it('aprovadores soltos na fase, prazo em número e "sem aprovação" em vários jeitos', () => {
    const { blueprint } = normalizeBlueprint({
      name: 'X',
      form: { fields: [{ label: 'Pedido', type: 'text' }] },
      phases: [
        { label: 'Gerente', approvers: ['gerente'], approvalRule: 'todos', prazo: 24 },
        { label: 'Execução', requiresApproval: false, approval: { approvers: ['admin'] } },
        { label: 'Fim', final: true },
      ],
    });
    expect(errorsOf(blueprint)).toEqual([]);
    expect(blueprint).toMatchObject({
      form: { sections: [{ title: 'Dados da solicitação', fields: [{ code: 'pedido', type: 'short_text' }] }] },
      phases: [
        { approval: { approvers: { roles: ['gerente'] }, rule: 'all' }, sla: { hours: 24 } },
        {},
        { terminal: true },
      ],
    });
    expect((blueprint as { phases: Array<Record<string, unknown>> }).phases[1]).not.toHaveProperty('approval');
  });

  it('o que não tem uma leitura só continua errado para a conferência apontar', () => {
    const { blueprint } = normalizeBlueprint({
      name: 'X',
      form: { sections: [{ title: 'A', fields: [{ label: 'Coisa', type: 'tipo_inventado' }] }] },
      phases: [{ label: 'Fim', terminal: true }],
    });
    expect(errorsOf(blueprint)).toEqual([
      expect.stringMatching(/^form\.sections\[0\]\.fields\[0\]\.type: Tipo "tipo_inventado" não existe .* Aceitos: short_text/),
    ]);
  });

  it('aviso com "to" em texto ou com os perfis à parte vira lista', () => {
    const notify = (data: Record<string, unknown>) => ({ key: 'n', type: 'action_notification', data: { channel: 'in_app', message: 'Oi', ...data } });
    const { blueprint, adjusted } = normalizeBlueprint({
      ...EXAMPLE_PROCESS,
      flows: [
        {
          name: 'Avisos',
          nodes: [
            { key: 't', type: 'trigger_phase_entered', data: { phase: 'compra' } },
            { ...notify({ to: 'requester' }), key: 'a' },
            { ...notify({ to: 'roles', roles: ['gerente'] }), key: 'b' },
            { ...notify({ role: 'gerente' }), key: 'c' },
            { ...notify({ to: ['leonardo.sousa@empresa.com', 'responsible'] }), key: 'd' },
          ],
          edges: [
            { from: 't', to: 'a' },
            { from: 't', to: 'b' },
            { from: 't', to: 'c' },
            { from: 't', to: 'd' },
          ],
        },
      ],
    });
    const nodes = (blueprint as { flows: Array<{ nodes: Array<{ data: Record<string, unknown> }> }> }).flows[0].nodes;
    expect(nodes.slice(1).map((node) => node.data.to)).toEqual([
      ['requester'],
      [{ role: 'gerente' }],
      [{ role: 'gerente' }],
      [{ users: ['leonardo.sousa@empresa.com'] }, 'responsible'],
    ]);
    expect(nodes[2].data).not.toHaveProperty('roles');
    expect(adjusted.filter((issue) => issue.path.endsWith('.data.to'))).toHaveLength(4);
    expect(errorsOf(blueprint).filter((message) => message.startsWith('flows'))).toEqual([]);
  });

  it('fluxos do "Reembolso" como o Gemini escreveu: tipos, fase, condição, resultado, saídas, avisos, prazo e Kanban', () => {
    const { blueprint, adjusted } = normalizeBlueprint({
      name: 'Reembolso',
      form: {
        mode: 'stepper',
        sections: [
          {
            key: 'despesa',
            title: 'Despesa',
            fields: [
              { code: 'tipo', label: 'Tipo', type: 'single_select', options: ['Viagem', 'Outros'] },
              { code: 'valor_total', label: 'Valor', type: 'currency' },
            ],
          },
          {
            key: 'viagem',
            title: 'Viagem',
            fields: [{ code: 'destino', label: 'Destino', type: 'short_text' }],
            visibility: { action: 'show', conditions: [{ field: 'tipo', op: 'equals', value: 'Viagem' }] },
          },
        ],
      },
      phases: [
        { key: 'triagem', label: 'Triagem', actors: { roles: ['gerente'] }, sections: [{ key: 'sec_triagem', title: 'Conferência', fields: [{ code: 'comprovante_valido', label: 'Comprovante válido?', type: 'checkbox' }] }] },
        { key: 'aprovacao_gestor', label: 'Aprovação do Gestor', approval: { approvers: { roles: ['gerente'] } }, sla: { duration: 24, unit: 'business_hours', alertPercentage: 80 } },
        { key: 'pagamento', label: 'Pagamento', actors: { roles: ['admin'] } },
        { key: 'recusado', label: 'Recusado', terminal: true },
      ],
      kanban: { cardValueFieldId: 'valor_total' },
      flows: [
        {
          name: 'Decisões',
          nodes: [
            { key: 'triagem_salva', type: 'trigger_phase_field_saved', data: { fieldCode: 'comprovante_valido', phaseKey: 'triagem' } },
            { key: 'invalido', type: 'condition_field_value', data: { field: 'comprovante_valido', op: 'equals', value: false } },
            { key: 'recusar', type: 'action_move_card', data: { toPhase: 'recusado' } },
            { key: 'avisar_recusa', type: 'action_notification', data: { message: 'Recusado', to: 'users', users: ['{{responder_email}}'] } },
            { key: 'gestor_decidiu', type: 'trigger_approval_completed', data: { phaseKey: 'aprovacao_gestor' } },
            { key: 'gestor_aprovou', type: 'condition_approval_result' },
            { key: 'gestor_reprovou', type: 'condition_approval_result', data: { result: 'reprovado' } },
            { key: 'pagar', type: 'action_move_card', data: { toPhase: 'pagamento' } },
            { key: 'voltar', type: 'action_move_phase', data: { phaseKey: 'triagem' } },
            { key: 'avisar_admin', type: 'action_notify_roles', data: { channel: 'app', message: 'Chegou', to: { roles: ['admin'] } } },
          ],
          edges: [
            { from: 'triagem_salva', to: 'invalido' },
            { from: 'invalido', to: 'recusar', when: 'sim' },
            { from: 'recusar', to: 'avisar_recusa' },
            { from: 'gestor_decidiu', to: 'gestor_aprovou', when: 'yes' },
            { from: 'gestor_decidiu', to: 'gestor_reprovou', when: 'no' },
            { from: 'gestor_aprovou', to: 'pagar' },
            { from: 'gestor_reprovou', to: 'voltar' },
            { from: 'pagar', to: 'avisar_admin' },
          ],
        },
      ],
    });
    const bp = blueprint as {
      phases: Array<{ sla?: unknown }>;
      kanban: unknown;
      flows: Array<{ nodes: Array<{ type: string; data: Record<string, unknown> }>; edges: Array<Record<string, unknown>> }>;
    };
    const [flow] = bp.flows;
    expect(bp.phases[1].sla).toEqual({ hours: 24, businessHours: true, warningPercent: 80 });
    expect(bp.kanban).toEqual({ cardValueField: 'valor_total' });
    expect(flow.nodes.map((node) => node.type)).toEqual([
      'trigger_phase_field_saved',
      'condition_field_value',
      'action_move_phase',
      'action_notification',
      'trigger_approval_completed',
      'condition_approval_result',
      'condition_approval_result',
      'action_move_phase',
      'action_move_phase',
      'action_notification',
    ]);
    expect(flow.nodes[0].data).toEqual({ phase: 'triagem' });
    expect(flow.nodes[1].data).toEqual({ fieldCode: 'comprovante_valido', operator: 'equals', value: 'false' });
    expect(flow.nodes[2].data).toEqual({ phase: 'recusado' });
    expect(flow.nodes[3].data).toEqual({ message: 'Recusado', channel: 'in_app', to: ['requester'] });
    expect(flow.nodes[5].data).toEqual({ result: 'approved' });
    expect(flow.nodes[6].data).toEqual({ result: 'rejected' });
    expect(flow.nodes[9].data).toEqual({ channel: 'in_app', message: 'Chegou', to: [{ role: 'admin' }] });
    expect(flow.edges.map((edge) => edge.when ?? null)).toEqual([null, 'yes', null, null, null, 'yes', 'yes', null]);
    expect(adjusted.length).toBeGreaterThan(15);
    // Só a regra de exibição na seção continua errada — e a mensagem diz como fazer.
    expect(errorsOf(blueprint)).toEqual([
      expect.stringMatching(/^form\.sections\[1\]\.visibility: Seção não tem regra de exibição\. .*next\.branches/),
    ]);
  });

    it('toCode tira acento e símbolo e começa por letra', () => {
    expect(toCode('Valor Total (R$)', 'campo')).toBe('valor_total_r');
    expect(toCode('1º contato', 'campo')).toBe('campo_1_contato');
    expect(toCode('!!!', 'secao')).toBe('secao');
  });
});
