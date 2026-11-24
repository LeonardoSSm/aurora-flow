# Aprovação por link (aprovador externo)

> Complementa [`motor_de_fluxos.md`](motor_de_fluxos.md) e [`modulo_notificacoes.md`](modulo_notificacoes.md). Código: `backend/src/modules/approvals/external/` (token, e-mail, envio do link, serviço e controller públicos), `ApprovalsService` (criação, decisão, reenvio) e, no frontend, `pages/external-approval-page.tsx`.

## 1. Para que serve

Um gestor **sem usuário no sistema** (ou qualquer pessoa que só precise dizer “sim/não”) aprova ou reprova uma solicitação por um **link pessoal enviado por e-mail** — sem login. O caso principal é o **portão de aprovação antes da 1ª fase**:

```
trigger_solicitation_created → action_create_approval → condition_approval_result
                                                         ├─ sim → action_move_phase / seguir o fluxo
                                                         └─ não → reprovar / cancelar
```

O fluxo **pausa** em `action_create_approval` (status `waiting_approval`) e retoma quando a decisão chega, exatamente como numa aprovação feita dentro do sistema. A decisão por link dispara os mesmos eventos (`approvals.approved|rejected`), então `FlowsApprovalListener`, auditoria e histórico não mudam.

## 2. Roteamento híbrido

Cada **e-mail** de aprovador é resolvido ao criar a aprovação (`ApprovalsService.routeApproverEmails`):

| E-mail | Vira | Como decide |
|---|---|---|
| de um usuário **ativo** | etapa do usuário (`assigned_user_id`) | dentro do sistema (push no app, “Minhas aprovações”) — **não** recebe link |
| de ninguém / usuário inativo | etapa **externa** (`assigned_email`) | pelo link enviado por e-mail |

Uma etapa tem **exatamente um** destinatário: usuário **ou** perfil **ou** e-mail (CHECK `CHK_approval_steps_assignee_xor`). Modos paralelo e sequencial funcionam como antes; no sequencial o link da etapa seguinte só é emitido quando ela é ativada.

## 3. Como configurar

**No fluxo (`action_create_approval`)**

| Origem dos aprovadores | Campo | Efeito |
|---|---|---|
| Lista fixa | `approverEmails` (até 10), sozinho ou com `assignedUserIds` | e-mails roteados como acima |
| Campo do formulário / Dinâmico | `allowExternalApprovers: true` | e-mail sem usuário vira aprovador externo **em vez de falhar o nó**. Desligado (padrão) mantém o comportamento antigo |

**Manualmente:** em “Nova aprovação”, o campo *Aprovadores por e-mail*. API: `POST /solicitations/:id/approvals` com `assignedEmails` (até 10, requer `approvals.manage`).

**Reenvio:** `POST /approvals/:stepId/resend-link` (`approvals.manage`) — também na tela da solicitação (“Reenviar link”). Gera um token **novo**; o anterior deixa de valer. Serve para e-mail perdido, link expirado ou bloqueado.

## 4. Segurança

| Ameaça | Controle |
|---|---|
| Adivinhar o link | token de **256 bits** (`randomBytes(32)`, base64url, 43 caracteres) |
| Vazar o banco/backup | só o **SHA-256** do token é gravado (`access_token_hash`, `select:false`, índice único parcial); o token só existe no e-mail |
| Link encaminhado/vazado | **confirmação do e-mail** no POST (segundo fator) — **5 erros bloqueiam o link** (ele “expira” na hora; só o reenvio gera outro) |
| Reuso | uso único: depois de decidida a etapa o link só mostra “já decidida”; reenvio troca o hash |
| Janela de ataque | validade de **7 dias** (`APPROVAL_EXTERNAL_LINK_TTL_HOURS`, máx. 90 dias) |
| Força bruta / abuso | `@Throttle` 30/min (GET) e **10/min (POST) por IP**; formato do token é validado antes de ir ao banco |
| Efeito colateral em GET | `GET` é **somente leitura** (scanners de e-mail que abrem links não decidem nada); só `POST` decide |
| Cache / indexação / Referer | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`; a página repete `meta robots/referrer` |
| Enumeração | token inexistente, malformado ou trocado → **mesmo 404** |
| Vazamento de dados | só no estado `pending` a página mostra a solicitação; decidida/expirada/encerrada mostram só o estado. E-mail do aprovador **mascarado** (`g***@dominio.com`). Respostas do formulário **sem** campos sensíveis (`is_sensitive`), arquivos e CPF |
| Link em log/outbox | o link **não** passa pela caixa de saída de notificações (o corpo ficaria legível a quem gerencia fluxos); logs não trazem e-mail nem link |
| Corrida | decisão sob `pessimistic_write`; duas decisões simultâneas → uma vence, a outra recebe **410** |
| Auditoria | `approval_decisions.decided_via='email_link'`, `decided_by_email`, `decided_ip`; histórico da solicitação (“Decidido por aprovador externo …”, sem ator interno); `AuditListener` registra `decidedVia`/`decidedByEmail` |

**Risco que o desenho não elimina:** com `allowExternalApprovers` nos modos *campo/dinâmico*, **quem preenche o formulário escolhe quem recebe o link**. Em formulário **público**, qualquer pessoa pode fazer o sistema enviar e-mail a um endereço qualquer (limitado a 10 por aprovação e ao rate limit do formulário). Use a opção em formulários internos; no público, prefira lista fixa.

## 5. Estados da página pública

`GET /public/approvals/external/:token` → `{ state, orgName, … }`

| `state` | Quando | Conteúdo |
|---|---|---|
| `pending` | etapa pendente, link válido | aprovação, solicitação, solicitante, respostas, e-mail mascarado, validade |
| `decided` | etapa aprovada/reprovada | só a decisão e a data |
| `expired` | validade vencida **ou** 5 erros de e-mail | só o estado → pedir novo link |
| `closed` | aprovação cancelada, ou etapa pulada (outro aprovador reprovou) | só o estado |

`POST …/:token/decide` `{ decision, comment?, confirmEmail }` → visão atualizada. Erros: **400** (reprovar sem comentário), **403** (e-mail não confere, com `remainingAttempts`), **404** (link inválido), **410** (decidida/expirada/encerrada/bloqueada, com `state`), **429** (limite por IP).

## 6. Envio e falhas

- Exige **SMTP** (`SMTP_HOST/USER/PASS/FROM` — ver `.env.example`). **Sem SMTP em produção, criar aprovação com aprovador externo é recusado** (400) *antes* de gravar qualquer coisa — a aprovação não fica presa. Fora de produção, o link é só registrado no log do servidor (modo simulado, `NOTIFICATIONS_ALLOW_MOCK_PROVIDERS`).
- O link é enviado **depois do commit** da aprovação. **Falha de envio não desfaz a aprovação**: duas tentativas (1 s entre elas, só em erro transitório); se falhar, a etapa fica com `access_link_sent_at` nulo e a tela da solicitação mostra “Link ainda não enviado” com o botão **Reenviar link**. Destinatário recusado pelo servidor SMTP também não conta como enviado.
- O e-mail é montado por `buildExternalApprovalEmail` (tudo que vem de dados é escapado; assunto de uma linha).

## 7. Dados (migration `1788500000000-ExternalApprovers`)

`approval_steps`: `assigned_email`, `access_token_hash`, `access_token_expires_at`, `access_link_sent_at`, `access_failed_attempts`; CHECK “exatamente um entre usuário, perfil e e-mail”; índice único parcial no hash. `approval_decisions`: `decided_by_email`, `decided_via` (padrão `system`), `decided_ip`. Só colunas anuláveis/com padrão e uma restrição relaxada: **compatível com o código antigo durante o deploy**. `down` apaga etapas externas antes de restaurar o CHECK antigo.

## 8. Testes

Unitários: token, e-mail, envio do link, serviço público, controller, `ApprovalsService` (caminhos externos), motor e validação do nó. Integração (`backend/test/integration/external-approvals.integration.spec.ts`, Postgres real, e-mail simulado): criação → link → página → decisão → fluxo retoma; bloqueio, expiração, reenvio, concorrência, limite por IP, sequencial/paralelo e invariantes do banco. Frontend: página pública, etapa/ações do link, modal “Nova aprovação”, formulário do nó e validação do fluxo.

## 9. Operação (produção)

1. Rodar a migration `ExternalApprovers1788500000000` **manualmente** (produção usa `DB_AUTO_MIGRATE=false`).
2. Configurar `SMTP_*` no `.env` do backend de produção e `FRONTEND_URL` (o link usa essa URL).
3. Recriar o container do backend e publicar o frontend (rota nova `/aprovar/:token`).
4. Opcional: `APPROVAL_EXTERNAL_LINK_TTL_HOURS`.

## 10. Pendências conscientes

Não há: lembrete automático de aprovação pendente, expiração/cancelamento de links em lote, nem segundo fator além do e-mail (ex.: código por e-mail/SMS). O link vive em URL — quem tiver o link **e** souber o e-mail do aprovador decide em seu nome (por isso a validade curta, o bloqueio e o aviso no e-mail).
