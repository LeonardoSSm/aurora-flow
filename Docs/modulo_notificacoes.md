# Módulo de notificações (nó `action_notification`)

> Complementa [`motor_de_fluxos.md`](motor_de_fluxos.md) (como o motor funcionava **antes**). Referências: `backend/src/modules/notifications/` (domínio genérico) e `backend/src/modules/flows/notification/` (o nó).

## 1. Escopo do v1 e decisões

| Tema | Decisão | Base |
|---|---|---|
| Nó | **Novo tipo aditivo** `action_notification`; `action_send_email`, `action_notify_users` e `action_send_whatsapp` ficam intactos | compatibilidade de fluxos salvos |
| Canais | `in_app`, `email`, `whatsapp` (previstos em `Docs/resumo_geral_e_visao_futura_formhub.md` §10 e com infraestrutura). **Fora**: push (Expo — exige mexer no `ExpoPushService` compartilhado), SMS (sem infra) | evidência no código/docs |
| Caixa de entrada | `GET /notifications/inbox…` + sino no topo (a tabela `notifications` era gravada e **nunca lida**) | roadmap "notificações internas reais" |
| Envio | persiste primeiro (caixa de saída idempotente), depois envia **imediato** (fluxo espera a 1ª tentativa) ou **em segundo plano** (worker `@Cron`, `FOR UPDATE SKIP LOCKED`, sem infra nova) | RabbitMQ é opcional no projeto |
| Falha | permanente → nó `failed`; transitória → retentativa em background, fluxo segue; `continueOnFailure` faz o motor seguir mesmo com nó `failed` | motor não tem saída de erro (`engine.ts` catch) |
| Teste manual | dry-run (renderiza/valida, não envia nem grava) | `runTest` executa efeitos reais |

**Pendências funcionais (não inventadas):** preferências/opt-out por usuário, modelos reutilizáveis e versionados, recibos de entrega (webhooks do provedor), push e SMS.

## 2. Arquitetura

### Avisos do sistema (`UserNoticeService`, 2026-11-14)

Eventos do próprio sistema avisam usuários internos pelo **sino (`in_app`) e pelo push do app ao mesmo tempo** — antes iam só por push, e quem usava só a web não via nada. Um único ponto: `modules/notifications/user-notice.service.ts` (`notify({ userIds, exceptUserIds, title, body, link, kind, dedupeKey })`), que descarta repetidos e **quem fez a ação**, enfileira o `in_app` (lotes de 50), despacha e nunca lança.

| Evento | Quem recebe |
|---|---|
| Aprovação pendente (criação e próxima etapa em ordem) | aprovador(es) da etapa — link `/aprovacoes?id=` |
| Aprovação concluída/reprovada | quem pediu + o solicitante (aprovação da solicitação; na de fase só quem pediu) |
| Responsável definido (ao criar, trocar ou mover com responsável) | o novo responsável |
| Status mudou (Kanban, quadro "Sem formulário" ou seletor do detalhe) | quem abriu (sino/app) + e-mail ao solicitante, igual em todos os caminhos |
| Mudou de fase (movimento real; entrar na 1ª fase não conta) | quem abriu |
| Comentário | do solicitante → responsável; da equipe → responsável + quem abriu (nota interna: só o responsável) |
| Proposta decidida pelo solicitante | responsável |
| SLA da solicitação em alerta/vencido | responsável (um por estado e prazo — `dedupeKey`) |

O aviso do sino guarda `notifications.link` (migration `1791500000000-NotificationLink`): vem de `metadata.link` da notificação, só caminho interno (`safeAppLink`), e o sino navega ao clicar. O prazo de fase (`phase-sla.service.ts`) já avisava sino + push e segue como estava. E-mail/WhatsApp e destinatários externos continuam sendo papel do nó "Notificação".


`FlowExecutionEngine` → `FlowNotificationNodeExecutor` (variáveis + destinatários + chave de idempotência) → `NotificationsService.enqueue` (tabelas `notification_*`) → `NotificationDispatcherService` (claim, tentativa, classificação, retentativa) ← `NotificationWorkerService` (cron 10 s) → `NotificationChannelRegistry` → adapters `InAppChannel` / `EmailChannel` (FlowMailerService) / `WhatsAppChannel` (WhatsAppClientService).

Contrato de canal: `notification-channel.ts` (`describe`, `validateRecipient`, `send`, `getStatus?`). Trocar de provedor = trocar o adapter; o motor não muda.

## 3. Semântica de execução

- **Enviado** = o provedor *aceitou* (SMTP/Evolution). **Entregue** = comprovado (hoje só `in_app`). Criar o registro **nunca** conta como envio.
- **Sem provedor configurado**: fora de produção é simulado (`provider = log|mock`); em produção **falha** `not_configured` (`NOTIFICATIONS_ALLOW_MOCK_PROVIDERS` força o simulado).
- **Vários destinatários**: cada um tem estado e tentativas próprios; qualquer falha permanente (inclusive destinatário não resolvido) falha o nó, mas os demais são enviados.
- **Idempotência**: chave `sha256(execução:nó)` ou, se configurado, do `idempotencyKeyTemplate`; `UNIQUE` no banco; corrida de INSERT devolve a existente. Reprocessar/retomada duplicada não reenvia. Garantia **pelo menos uma vez**: worker que morre após o aceite do provedor pode duplicar *um* envio na recuperação (limitado por `maxAttempts`).
- **Correlação**: `flow_id`, `flow_execution_id`, `node_id`, `solicitation_id` em `notification_messages`; FKs `ON DELETE SET NULL` (apagar o fluxo preserva o histórico, que tem expurgo próprio).

## 4. Estados

Destinatário: `scheduled|pending → processing → sent → delivered`; `processing → pending` (retentativa) `| failed`; `failed → pending` (reenvio manual); `scheduled|pending → cancelled`. Tabela de transições única em `domain/notification-state.ts` (testada em todas as combinações). Notificação: agregado (`deriveMessageStatus`) com `partially_sent`.

## 5. Dados

`notification_messages` (conteúdo renderizado, canal, correlação, política), `notification_recipients` (unidade de entrega + fila; índice parcial `(priority_rank, next_attempt_at)` para `pending|scheduled`), `notification_attempts` (auditoria; erro sanitizado). Migration `1788400000000-NotificationsModule` (+ coluna opcional `notifications.title`). **Sensível**: `address`, `display_name`, `title/body`. Retenção: `NOTIFICATIONS_RETENTION_DAYS` (90), expurgo diário às 03:30 só de notificações terminais.

## 6. Modelos e segurança

- Sintaxe `{{nome}}` / `{{payload.a.b}}`; **texto puro**, passada única (sem reexpansão), sem acesso a protótipo, sem código; variável ausente → vazio + reportada; caracteres de controle/bidi removidos; e-mail envia o texto **escapado** em HTML; assunto sem quebra de linha. Limites por canal (`notification.limits.ts`).
- Autorização: nó exige `flows.manage` (já era do fluxo); ver notificações `flows.view`; conteúdo/endereços completos, cancelar e reenviar só `flows.manage`; caixa de entrada só do próprio usuário; cancelar/reenviar auditados (`audit_events`).
- Abuso: teto por nó (`NOTIFICATIONS_MAX_RECIPIENTS_PER_NODE`, 50) e por fluxo/hora (`…_PER_FLOW_PER_HOUR`, 1000). Logs só com ids/categorias; erros sanitizados; endereços mascarados.

## 7. Observabilidade

Métricas: `formhub_notifications_created_total{channel}`, `formhub_notification_attempts_total{channel,provider,result}`, `formhub_notification_attempt_duration_seconds`, `formhub_notification_recipients_due` (backlog). Logs estruturados por tentativa (`notificationId`, `flowId`, `executionId`, `nodeId`, `channel`, `provider`, `attempt`, `durationMs`, `errorCategory`).

## 8. Operação / deploy

1. Deploy da imagem; **rodar a migration** (produção tem `DB_AUTO_MIGRATE=false`): `docker compose exec backend npx typeorm migration:run -d dist/database/data-source.js`.
2. Variáveis (opcionais, padrões seguros) em `backend/.env`: ver `backend/.env.example` (`NOTIFICATIONS_*`).
3. Para e-mail/WhatsApp em produção: `SMTP_*` e `WHATSAPP_PROVIDER=evolution` + `WHATSAPP_EVOLUTION_*` precisam estar configurados — senão o canal falha com `not_configured` (o canal do sistema não depende de nada).

## 9. Testes

`npm --prefix backend test` (unitários) · `npm --prefix backend run test:integration` (Postgres real, inclui `notifications.integration.spec.ts`) · `npm --prefix frontend test`.
