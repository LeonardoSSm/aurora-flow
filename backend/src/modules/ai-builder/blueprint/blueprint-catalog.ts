import { FormFieldType } from '../../../common/enums/form-field-type.enum';

/**
 * O que a IA pode usar ao montar um processo, com a descrição que vai para o manual
 * (GET /ai/guide) e as regras que a conferência cobra. Mudou um tipo de campo ou de nó? Este
 * arquivo é o contrato com a LOPS IA.
 */

export type FieldTypeGuide = {
  label: string;
  use: string;
  /** Configurações aceitas em `settings`, com o que cada uma faz. */
  settings: Record<string, string>;
  /** Precisa de `options`. */
  options?: boolean;
  /** Pode decidir ramificação de seção. */
  branch?: boolean;
  /** Pode ir no formulário de uma fase. */
  phase: boolean;
  /** Valor numérico: entra em fórmula e pode ser o valor do card. */
  numeric?: boolean;
  /** Só visual, não guarda resposta. */
  layout?: boolean;
};

const TEXT_SETTINGS = {
  placeholder: 'Texto de exemplo dentro do campo.',
  minLength: 'Mínimo de caracteres.',
  maxLength: 'Máximo de caracteres.',
};

export const FIELD_TYPE_GUIDE: Partial<Record<FormFieldType, FieldTypeGuide>> = {
  [FormFieldType.SHORT_TEXT]: { label: 'Texto curto', use: 'Nome, número de pedido, uma linha.', settings: TEXT_SETTINGS, phase: true },
  [FormFieldType.LONG_TEXT]: { label: 'Texto longo', use: 'Justificativa, parecer, observações.', settings: TEXT_SETTINGS, phase: true },
  [FormFieldType.NUMBER]: {
    label: 'Número',
    use: 'Quantidade, prazo em dias.',
    settings: { min: 'Mínimo.', max: 'Máximo.', decimals: 'Casas decimais.', placeholder: 'Texto de exemplo.' },
    phase: true,
    numeric: true,
  },
  [FormFieldType.CURRENCY]: {
    label: 'Valor em R$',
    use: 'Qualquer valor em dinheiro.',
    settings: { min: 'Mínimo.', max: 'Máximo.', placeholder: 'Texto de exemplo.' },
    phase: true,
    numeric: true,
  },
  [FormFieldType.CALCULATED]: {
    label: 'Cálculo',
    use: 'Resultado de fórmula sobre outros campos numéricos, ex.: {quantidade} * {valor_unitario}.',
    settings: {
      formula: 'Obrigatório. Campos entre chaves pelo código: {codigo}. Operadores + - * / e funções.',
      formulaDecimals: 'Casas decimais (padrão 2).',
      formulaPrefix: 'Texto antes do resultado, ex.: "R$ ".',
      formulaSuffix: 'Texto depois do resultado.',
      formulaFormat:
        '"hours" mostra o resultado em horas no relógio (8h30). Use com DURACAO({hora_inicio}; {hora_fim}) entre dois campos de Hora (casas decimais não se aplicam). Para cobrar por hora, outro cálculo multiplica: {total_horas} * 100, com formulaPrefix "R$ ".',
    },
    phase: true,
    numeric: true,
  },
  [FormFieldType.DATE]: { label: 'Data', use: 'Data de entrega, vencimento.', settings: { minDate: 'AAAA-MM-DD.', maxDate: 'AAAA-MM-DD.' }, phase: true },
  [FormFieldType.TIME]: { label: 'Hora', use: 'Horário.', settings: {}, phase: true },
  [FormFieldType.DATETIME]: { label: 'Data e hora', use: 'Momento exato.', settings: { minDate: 'AAAA-MM-DD.', maxDate: 'AAAA-MM-DD.' }, phase: true },
  [FormFieldType.EMAIL]: { label: 'E-mail', use: 'E-mail validado.', settings: { placeholder: 'Texto de exemplo.' }, phase: true },
  [FormFieldType.PHONE]: { label: 'Telefone', use: 'Telefone validado.', settings: { placeholder: 'Texto de exemplo.' }, phase: true },
  [FormFieldType.CPF]: { label: 'CPF', use: 'CPF validado. Marque sensitive.', settings: {}, phase: true },
  [FormFieldType.CNPJ]: { label: 'CNPJ', use: 'CNPJ validado.', settings: {}, phase: true },
  [FormFieldType.CEP]: { label: 'CEP', use: 'CEP validado.', settings: {}, phase: true },
  [FormFieldType.SINGLE_SELECT]: {
    label: 'Lista de opção única',
    use: 'Tipo, categoria, urgência — uma resposta. Decide ramificação.',
    settings: {
      displayAs: '"dropdown" para lista suspensa com busca; ausente = botões.',
      itemListId: 'Id de uma lista de itens do catálogo: as opções vêm dela.',
    },
    options: true,
    branch: true,
    phase: true,
  },
  [FormFieldType.MULTI_SELECT]: {
    label: 'Lista de opção múltipla',
    use: 'Várias respostas. Decide ramificação (a opção estar marcada).',
    settings: {
      displayAs: '"dropdown" para lista suspensa com busca.',
      itemListId: 'Id de uma lista de itens do catálogo.',
    },
    options: true,
    branch: true,
    phase: true,
  },
  [FormFieldType.CHECKBOX]: { label: 'Caixa de seleção (sim/não)', use: 'Confirmação. Decide ramificação.', settings: {}, branch: true, phase: true },
  [FormFieldType.FILE_UPLOAD]: {
    label: 'Anexo',
    use: 'Documento, foto, nota fiscal.',
    settings: {
      allowedMimeTypes: 'Lista, ex.: ["application/pdf","image/jpeg"].',
      requireFileLabel:
        'true (padrão) = cada arquivo enviado precisa ser renomeado ou descrito; false = não pede. Não há limite de tamanho nem de quantidade.',
    },
    phase: true,
  },
  [FormFieldType.PRODUCT_TABLE]: {
    label: 'Tabela de itens',
    use: 'Produtos com quantidade e valor (as opções são os produtos).',
    settings: {
      productTableColumns: 'Colunas extras: [{ id, label, type: "text"|"number"|"currency", filledBy: "respondent"|"creator" }].',
      productTableProductValues: 'Valores fixos por produto para colunas filledBy "creator".',
    },
    options: true,
    phase: true,
  },
  [FormFieldType.ERP_LOOKUP]: {
    label: 'Lista do ERP',
    use: 'Escolher um registro do ERP (cliente, produto). Só no formulário de abertura.',
    settings: {
      erpConnectorId: 'Obrigatório: id do conector (catálogo ERP).',
      fonte: 'Obrigatório: lista do ERP (catálogo ERP).',
      modo: 'Modo de busca da lista (catálogo ERP).',
      minCaracteres: 'Mínimo de letras antes de buscar.',
      exigirLogin: 'Só quem está logado pode buscar.',
      placeholder: 'Texto de exemplo.',
    },
    phase: false,
  },
  [FormFieldType.SCALE]: { label: 'Escala', use: 'Nota numa escala.', settings: { min: 'Início.', max: 'Fim.' }, phase: true, numeric: true },
  [FormFieldType.RATING]: { label: 'Avaliação', use: 'Estrelas.', settings: { max: 'Máximo de estrelas.' }, phase: true, numeric: true },
  [FormFieldType.TITLE]: { label: 'Título', use: 'Subtítulo visual dentro da seção (abertura).', settings: {}, phase: false, layout: true },
  [FormFieldType.DESCRIPTION]: { label: 'Descrição', use: 'Texto explicativo.', settings: {}, phase: true, layout: true },
  [FormFieldType.DIVIDER]: { label: 'Divisor', use: 'Linha separadora.', settings: {}, phase: true, layout: true },
};

export const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;

/**
 * Nós de fluxo que a IA monta e as chaves de `data` de cada um (no vocabulário do processo: fase
 * pela chave, pessoas por e-mail, perfis por código). O resto dos nós existe no editor de
 * fluxos, mas fica para a pessoa (precisa de credencial, ERP, webhook...).
 */
export type FlowNodeGuide = { label: string; use: string; data: Record<string, string> };

export const FLOW_NODE_GUIDE: Record<string, FlowNodeGuide> = {
  trigger_solicitation_created: { label: 'Solicitação criada', use: 'Quando alguém envia o formulário de abertura.', data: {} },
  trigger_phase_entered: {
    label: 'Entrou na fase',
    use: 'Quando o card chega numa fase (por pessoa ou por fluxo).',
    data: { phase: 'Chave da fase (vazio = qualquer).', fromPhase: 'Só vindo desta fase (opcional).' },
  },
  trigger_approval_completed: {
    label: 'Aprovação concluída',
    use: 'Quando a aprovação de uma fase é decidida. Siga com "Resultado da aprovação".',
    data: { phase: 'Chave da fase da aprovação (recomendado).' },
  },
  trigger_phase_field_saved: {
    label: 'Campos da fase salvos',
    use: 'Quando quem atua salva o formulário da fase.',
    data: { phase: 'Chave da fase (vazio = qualquer).' },
  },
  trigger_sla_warning: { label: 'Prazo em alerta', use: 'Prazo da fase perto de vencer.', data: { phase: 'Chave da fase (vazio = qualquer fase com prazo).' } },
  trigger_sla_breached: { label: 'Prazo vencido', use: 'Prazo da fase vencido.', data: { phase: 'Chave da fase (vazio = qualquer fase com prazo).' } },
  condition_field_value: {
    label: 'Condição de campo',
    use: 'Compara um campo do formulário. Saídas "yes" e "no".',
    data: {
      fieldCode: 'Código do campo (abertura ou fase).',
      operator: 'equals | not_equals | contains | greater_than | less_than | is_empty | is_not_empty.',
      value: 'Valor comparado, em texto (ex.: "10000").',
    },
  },
  condition_approval_result: {
    label: 'Resultado da aprovação',
    use: 'Depois de "Aprovação concluída" ou "Criar aprovação". Saídas "yes" e "no".',
    data: { result: 'approved | rejected.' },
  },
  condition_solicitation_priority: {
    label: 'Prioridade',
    use: 'Compara a prioridade da solicitação. Saídas "yes" e "no".',
    data: { operator: 'equals | not_equals | greater_than | less_than.', value: 'low | medium | high | urgent.' },
  },
  condition_always_true: { label: 'Sempre', use: 'Só organiza o desenho; sempre segue por "yes".', data: {} },
  action_move_phase: { label: 'Mover para fase', use: 'Muda o card de fase (para trás não exige aprovação).', data: { phase: 'Obrigatório: chave da fase.' } },
  action_create_approval: {
    label: 'Criar aprovação',
    use: 'Cria a aprovação da fase atual e segura o card até a decisão. O fluxo espera e segue depois.',
    data: {
      title: 'Obrigatório. Aceita {{variáveis}}.',
      description: 'Opcional.',
      approverRoles: 'Perfis que aprovam (basta uma pessoa de cada).',
      approverUsers: 'E-mails de pessoas que aprovam.',
      useApproversOfPhase: 'true = quem aprova vem da configuração da fase.',
      rule: 'any | all | sequential (padrão any).',
      notifyByEmail: 'true = avisa quem aprova por e-mail.',
    },
  },
  action_notification: {
    label: 'Notificação',
    use: 'Avisa pessoas no app, por e-mail ou WhatsApp.',
    data: {
      channel: 'in_app | email | whatsapp.',
      to: 'Lista: "requester" (solicitante), "responsible" (responsável), { "role": "<código>" }, { "users": ["e-mail"] }, { "field": "<código do campo com e-mail/telefone>" }.',
      title: 'Assunto (obrigatório no e-mail).',
      message: 'Obrigatório. Texto com {{variáveis}}.',
    },
  },
  action_assign_responsible: { label: 'Atribuir responsável', use: 'Define o responsável do card.', data: { user: 'E-mail da pessoa.' } },
  action_wait_for_phase_fields: {
    label: 'Esperar campos da fase',
    use: 'Pausa o fluxo até salvarem o formulário de uma fase.',
    data: { phase: 'Obrigatório: chave da fase.' },
  },
};

export const CONDITION_NODE_TYPES = new Set([
  'condition_field_value',
  'condition_approval_result',
  'condition_solicitation_priority',
  'condition_always_true',
]);

/** Gatilhos que já trazem a fase para os nós seguintes (aprovação da fase, por exemplo). */
export const PHASE_CONTEXT_TRIGGERS = new Set([
  'trigger_phase_entered',
  'trigger_approval_completed',
  'trigger_phase_field_saved',
  'trigger_sla_warning',
  'trigger_sla_breached',
]);

export const PHASE_COLORS = ['blue', 'amber', 'green', 'red', 'purple', 'gray'];
