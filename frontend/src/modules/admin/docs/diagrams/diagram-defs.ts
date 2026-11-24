import type { DiagramRegistry } from '../../../docs-kit/diagrams/diagram.types';

/**
 * Diagramas da documentacao tecnica. O formato, a paleta e a regra de layout
 * (maximo 4 colunas) vivem no docs-kit; aqui ficam apenas os desenhos.
 */
export const TECHNICAL_DIAGRAMS: DiagramRegistry = {
  'arquitetura-geral': {
    title: 'Arquitetura geral',
    description:
      'Camadas do sistema e o caminho de uma requisição autenticada até o banco, com os processos assíncronos que rodam em paralelo.',
    height: 420,
    nodes: [
      { id: 'spa', kind: 'entrada', title: 'SPA React', subtitle: 'Vite + React Query', x: 0, y: 30 },
      { id: 'mobile', kind: 'entrada', title: 'App mobile', subtitle: 'Expo (push)', x: 0, y: 145 },
      { id: 'externo', kind: 'externo', title: 'Sistemas externos', subtitle: 'ERP, WhatsApp…', x: 0, y: 260 },
      { id: 'api', kind: 'api', title: 'API NestJS', subtitle: '/api/v1 · Helmet · CORS · Throttler', x: 300, y: 145 },
      { id: 'cron', kind: 'servico', title: 'Cron', subtitle: 'SLA, sync, retries, saúde', x: 300, y: 300 },
      { id: 'guards', kind: 'decisao', title: 'Guards de acesso', subtitle: 'JWT → permissão → escopo', x: 600, y: 30 },
      { id: 'servicos', kind: 'servico', title: 'Serviços de domínio', subtitle: 'Formulários, solicitações…', x: 600, y: 145 },
      { id: 'eventos', kind: 'evento', title: 'EventEmitter2', subtitle: 'eventos de domínio', x: 600, y: 260 },
      { id: 'db', kind: 'banco', title: 'PostgreSQL', subtitle: 'TypeORM · 41 tabelas', x: 900, y: 30 },
      // Prometheus alinhado com "Serviços" e RabbitMQ alinhado com "EventEmitter2":
      // nessa ordem as duas arestas saem horizontais e não se cruzam.
      { id: 'prom', kind: 'externo', title: 'Prometheus / Grafana', subtitle: '/metrics', x: 900, y: 145 },
      {
        id: 'rabbit',
        kind: 'fila',
        title: 'RabbitMQ',
        subtitle: 'consumida pelo próprio backend · DLQ',
        x: 900,
        y: 260,
      },
    ],
    edges: [
      { id: 'e1', source: 'spa', target: 'api', label: 'JWT' },
      { id: 'e2', source: 'mobile', target: 'api', label: 'JWT' },
      { id: 'e3', source: 'externo', target: 'api', label: 'webhook' },
      { id: 'e4', source: 'api', target: 'guards' },
      { id: 'e5', source: 'guards', target: 'servicos', label: 'com escopo' },
      { id: 'e6', source: 'cron', target: 'servicos' },
      { id: 'e7', source: 'servicos', target: 'db' },
      { id: 'e8', source: 'servicos', target: 'eventos', label: 'emit()' },
      // O laço fila → consumidor é omitido aqui de propósito: uma aresta de volta
      // atravessaria os cards do meio. Ele está detalhado no diagrama do motor de fluxos.
      { id: 'e9', source: 'eventos', target: 'rabbit', label: 'publish' },
      { id: 'e10', source: 'servicos', target: 'prom', label: 'métricas' },
    ],
  },

  'ciclo-solicitacao': {
    title: 'Ciclo de vida de uma solicitação',
    description:
      'As três origens possíveis de uma solicitação e o caminho até a conclusão, incluindo SLA e aprovação.',
    height: 500,
    nodes: [
      { id: 'form', kind: 'entrada', title: 'Resposta de formulário', subtitle: 'origin_type = form_submission', x: 0, y: 20 },
      { id: 'manual', kind: 'entrada', title: 'Criação manual', subtitle: 'origin_type = manual', x: 0, y: 140 },
      { id: 'hook', kind: 'entrada', title: 'Webhook de entrada', subtitle: 'origin_type = webhook', x: 0, y: 260 },
      { id: 'nova', kind: 'servico', title: 'Solicitação criada', subtitle: 'status new · token de rastreio', x: 300, y: 140 },
      { id: 'sla', kind: 'servico', title: 'SLA inicializado', subtitle: 'sla_due_at · alerta em 80%', x: 300, y: 260 },
      { id: 'evento', kind: 'evento', title: 'solicitations.created', subtitle: 'auditoria + fluxos', x: 300, y: 380 },
      { id: 'analise', kind: 'servico', title: 'Em análise', subtitle: 'in_analysis', x: 600, y: 20 },
      { id: 'aprov', kind: 'decisao', title: 'Aguardando aprovação', subtitle: 'waiting_approval', x: 600, y: 140 },
      { id: 'exec', kind: 'servico', title: 'Em execução', subtitle: 'in_progress · integrações', x: 600, y: 260 },
      { id: 'concl', kind: 'servico', title: 'Concluída', subtitle: 'completed · SLA encerrado', x: 900, y: 80 },
      { id: 'rej', kind: 'servico', title: 'Rejeitada / cancelada', subtitle: 'rejected · cancelled', x: 900, y: 200 },
    ],
    edges: [
      { id: 'c1', source: 'form', target: 'nova', label: 'evento' },
      { id: 'c2', source: 'manual', target: 'nova' },
      { id: 'c3', source: 'hook', target: 'nova', label: 'fluxo' },
      { id: 'c4', source: 'nova', target: 'sla' },
      { id: 'c5', source: 'nova', target: 'evento' },
      { id: 'c6', source: 'nova', target: 'analise' },
      { id: 'c7', source: 'analise', target: 'aprov' },
      { id: 'c8', source: 'aprov', target: 'concl', label: 'aprovado' },
      { id: 'c9', source: 'aprov', target: 'rej', label: 'reprovado', failure: true },
      { id: 'c10', source: 'exec', target: 'concl' },
      { id: 'c11', source: 'aprov', target: 'exec', label: 'execução' },
    ],
  },

  'motor-flows': {
    title: 'Motor de fluxos: do evento à execução',
    description:
      'Como um evento de domínio vira uma execução de fluxo, passando pela fila, e onde a execução é registrada.',
    height: 440,
    nodes: [
      { id: 'ev', kind: 'evento', title: 'Evento de domínio', subtitle: 'responses.submitted, approvals.approved…', x: 0, y: 120 },
      { id: 'listener', kind: 'servico', title: 'Listener do fluxo', subtitle: 'Flows*Listener', x: 300, y: 50 },
      { id: 'match', kind: 'decisao', title: 'Casamento do gatilho', subtitle: 'tipo + formId efetivo', x: 300, y: 190 },
      { id: 'queue', kind: 'fila', title: 'Fila RabbitMQ', subtitle: 'job com o contexto serializado', x: 600, y: 50 },
      { id: 'consumer', kind: 'servico', title: 'FlowsConsumer', subtitle: 'executeContextJob', x: 600, y: 190 },
      { id: 'dlq', kind: 'fila', title: 'Dead-letter queue', subtitle: 'monitorada a cada 5 min', x: 600, y: 320 },
      { id: 'exec', kind: 'servico', title: 'FlowExecutionEngine', subtitle: 'registra em flow_executions', x: 900, y: 50 },
      { id: 'percurso', kind: 'decisao', title: 'Percurso do grafo', subtitle: 'gatilho → condição (yes/no) → ação', x: 900, y: 190 },
    ],
    edges: [
      { id: 'f1', source: 'ev', target: 'listener' },
      { id: 'f2', source: 'listener', target: 'match' },
      { id: 'f3', source: 'match', target: 'queue', label: 'ativos' },
      { id: 'f4', source: 'queue', target: 'consumer' },
      { id: 'f5', source: 'consumer', target: 'exec' },
      { id: 'f6', source: 'exec', target: 'percurso' },
      { id: 'f7', source: 'consumer', target: 'dlq', label: 'falhou', failure: true },
    ],
  },

  'webhook-erp': {
    title: 'Integração webhook → fluxo → ERP',
    description:
      'O caminho de ida e volta de uma integração externa: recebimento assinado, criação da solicitação, aprovação e retorno ao ERP.',
    height: 450,
    nodes: [
      { id: 'erp', kind: 'externo', title: 'Sistema externo', subtitle: 'ex: Protheus SIGACOM', x: 0, y: 120 },
      { id: 'in', kind: 'api', title: 'POST /webhooks/in/:token', subtitle: 'valida HMAC · registra evento', x: 300, y: 50 },
      { id: 'evt', kind: 'evento', title: 'webhooks.received', subtitle: 'só se flow_trigger_enabled', x: 300, y: 190 },
      { id: 'flow1', kind: 'servico', title: 'Fluxo 1', subtitle: 'cria solicitação + aprovação', x: 600, y: 120 },
      { id: 'flow2', kind: 'servico', title: 'Fluxo 2', subtitle: 'trigger_approval_completed', x: 600, y: 310 },
      { id: 'sol', kind: 'banco', title: 'Solicitação', subtitle: 'chave de idempotência', x: 900, y: 40 },
      { id: 'apr', kind: 'decisao', title: 'Aprovação', subtitle: 'aprovadores dinâmicos', x: 900, y: 175 },
      { id: 'volta', kind: 'externo', title: 'Endpoint de retorno', subtitle: 'decisão publicada no ERP', x: 900, y: 310 },
    ],
    edges: [
      // Rótulos curtos de propósito: o vão entre colunas é de 50px e um texto longo
      // centralizado na aresta invade os cards dos dois lados.
      { id: 'w1', source: 'erp', target: 'in', label: 'assinado' },
      { id: 'w2', source: 'in', target: 'evt' },
      { id: 'w3', source: 'evt', target: 'flow1' },
      { id: 'w4', source: 'flow1', target: 'sol' },
      { id: 'w5', source: 'flow1', target: 'apr' },
      { id: 'w6', source: 'apr', target: 'flow2', label: 'decidida', dashed: true },
      { id: 'w7', source: 'flow2', target: 'volta', label: 'conector' },
    ],
  },

  'auth-rbac': {
    title: 'Autenticação e resolução de permissão',
    description:
      'Do login à decisão de acesso: emissão dos tokens, validação por requisição e conferência do processo pelo vínculo da pessoa.',
    // Sobe de 400 para 420 com a quarta linha (cadastro de senha), que leva o
    // conteúdo a y=382 — a mesma folga do diagrama de arquitetura, de igual altura.
    height: 420,
    nodes: [
      { id: 'login', kind: 'entrada', title: 'POST /auth/login', subtitle: 'e-mail + senha (bcrypt)', x: 0, y: 40 },
      { id: 'google', kind: 'entrada', title: 'Login Google', subtitle: 'OAuth · domínio permitido', x: 0, y: 170 },
      { id: 'rate', kind: 'decisao', title: 'Limite de tentativas', subtitle: 'bloqueio por e-mail', x: 300, y: 40 },
      { id: 'tokens', kind: 'servico', title: 'Access + Refresh token', subtitle: 'refresh em cookie httpOnly', x: 300, y: 170 },
      { id: 'req', kind: 'api', title: 'Requisição autenticada', subtitle: 'Authorization: Bearer', x: 600, y: 40 },
      { id: 'jwt', kind: 'api', title: 'JwtStrategy', subtitle: 'confere token_version', x: 600, y: 170 },
      { id: 'guard', kind: 'decisao', title: 'PermissionsGuard', subtitle: 'perfil (sistema) · vínculo (processo)', x: 900, y: 40 },
      { id: 'scope', kind: 'servico', title: 'ProcessAccessService', subtitle: 'pode X neste processo?', x: 900, y: 170 },
      { id: 'senha', kind: 'servico', title: 'POST /auth/password', subtitle: 'cadastra a senha local · derruba as outras sessões', x: 600, y: 300 },
    ],
    edges: [
      { id: 'a1', source: 'login', target: 'rate' },
      { id: 'a2', source: 'rate', target: 'tokens' },
      { id: 'a3', source: 'google', target: 'tokens' },
      { id: 'a4', source: 'tokens', target: 'req' },
      { id: 'a5', source: 'req', target: 'jwt' },
      { id: 'a6', source: 'jwt', target: 'guard' },
      { id: 'a7', source: 'guard', target: 'scope', label: 'processo' },
      // Só as contas provisionadas pelo Google passam por aqui: sem senha própria,
      // o callback desvia para /definir-senha antes da tela inicial.
      { id: 'a8', source: 'tokens', target: 'senha', label: 'sem senha' },
    ],
  },

  'resposta-formulario': {
    title: 'Envio de uma resposta de formulário',
    description:
      'O que acontece entre o clique em "Enviar" no formulário público e os efeitos colaterais disparados pelo evento.',
    height: 520,
    nodes: [
      { id: 'pub', kind: 'entrada', title: 'Formulário público', subtitle: '/f/:formId', x: 0, y: 150 },
      { id: 'post', kind: 'api', title: 'POST /responses/submit', subtitle: 'captcha opcional · 10/min', x: 300, y: 80 },
      { id: 'valid', kind: 'decisao', title: 'Validação', subtitle: 'estrutura + versão do formulário', x: 300, y: 220 },
      { id: 'sub', kind: 'banco', title: 'submissions + items', subtitle: 'gravação atômica · idempotência', x: 600, y: 80 },
      { id: 'ev', kind: 'evento', title: 'responses.submitted', subtitle: 'evento de domínio', x: 600, y: 220 },
      { id: 'sol', kind: 'servico', title: 'Solicitação', subtitle: 'SolicitationsListener', x: 900, y: 30 },
      { id: 'flow', kind: 'servico', title: 'Fluxos', subtitle: 'trigger_form_submit', x: 900, y: 150 },
      { id: 'auto', kind: 'servico', title: 'Automações', subtitle: 'regras do formulário', x: 900, y: 270 },
      { id: 'conn', kind: 'servico', title: 'Conectores', subtitle: 'destino externo do formulário', x: 900, y: 390 },
    ],
    edges: [
      { id: 'r1', source: 'pub', target: 'post' },
      { id: 'r2', source: 'post', target: 'valid' },
      { id: 'r3', source: 'valid', target: 'sub' },
      { id: 'r4', source: 'sub', target: 'ev' },
      { id: 'r5', source: 'ev', target: 'sol' },
      { id: 'r6', source: 'ev', target: 'flow' },
      { id: 'r7', source: 'ev', target: 'auto' },
      { id: 'r8', source: 'ev', target: 'conn' },
    ],
  },
};
