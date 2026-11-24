import { BUILTIN_FLOW_VARIABLES } from '../flows/lib/flow-template-variables';
import { BLUEPRINT_LIMITS } from './blueprint/validate-blueprint';
import { FIELD_TYPE_GUIDE, FLOW_NODE_GUIDE, PHASE_COLORS } from './blueprint/blueprint-catalog';
import { EXAMPLE_PROCESS } from './blueprint/example-blueprint';
import { BLUEPRINT_SCHEMA_VERSION, FORM_SUBMIT, PHASE_FORM_END } from './blueprint/process-blueprint.types';

/** Manual em JSON para a LOPS IA (GET /ai/guide): como montar, o que existe e um exemplo completo. */
export function buildAiGuide(): Record<string, unknown> {
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    howTo: [
      'Consulte o catálogo (perfis, áreas, listas, ERP, processos parecidos) antes de citar qualquer coisa.',
      'Monte o processo no formato de GET /ai/schema/process.',
      'Confira com POST /ai/processes/validate até não haver erros (warnings são avisos).',
      'Mostre o resumo à pessoa e só crie com POST /ai/processes depois do "sim" dela.',
      'Envie sempre o cabeçalho Idempotency-Key (o mesmo nas tentativas da mesma criação).',
      'O processo nasce em rascunho: a pessoa revisa no Criador (builderUrl) e publica.',
    ],
    rules: [
      'Tudo por chave legível: seções e fases por "key", campos por "code", perfis por código, pessoas por e-mail, áreas e listas por id do catálogo.',
      'Códigos de campo são únicos no processo inteiro (abertura e fases): minúsculas, números e "_", começando por letra.',
      `Caminho entre seções: next.default (outra seção, "${FORM_SUBMIT}" na abertura ou "${PHASE_FORM_END}" na fase; ausente = a seguinte) e next.branches (por lista ou caixa de seleção da própria seção).`,
      'A primeira fase recebe as solicitações novas e não é terminal. Ao menos uma fase é terminal. Fase terminal não tem aprovação nem prazo.',
      'Aprovação da fase: approval.approvers (perfis e/ou pessoas) e rule any | all | sequential. Prefira perfis a pessoas.',
      'A própria fase cuida do caso simples, sem fluxo: approval.request (on_enter = pede ao entrar; on_complete = pede quando o formulário da fase fica completo), approval.onApproved "next" (aprovada, segue para a próxima fase) e approval.onRejected ("previous" volta uma fase; "close" encerra como reprovada). Use fluxo só quando o destino depende de condição (valor, tipo) ou pula fases.',
      'O formulário de uma fase é feito de seções com título (cada uma vira um campo "Título" com o código = chave da seção).',
      'Regras automáticas (aprovação por valor, devolução, avisos, pular fase) são fluxos. Saídas de condição usam when "yes" | "no".',
      'Um fluxo para as decisões do processo: o que acontece depois das aprovações vai num fluxo só, com uma entrada "Aprovação concluída" por fase de aprovação e as ações compartilhadas (ex.: um único "Mover para Triagem" ligado à reprovação do gerente e da diretoria). Não crie um fluxo por resultado.',
      'Toda "Aprovação concluída" passa por "Resultado da aprovação" antes de mover o card, e liga as duas saídas: aprovada (segue) e reprovada (devolve). Saída sem ligação deixa o card parado.',
      'Dois fluxos reagindo ao mesmo evento na mesma fase e movendo o card é erro: eles brigariam pelo card.',
      'Voltar para uma fase anterior nunca depende de aprovação. Aprovação pendente ou reprovada segura o card na fase.',
      'Não há como proibir um caminho no Kanban; ofereça um fluxo que devolve o card e avisa.',
      'Integrações com credencial (webhook, ERP, planilha, agente de IA) ficam em "pending".',
      'Chave desconhecida é erro: use só as chaves do schema.',
      'Ao refazer um processo que já existe (GET /ai/processes/:id), mantenha as opções que vieram em form (showResponderIdentification, requireResponderIdentification, requiresResponseApproval): chave ausente volta ao padrão.',
      'Alguns apelidos comuns (form.type, is_required, config, opções como texto, fase com name) são convertidos antes da conferência e listados em "adjusted": na próxima vez, escreva no formato do schema.',
    ],
    colors: PHASE_COLORS,
    limits: BLUEPRINT_LIMITS,
    fieldTypes: Object.entries(FIELD_TYPE_GUIDE).map(([type, guide]) => ({
      type,
      label: guide?.label,
      use: guide?.use,
      settings: guide?.settings,
      needsOptions: guide?.options ?? false,
      canBranch: guide?.branch ?? false,
      allowedInPhaseForm: guide?.phase,
      numeric: guide?.numeric ?? false,
      layoutOnly: guide?.layout ?? false,
    })),
    flowNodes: Object.entries(FLOW_NODE_GUIDE).map(([type, guide]) => ({ type, ...guide })),
    variables: [
      ...BUILTIN_FLOW_VARIABLES.map((variable) => ({ name: `{{${variable.name}}}`, label: variable.label })),
      { name: '{{<código do campo>}}', label: 'Resposta de um campo do formulário' },
    ],
    patterns: [
      {
        ask: 'Acima de R$ X, a diretoria aprova; reprovou, volta; aprovou, segue',
        how: 'Fase "Aprovação da diretoria" com approval. UM fluxo "Decisões das aprovações" com duas entradas: (1) Aprovação concluída (fase do gerente) → Resultado aprovado → yes: Condição valor > X → yes: Mover para a diretoria / no: Mover para a fase seguinte; no: Mover para a fase de devolução. (2) Aprovação concluída (fase da diretoria) → Resultado aprovado → yes: o mesmo "Mover para a fase seguinte"; no: o mesmo "Mover para a fase de devolução" → Notificação ao solicitante. Veja o exemplo.',
      },
      {
        ask: 'Se reprovar, volta para a fase Y',
        how: 'No fluxo de decisões: Aprovação concluída (fase) → Resultado aprovado → no: Mover para Y → Notificação ao solicitante. A saída yes do mesmo resultado leva à próxima fase.',
      },
      { ask: 'Aprovou, segue sozinho', how: 'Na fase: approval.onApproved "next" (e approval.onRejected "previous" ou "close"). Sem fluxo.' },
      { ask: 'Pedir a aprovação sozinho', how: 'Na fase: approval.request "on_enter" ou "on_complete" (quando o formulário da fase fica completo). Sem fluxo.' },
      { ask: 'Só avançar com os campos preenchidos', how: 'Na fase: requireFieldsToExit true e required nos campos do formulário da fase. Sem fluxo.' },
      { ask: 'Só avançar com alguém responsável pelo card', how: 'Na fase: requireAssigneeToExit true. Sem fluxo.' },
      { ask: 'Depois da fase X o card não volta mais', how: 'Na fase X: blockMoveBack true (ponto sem volta). Sem fluxo.' },
      { ask: 'Se for do tipo T, pula a fase Z', how: 'Fluxo: Entrou na fase anterior a Z → Condição tipo = T → yes: Mover para a fase depois de Z.' },
      { ask: 'Avisar quando chegar na fase', how: 'Fluxo: Entrou na fase → Notificação para { role } ou "responsible".' },
      { ask: 'Prazo estourado, avisar o gestor', how: 'Fase com sla. Fluxo: Prazo vencido (fase) → Notificação.' },
      {
        ask: 'Aprovação só acima de um valor, sem fase extra',
        how: 'Fluxo: Entrou na fase → Condição valor > X → yes: Criar aprovação (approverRoles). A aprovação segura o card até a decisão.',
      },
    ],
    example: EXAMPLE_PROCESS,
  };
}
