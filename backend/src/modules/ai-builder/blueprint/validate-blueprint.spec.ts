/* eslint-disable @typescript-eslint/no-non-null-assertion -- o exemplo do manual tem esses campos; o teste os altera */
import { blueprintFlowToDto, blueprintToFormDto, blueprintToPhasesDto } from './blueprint-to-dtos';
import { EXAMPLE_PROCESS } from './example-blueprint';
import type { ProcessBlueprint } from './process-blueprint.types';
import { collectBlueprintEmails, validateBlueprint, type BlueprintContext } from './validate-blueprint';

const ctx: BlueprintContext = {
  roleCodes: new Set(['compras', 'gerente', 'diretor']),
  userIdByEmail: new Map([['ana@empresa.com', 'user-ana']]),
  areaIds: new Set(['area-compras']),
  itemListIds: new Set(),
};

const clone = (): ProcessBlueprint => JSON.parse(JSON.stringify(EXAMPLE_PROCESS)) as ProcessBlueprint;
const paths = (bp: unknown) => validateBlueprint(bp, ctx).errors.map((issue) => issue.path);
const messages = (bp: unknown) => validateBlueprint(bp, ctx).errors.map((issue) => `${issue.path}: ${issue.message}`);

describe('validateBlueprint', () => {
  it('o exemplo do manual é válido', () => {
    expect(messages(EXAMPLE_PROCESS)).toEqual([]);
  });

  it('referências que não existem viram erro com o caminho exato', () => {
    const bp = clone();
    bp.phases[1].approval!.approvers.roles = ['diretoria_geral'];
    bp.form.sections[0].next!.branches![0].goTo = 'nao_existe';
    bp.flows![0].nodes[3].data = { phase: 'fase_fantasma' };
    bp.phases[0].actors = { users: ['ninguem@empresa.com'] };
    expect(paths(bp)).toEqual(
      expect.arrayContaining([
        'phases[1].approval.approvers.roles[0]',
        'form.sections[0].next.branches[0].goTo',
        'flows[0].nodes[3].data.phase',
        'phases[0].actors.users[0]',
      ]),
    );
  });

  it('códigos são únicos no processo inteiro (abertura e fases)', () => {
    const bp = clone();
    bp.phases[3].sections![2].fields[0].code = 'valor_total';
    expect(messages(bp)).toEqual(
      expect.arrayContaining([expect.stringContaining('Código "valor_total" repetido')]),
    );
  });

  it('chave desconhecida é erro (o contrato é fechado)', () => {
    const bp = clone() as unknown as Record<string, unknown>;
    (bp.phases as Array<Record<string, unknown>>)[0].quemAprova = 'diretor';
    expect(paths(bp)).toContain('phases[0].quemAprova');
  });

  it('cobra fase terminal, aprovação com aprovador e nada de aprovação na terminal', () => {
    const bp = clone();
    bp.phases[4].terminal = false;
    bp.phases[2].approval = { approvers: {} };
    expect(messages(bp)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ao menos uma fase como terminal'),
        expect.stringContaining('phases[2].approval.approvers: Diga quem aprova'),
      ]),
    );
  });

  it('ramificação só por lista ou caixa de seleção, e com opção que existe', () => {
    const bp = clone();
    bp.form.sections[0].next!.branches = [
      { field: 'valor_total', goTo: 'escopo' },
      { field: 'tipo', option: 'locacao', goTo: 'escopo' },
    ];
    expect(messages(bp)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Ramifique por uma lista ou caixa de seleção'),
        expect.stringContaining('A opção "locacao" não existe'),
      ]),
    );
  });

  it('seção sem caminho que chegue nela é erro', () => {
    const bp = clone();
    bp.form.sections[0].next = { default: 'itens' };
    expect(messages(bp)).toEqual(expect.arrayContaining([expect.stringContaining('Nenhum caminho chega à seção "escopo"')]));
  });

  it('configuração que não existe no tipo e fórmula com campo errado', () => {
    const bp = clone();
    bp.form.sections[0].fields[1].settings = { moeda: 'BRL' };
    bp.form.sections[1].fields.push({
      code: 'total',
      label: 'Total',
      type: 'calculated',
      settings: { formula: '{valor_total} * {quantidade}' },
    });
    expect(messages(bp)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"moeda" não é configuração de "Valor em R$"'),
        expect.stringContaining('{quantidade}, que não existe'),
      ]),
    );
  });

  it('campo de fase: sem ERP, sem título solto e sem regra de exibição', () => {
    const bp = clone();
    bp.phases[1].sections![0].fields.push(
      { code: 'cliente_erp', label: 'Cliente', type: 'erp_lookup', settings: { erpConnectorId: 'c', fonte: 'f' } },
      { code: 'subtitulo', label: 'Sub', type: 'title' },
      { code: 'obs', label: 'Obs', type: 'short_text', visibility: { action: 'show', conditions: [{ field: 'tipo', op: 'equals', value: 'x' }] } },
    );
    const found = messages(bp).join('\n');
    expect(found).toContain('não existe no formulário de uma fase');
    expect(found).toContain('abra uma nova seção');
    expect(found).toContain('não tem regra de exibição');
  });

  it('fluxo: saída de condição precisa de when, sem ciclo e só nós aceitos', () => {
    const bp = clone();
    bp.flows![0].edges[1] = { from: 'gerente_aprovou', to: 'valor' };
    bp.flows![0].nodes.push({ key: 'webhook', type: 'action_webhook', data: {} });
    bp.flows![0].edges.push({ from: 'para_compra', to: 'gerente_aprovou' }, { from: 'avisa', to: 'gerente_decidiu' });
    const found = messages(bp).join('\n');
    expect(found).toContain('flows[0].edges[1].when');
    expect(found).toContain('não é criado pela IA');
    expect(found).toContain('formam um ciclo');
    expect(found).toContain('Gatilho não recebe ligação');
  });

  it('decisões das aprovações: o exemplo usa um fluxo com duas entradas e ações compartilhadas, sem avisos', () => {
    const result = validateBlueprint(EXAMPLE_PROCESS, ctx);
    expect(EXAMPLE_PROCESS.flows).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((issue) => issue.path.startsWith('flows'))).toEqual([]);
  });

  it('decisões das aprovações separadas como a IA fez: aprovação que move sem conferir o resultado, dois fluxos no mesmo evento e resultado sem saída', () => {
    const bp = clone();
    const move = (key: string, phase: string) => ({ key, type: 'action_move_phase', data: { phase } });
    bp.flows = [
      {
        name: 'Reprovação do gerente volta para a triagem',
        nodes: [
          { key: 't', type: 'trigger_approval_completed', data: { phase: 'aprovacao_gerente' } },
          { key: 'reprovou', type: 'condition_approval_result', data: { result: 'rejected' } },
          move('triagem', 'triagem'),
        ],
        edges: [
          { from: 't', to: 'reprovou' },
          { from: 'reprovou', to: 'triagem', when: 'yes' },
        ],
      },
      {
        name: 'Gerente decidiu: acima de 10 mil vai para a diretoria',
        nodes: [
          { key: 't', type: 'trigger_approval_completed', data: { phase: 'aprovacao_gerente' } },
          { key: 'valor', type: 'condition_field_value', data: { fieldCode: 'valor_total', operator: 'greater_than', value: '10000' } },
          move('diretoria', 'aprovacao_diretoria'),
          move('compra', 'compra'),
        ],
        edges: [
          { from: 't', to: 'valor' },
          { from: 'valor', to: 'diretoria', when: 'yes' },
          { from: 'valor', to: 'compra', when: 'no' },
        ],
      },
      {
        name: 'Reprovação da diretoria volta para a triagem',
        nodes: [
          { key: 't', type: 'trigger_approval_completed', data: { phase: 'aprovacao_diretoria' } },
          { key: 'reprovou', type: 'condition_approval_result', data: { result: 'rejected' } },
          move('triagem', 'triagem'),
        ],
        edges: [
          { from: 't', to: 'reprovou' },
          { from: 'reprovou', to: 'triagem', when: 'yes' },
        ],
      },
    ];
    const result = validateBlueprint(bp, ctx);
    const errors = result.errors.map((issue) => `${issue.path}: ${issue.message}`);
    expect(errors).toEqual([
      expect.stringMatching(/^flows\[1\]\.nodes\[0\]: Esta "Aprovação concluída" move o card sem conferir o resultado/),
      expect.stringMatching(/^flows\[1\]\.nodes\[0\]: Outra entrada já reage ao mesmo evento na fase "aprovacao_gerente" .*\(flows\[0\]\.nodes\[0\]\)/),
    ]);
    expect(result.warnings.map((issue) => `${issue.path}: ${issue.message}`)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^flows\[0\]\.nodes\[0\]: Quando a aprovação for aprovada, nada acontece/),
        expect.stringMatching(/^flows\[2\]\.nodes\[0\]: Quando a aprovação for aprovada, nada acontece/),
      ]),
    );
  });

  it('duas condições em paralelo (aprovada / reprovada) cobrem os dois resultados: sem aviso', () => {
    const bp = clone();
    bp.flows = [
      {
        name: 'Decisões das aprovações',
        nodes: [
          { key: 'gerente', type: 'trigger_approval_completed', data: { phase: 'aprovacao_gerente' } },
          { key: 'aprovou', type: 'condition_approval_result', data: { result: 'approved' } },
          { key: 'reprovou', type: 'condition_approval_result', data: { result: 'rejected' } },
          { key: 'segue', type: 'action_move_phase', data: { phase: 'compra' } },
          { key: 'volta', type: 'action_move_phase', data: { phase: 'triagem' } },
        ],
        edges: [
          { from: 'gerente', to: 'aprovou' },
          { from: 'gerente', to: 'reprovou' },
          { from: 'aprovou', to: 'segue', when: 'yes' },
          { from: 'reprovou', to: 'volta', when: 'yes' },
        ],
      },
    ];
    const result = validateBlueprint(bp, ctx);
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((issue) => issue.path.startsWith('flows'))).toEqual([]);
  });

  it('entradas em fases diferentes, ou que não movem o card, não brigam', () => {
    const bp = clone();
    bp.flows!.push({
      name: 'Aviso quando a diretoria decide',
      nodes: [
        { key: 't', type: 'trigger_approval_completed', data: { phase: 'aprovacao_diretoria' } },
        { key: 'r', type: 'condition_approval_result', data: { result: 'approved' } },
        { key: 'a', type: 'action_notification', data: { channel: 'in_app', to: ['requester'], message: 'Decidido' } },
        { key: 'b', type: 'action_notification', data: { channel: 'in_app', to: ['requester'], message: 'Reprovado' } },
      ],
      edges: [
        { from: 't', to: 'r' },
        { from: 'r', to: 'a', when: 'yes' },
        { from: 'r', to: 'b', when: 'no' },
      ],
    });
    expect(messages(bp)).toEqual([]);
  });

  it('coleta os e-mails citados para buscar só essas pessoas', () => {
    const bp = clone();
    bp.phases[0].actors = { users: ['Ana@Empresa.com'] };
    bp.phases[1].approval = { approvers: { users: ['bia@empresa.com'] }, rule: 'sequential', order: ['user:bia@empresa.com'] };
    bp.flows![0].nodes.push({ key: 'resp', type: 'action_assign_responsible', data: { user: 'caio@empresa.com' } });
    expect(collectBlueprintEmails(bp).sort()).toEqual(['ana@empresa.com', 'bia@empresa.com', 'caio@empresa.com']);
  });
});

describe('conversão para o que o sistema grava', () => {
  it('formulário: índices de seção, ramificação, regra de exibição e o criador como responsável', () => {
    const dto = blueprintToFormDto(EXAMPLE_PROCESS, 'user-ana');
    expect(dto.assignedUserIds).toEqual(['user-ana']);
    expect(dto.sections.map((section) => section.nextSectionIndex)).toEqual([1, null, null]);
    expect(dto.sections[0].branches).toEqual([{ fieldCode: 'tipo', optionValue: 'servico', targetSectionIndex: 2 }]);
    expect(dto.sections[0].fields[2].visibilityRules).toEqual([
      { operator: 'and', action: 'show', conditions: [{ fieldCode: 'valor_total', operator: 'greater_than', value: 5000 }] },
    ]);
  });

  it('fases: título de seção vira campo "Título" e o caminho vai em sectionFlow', () => {
    const dto = blueprintToPhasesDto(EXAMPLE_PROCESS, new Map());
    const compra = dto.phases[3];
    expect(compra.fields.map((field) => `${field.fieldType}:${field.code}`)).toEqual([
      'title:sec_frete',
      'single_select:modalidade',
      'title:sec_importacao',
      'short_text:incoterm',
      'title:sec_fechamento',
      'currency:valor_final',
    ]);
    expect(compra.sectionFlow).toEqual([
      {
        section: 'sec_frete',
        next: 'sec_fechamento',
        branches: [{ fieldCode: 'modalidade', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' }],
      },
    ]);
    expect(dto.phases[1]).toEqual(
      expect.objectContaining({ requiresApproval: true, approvers: { roleCodes: ['gerente'], userIds: [] }, approvalMode: 'any' }),
    );
    expect(dto.phases[4]).toEqual(expect.objectContaining({ isTerminal: true, slaHours: null }));
  });

  it('fluxo: fases viram ids, condição ganha a saída e aviso por perfil vira lista de pessoas', () => {
    const bp = clone();
    bp.flows![0].nodes[8].data = { channel: 'in_app', to: [{ role: 'compras' }], message: 'Voltou' };
    const { dto, warnings } = blueprintFlowToDto(bp.flows![0], {
      formId: 'form-1',
      phaseIdByKey: new Map([
        ['aprovacao_gerente', 'p-ger'],
        ['aprovacao_diretoria', 'p-dir'],
        ['compra', 'p-compra'],
        ['triagem', 'p-tri'],
      ]),
      phaseLabelByKey: new Map(),
      userIdByEmail: new Map(),
      userIdsByRole: new Map([['compras', ['u1', 'u2']]]),
    });
    expect(dto.nodes?.[0]).toEqual(
      expect.objectContaining({ id: 'gerente_decidiu', type: 'trigger_approval_completed', data: { formId: 'form-1', phaseId: 'p-ger' } }),
    );
    expect(dto.nodes?.[1].data).toEqual({ operator: 'equals', value: 'approved' });
    expect(dto.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'valor', target: 'para_diretoria', sourceHandle: 'yes' }),
        // Duas entradas chegam à mesma ação.
        expect.objectContaining({ source: 'gerente_aprovou', target: 'devolve', sourceHandle: 'no' }),
        expect.objectContaining({ source: 'diretoria_aprovou', target: 'devolve', sourceHandle: 'no' }),
      ]),
    );
    expect(dto.nodes?.[3]).toEqual(
      expect.objectContaining({ id: 'diretoria_decidiu', data: { formId: 'form-1', phaseId: 'p-dir' } }),
    );
    expect(dto.edges?.find((edge) => edge.source === 'gerente_decidiu')?.sourceHandle).toBeUndefined();
    expect(dto.nodes?.[8].data).toEqual(
      expect.objectContaining({ recipients: [{ type: 'users', userIds: ['u1', 'u2'] }], content: 'Voltou' }),
    );
    expect(warnings[0].message).toContain('perfil "compras"');
  });
});
