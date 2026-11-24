import type { ProcessBlueprint } from './process-blueprint.types';

/**
 * Exemplo completo (Pedido de Compra) — vai no manual da IA (GET /ai/guide) e nos testes. Os
 * perfis "compras", "gerente" e "diretor" são ilustrativos: a IA usa os do catálogo.
 */
export const EXAMPLE_PROCESS: ProcessBlueprint = {
  schemaVersion: 1,
  name: 'Pedido de Compra',
  description: 'Compra de materiais e serviços, com aprovação da diretoria acima de R$ 10 mil.',
  form: {
    mode: 'stepper',
    sections: [
      {
        key: 'dados',
        title: 'Dados do pedido',
        fields: [
          {
            code: 'tipo',
            label: 'Tipo de compra',
            type: 'single_select',
            required: true,
            options: [
              { value: 'material', label: 'Material' },
              { value: 'servico', label: 'Serviço' },
            ],
          },
          { code: 'valor_total', label: 'Valor total', type: 'currency', required: true },
          {
            code: 'justificativa',
            label: 'Justificativa',
            type: 'long_text',
            visibility: { action: 'show', conditions: [{ field: 'valor_total', op: 'greater_than', value: 5000 }] },
          },
        ],
        next: { default: 'itens', branches: [{ field: 'tipo', option: 'servico', goTo: 'escopo' }] },
      },
      {
        key: 'itens',
        title: 'Itens',
        fields: [{ code: 'descricao_itens', label: 'Itens e quantidades', type: 'long_text', required: true }],
        next: { default: 'submit' },
      },
      {
        key: 'escopo',
        title: 'Escopo do serviço',
        fields: [{ code: 'escopo_servico', label: 'O que será feito', type: 'long_text', required: true }],
      },
    ],
  },
  phases: [
    { key: 'triagem', label: 'Triagem', actors: { roles: ['compras'] }, sla: { hours: 8, businessHours: true } },
    {
      key: 'aprovacao_gerente',
      label: 'Aprovação do gerente',
      actors: { roles: ['compras'] },
      approval: { approvers: { roles: ['gerente'] }, rule: 'any' },
      sections: [
        {
          key: 'sec_parecer',
          title: 'Parecer',
          fields: [{ code: 'parecer_gerente', label: 'Parecer', type: 'long_text', required: true }],
        },
      ],
    },
    { key: 'aprovacao_diretoria', label: 'Aprovação da diretoria', approval: { approvers: { roles: ['diretor'] } } },
    {
      key: 'compra',
      label: 'Compra',
      actors: { roles: ['compras'] },
      sections: [
        {
          key: 'sec_frete',
          title: 'Frete',
          fields: [
            {
              code: 'modalidade',
              label: 'Modalidade',
              type: 'single_select',
              required: true,
              options: [
                { value: 'nacional', label: 'Nacional' },
                { value: 'importacao', label: 'Importação' },
              ],
            },
          ],
          next: { default: 'sec_fechamento', branches: [{ field: 'modalidade', option: 'importacao', goTo: 'sec_importacao' }] },
        },
        {
          key: 'sec_importacao',
          title: 'Dados de importação',
          fields: [{ code: 'incoterm', label: 'Incoterm', type: 'short_text', required: true }],
        },
        {
          key: 'sec_fechamento',
          title: 'Fechamento',
          fields: [{ code: 'valor_final', label: 'Valor final', type: 'currency', required: true }],
        },
      ],
    },
    { key: 'concluido', label: 'Concluído', terminal: true },
  ],
  kanban: { cardValueField: 'valor_total' },
  // Um fluxo para as decisões do processo: uma entrada por fase de aprovação, ações compartilhadas.
  flows: [
    {
      name: 'Decisões das aprovações',
      nodes: [
        { key: 'gerente_decidiu', type: 'trigger_approval_completed', data: { phase: 'aprovacao_gerente' } },
        { key: 'gerente_aprovou', type: 'condition_approval_result', data: { result: 'approved' } },
        { key: 'valor', type: 'condition_field_value', data: { fieldCode: 'valor_total', operator: 'greater_than', value: '10000' } },
        { key: 'diretoria_decidiu', type: 'trigger_approval_completed', data: { phase: 'aprovacao_diretoria' } },
        { key: 'diretoria_aprovou', type: 'condition_approval_result', data: { result: 'approved' } },
        { key: 'para_diretoria', type: 'action_move_phase', data: { phase: 'aprovacao_diretoria' } },
        { key: 'para_compra', type: 'action_move_phase', data: { phase: 'compra' } },
        { key: 'devolve', type: 'action_move_phase', data: { phase: 'triagem' } },
        {
          key: 'avisa',
          type: 'action_notification',
          data: {
            channel: 'in_app',
            to: ['requester'],
            message: 'Seu pedido "{{solicitation_title}}" foi reprovado e voltou para a triagem.',
          },
        },
      ],
      edges: [
        { from: 'gerente_decidiu', to: 'gerente_aprovou' },
        { from: 'gerente_aprovou', to: 'valor', when: 'yes' },
        { from: 'gerente_aprovou', to: 'devolve', when: 'no' },
        { from: 'valor', to: 'para_diretoria', when: 'yes' },
        { from: 'valor', to: 'para_compra', when: 'no' },
        { from: 'diretoria_decidiu', to: 'diretoria_aprovou' },
        { from: 'diretoria_aprovou', to: 'para_compra', when: 'yes' },
        { from: 'diretoria_aprovou', to: 'devolve', when: 'no' },
        { from: 'devolve', to: 'avisa' },
      ],
    },
  ],
  pending: [],
};
