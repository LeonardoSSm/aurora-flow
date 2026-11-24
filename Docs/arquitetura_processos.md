# Arquitetura e Processos — FormHub

## Diagrama de arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  Usuário / Respondente                                              │
│  Browser (React + Vite, porta 5173)                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Formulário público (sem auth)  │  App autenticado (JWT)      │ │
│  └────────────────────┬───────────┘┌──────────────────────────┘  │ │
│                       │             │                               │
└───────────────────────┼─────────────┼───────────────────────────────┘
                        │ HTTPS       │ HTTPS
                        ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API NestJS (porta 3000)                                            │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  Auth    │  │  Forms   │  │  Flows   │  │  Solicitations     │ │
│  │  JWT/    │  │  Builder │  │  Engine  │  │  SLA / Kanban      │ │
│  │  OAuth   │  │  Versions│  │  Nodes   │  │  History / RLS     │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │Approvals │  │Responses │  │Integrat. │  │  Observability     │ │
│  │Steps     │  │Export    │  │Webhooks  │  │  Prometheus /      │ │
│  │Decisions │  │Analytics │  │WhatsApp  │  │  Metrics summary   │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Queue Module (RabbitMQ com fallback inline)                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────────┬────────────────────┬─────────────┘
           │ TypeORM              │ amqplib            │ HTTP
           ▼                      ▼                    ▼
     ┌───────────┐        ┌──────────────┐    ┌──────────────────┐
     │ PostgreSQL│        │  RabbitMQ    │    │  Externos        │
     │ porta 5432│        │  porta 5672  │    │  ERP / WhatsApp  │
     └───────────┘        └──────────────┘    │  Webhooks / SMTP │
                                              └──────────────────┘
     ┌───────────────────────────────────────────────────────────┐
     │  Observabilidade                                          │
     │  Prometheus (9090) → Grafana (3001)                       │
     │  postgres-exporter (9187) + RabbitMQ exporter (15692)     │
     └───────────────────────────────────────────────────────────┘
```

---

## Módulos do backend e suas responsabilidades

### auth
Autenticação por email+senha com JWT (access 2h + refresh 7d em cookie httpOnly). Suporte a Google OAuth para domínios Workspace configurados. Tokens Google armazenados criptografados com AES-256-GCM.

### forms
Gerenciamento de formulários com versionamento. Cada formulário tem uma versão publicada imutável (snapshot dos campos no momento da publicação). Suporta seções, campos tipados (texto, número, select, checkbox, data, arquivo), opções de campo e regras de visibilidade condicional. Row-level security: editores veem apenas formulários de suas áreas.

### responses
Recebe submissões de formulários públicos (sem autenticação). Valida os dados contra a versão publicada. Emite evento `response.created` que dispara o pipeline de automação. Suporte a export (Excel/CSV) e relatório PDF.

### solicitations
Gerencia o ciclo de vida das solicitações geradas a partir de respostas. Statuses: `new → in_analysis → waiting_approval → approved/rejected → in_progress → completed/canceled`. Cada transição é registrada no histórico (imutável). SLA calculado a partir de configuração global e monitorado por scheduler. Kanban agrupa por status. Row-level security por área.

### approvals
Modelo de aprovação com steps sequenciais. Cada step tem um responsável, prazo e campo de comentário obrigatório. Decisões (approved/rejected) ficam no histórico da solicitação e no log de auditoria.

### flows
Motor de fluxos visuais. Cada fluxo tem nós (nodes) e conexões (edges) persistidos como JSON. O `FlowExecutionEngine` interpreta os nós sequencialmente a partir do gatilho (`trigger_form_submit`). Suporta: condições sobre campos de formulário, criação de aprovação, envio de email, notificação de usuários, chamada de webhook. O `FlowsListener` escuta eventos `response.created` via EventEmitter e publica na fila RabbitMQ (com fallback inline se a fila estiver indisponível).

### automations
Regras de automação de campos (visibilidade condicional, valores padrão) avaliadas no frontend e validadas no backend. Separado dos fluxos: automations atuam nos campos do formulário, flows atuam após a submissão.

### integrations
Webhooks (entrega com retry e DLQ), WhatsApp (provider configurável: mock ou Evolution API), Google Workspace (Sheets). Todas as integrações registram eventos de entrega com status e payload para auditoria.

### queue
Abstração sobre amqplib. Publica mensagens em filas RabbitMQ com confirmação. Se a conexão falhar, executa o callback inline (fallback síncrono) para garantir que o processamento não seja perdido. Registra métricas de publicação e consumo.

### observability
Expõe métricas Prometheus customizadas via `prom-client`. Inclui contadores de solicitações por status, execuções de fluxo, entregas de webhook, mensagens WhatsApp, queries lentas e pool de conexões do banco. `MetricsSummaryService` agrega os valores para o endpoint `/admin/metrics/summary` consumido pelo frontend.

### settings
Par key/value de configurações da organização (org.name, sla.default_hours, security.password_min_length etc.). Inicializados no boot via `settings.seed.ts`. Consumidos por outros módulos via `SettingsService.get(key)`.

### areas / users / roles
Áreas organizacionais, usuários com senha bcrypt, papéis (admin, manager, editor, viewer). Áreas são o filtro principal de visibilidade de dados.

### audit
Log imutável de todas as ações administrativas e operacionais relevantes (login, criação/edição de formulário, decisão de aprovação, mudança de configuração etc.).

### admin
Endpoints administrativos: seed de demonstração (`POST /admin/seed/demo`) e snapshot de métricas operacionais (`GET /admin/metrics/summary`). Ambos restritos a ADMIN.

---

## Fluxo de dados principal

```
1. CAPTURA
   Respondente → GET /f/:formId (público) → Frontend renderiza formulário
   Respondente → POST /responses (sem auth) → Valida campos + tipos
                                             → Persiste ResponseEntity
                                             → Emite evento "response.created"

2. DISPARO DO FLUXO
   FlowsListener ouve "response.created"
   → Busca fluxos ativos com trigger_form_submit vinculado ao formulário
   → Publica mensagem na fila RabbitMQ (fallback inline se fila indisponível)
   → Consumer chama FlowExecutionEngine.execute(flow, context)

3. EXECUÇÃO DO FLUXO
   FlowExecutionEngine percorre nós em topological sort:
   - trigger_form_submit: obtém dados da submissão como contexto inicial
   - condition_field_value: avalia campo do formulário → escolhe ramo yes/no
   - action_create_approval: cria ApprovalEntity + ApprovalStepEntity
   - action_notify_users: envia email via SMTP
   - action_call_webhook: HTTP POST para endpoint externo
   Cada execução gera FlowExecutionEntity com status, duração e payload.

4. SOLICITAÇÃO
   Resposta → SolicitationEntity criada (ou via fluxo de criação automática)
   Status inicial: "new"
   SLA calculado: now + sla.default_hours
   Scheduler verifica SLAs vencidos a cada hora → atualiza slaStatus

5. APROVAÇÃO
   Aprovador acessa GET /approvals/mine → lista steps pendentes
   POST /approvals/:id/decide → registra decisão + comentário
   → Emite evento → Solicitation muda para "approved" ou "rejected"
   → Registro no histórico da solicitação (imutável)

6. INTEGRAÇÃO
   Webhooks configurados recebem payload da submissão via entrega assíncrona
   WhatsApp: envia mensagem via provider configurado
   Todos os eventos de entrega ficam auditáveis em /integrations/events
```

---

## Decisões arquiteturais

### Por que RabbitMQ com fallback inline?

RabbitMQ garante que mensagens não sejam perdidas em caso de falha transiente da API e permite escalar o processamento de fluxos horizontalmente. Porém, exigir RabbitMQ como dependência obrigatória tornaria o ambiente de desenvolvimento e testes mais frágil. O fallback inline executa o fluxo de forma síncrona quando a fila está indisponível, garantindo que o sistema funcione mesmo sem o broker — com custo de latência no request da submissão. Em produção, a fila deve estar sempre disponível.

### Por que `FlowExecutionContext` genérico?

O contexto de execução do fluxo é um mapa chave/valor (`Record<string, unknown>`) em vez de um DTO tipado. Isso permite que novos tipos de nó passem dados arbitrários para nós subsequentes sem alterar a interface do motor. O custo é a ausência de type-safety interna no contexto — compensada por testes unitários dos nós individualmente.

### Por que o acesso é por processo (vínculo pessoa × processo) e não por área?

**Decisão de 2026-11-13, que substitui a anterior** ("área como filtro e não RBAC granular por recurso"). Com o perfil global, o que um perfil podia fazer valia em todo processo que a pessoa enxergava, e a área decidia quais ela enxergava — não dava para alguém operar um processo e só consultar outro.

Agora cada pessoa tem um **vínculo** com cada processo a que tem acesso (`form_members`), com as permissões dela naquele processo (`form_member_permissions`, catálogo em `process-permission-catalog.ts`: ver, abrir, atuar, reatribuir, aprovações, respostas, indicadores, estrutura, automação e gerenciar acesso). Sem vínculo, o processo não existe para a pessoa — salvo o acesso total pelo perfil (`processes.full_access`), o próprio pedido e a aprovação para a qual for chamada. O **perfil** continua para o que é da plataforma (usuários, perfis, áreas, integrações, relatórios, listas de itens) e como grupo de pessoas nas fases e aprovações. A **área** continua como classificação, critério de visibilidade de fase e filtro de painel, mas não dá acesso.

A superfície de configuração (o motivo da decisão antiga) é contida com modelos prontos — Operador, Consulta, Gestor do processo — e com o criador virando dono completo. Toda checagem passa pelo `ProcessAccessService`; a migration `1790600000000-FormMembers` converteu o acesso antigo e `npm run access:report` mostra, pessoa a pessoa, o que muda.

### Por que WhatsApp tem provider mock como padrão?

WhatsApp Business requer homologação e instância dedicada (Evolution API, 360Dialog etc.), o que não pode ser testado facilmente em CI ou ambiente de demonstração. O provider mock registra as mensagens no log e as contabiliza nas métricas sem fazer chamadas externas, permitindo que o resto do sistema seja desenvolvido e testado sem dependência de infraestrutura de telecomunicações. Trocar para Evolution API exige apenas configurar `WHATSAPP_PROVIDER=evolution` e as variáveis correspondentes no `.env`.
