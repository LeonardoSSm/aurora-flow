# Diagnóstico da suíte de testes do módulo Fluxo

Oct 5, 2026 · @SSOUSA

A suíte do módulo Fluxo está verde e estável (155 de 155 testes), mas protege pouco das transições e da orquestração: confiança geral média-baixa. Nenhum arquivo do projeto foi alterado; as reproduções ficaram em arquivos temporários fora do repositório.

**Legenda das evidências:** **\[F\]** fato comprovado no código · **\[R\]** reproduzido executando o código real com repositórios simulados · **\[I\]** inferência técnica · **\[C\]** precisa de confirmação.

**Abreviações:** `ENG` = `backend/src/modules/flows/flow-execution.engine.ts` · `SVC` = `backend/src/modules/flows/flows.service.ts` · `.spec` = o arquivo de teste correspondente, no mesmo diretório.

## 1. Resumo executivo

1. **Suíte verde e estável.** 155 de 155 testes em 4 execuções (paralela com cobertura, serial, e ordem aleatória com 2 seeds). Sem testes instáveis nem handles abertos. No frontend, 90 de 90.
2. **Verde não significa protegido.** O módulo tem 58,7% de linhas e 49% de branches. O `flows.service.ts` tem 42,6% de linhas e 32,3% de branches. Seis arquivos de produção não têm spec algum, e a suíte de integração com Postgres não tem nenhum teste de fluxo.
3. **O motor está bem testado nos nós recentes** (aprovação com pausa, LOPS IA, `run_flow`, `wait_for_phase_fields`, `move_phase`). Mas `condition_field_value`, a condição principal, não tem teste algum. Também não têm teste `send_email`, `notify_users`, `google_sheets` e `erp_operation`.
4. **Reproduzi 9 defeitos de implementação que a suíte não detecta.** O mais grave: a idempotência `(fluxo, submissão)` faz fluxos acionados por eventos de solicitação, aprovação, anexo ou fase rodarem só uma vez por submissão (P-01). O mais simples de corrigir: o parser numérico lê `18500.00` como 1.850.000 (P-03).
5. **Os testes do `FlowsService` e dos listeners são quase só interação com mocks.** O contrato listener, job, consumer e serviço nunca é exercitado de ponta a ponta, e foi aí que o P-01 passou despercebido.
6. **As regras do fluxo estão duplicadas entre frontend e backend e divergem.** O frontend rejeita ciclos, nós soltos e configurações vazias. O backend aceita tudo isso.
7. **Há testes que não verificam o que o nome promete.** Um deles testa o próprio mock. Outro engole um `TypeError` e nunca verifica a regra que diz proteger.
8. **Confiança geral: média-baixa.** Para a lógica de cada nó do motor, é média. Para orquestração, transições de estado e listeners, é baixa.

**Pendências de confirmação:** C1, P-01 contra Postgres real e a intenção de produto · C2, o `TZ` do container de produção · C3, se o editor ou a API devolvem `apiKey` em claro · C4, se `payloadFilters` e `fieldCode` deveriam ser aplicados · C5, se o broker pode redeliverar mensagens em produção.

## 2. Funcionamento do módulo

O módulo executa grafos de nós (34 tipos: 10 gatilhos, 6 condições, 18 ações) salvos como JSON em `FlowEntity`, grava o histórico em `FlowExecutionEntity` e pausa e retoma execuções que esperam uma aprovação ou o salvamento de uma fase.

**Caminho de uma execução**

1. Um evento de domínio chega a um dos 7 listeners.
2. O listener publica um job no RabbitMQ; se a fila estiver indisponível, executa inline.
3. O `FlowsConsumer` roteia o job para `FlowsService.executeContextJob` ou `executeForSubmission`.
4. `startFlowExecution` aplica a idempotência e cria a linha de execução.
5. `FlowExecutionEngine.execute` percorre o grafo em DFS recursivo a partir do único gatilho.
6. O status final é gravado em `FlowExecutionEntity`.
7. Retomada: `approvals.*` ou `solicitations.phase_fields_saved` publicam um job `flow_resume*`, e `engine.resumeFrom` continua a partir do nó pausado.

**Regras de negócio evidenciadas no código**

- Exatamente 1 gatilho por fluxo e no máximo 100 nós (`SVC:849-881`).
- O `formId` nulo do gatilho funciona como curinga, não como filtro (`SVC:265-278`, `SVC:810-816`).
- Limites contra loop: encadeamento de eventos até 3 (`MAX_FLOW_EVENT_DEPTH`, nos listeners), 50 níveis no grafo, 5 níveis de sub-fluxo e detecção de recursão por `callStack`.
- Gatilho agendado: intervalo ou cron, fuso padrão `America/Sao_Paulo` e desativação automática após 5 falhas consecutivas (`SVC:52-53`, `SVC:596-620`).
- Aprovação: modos fixo, dinâmico (e-mails do payload) e `phase_role`, nos escopos solicitação ou fase.
- Nó LOPS IA: a chave de execução é sempre a do nó, nunca a do servidor.

**Estados de `FlowExecutionEntity` e transições**

| De | Para |
| --- | --- |
| `running` | `success`, `partial_failure`, `failed`, `waiting_approval`, `waiting_phase_fields` |
| `waiting_approval` (retomada) | `success`, `partial_failure`, `failed`, ou outra pausa |
| `waiting_phase_fields` (retomada) | `success`, `partial_failure`, `failed`, ou outra pausa |

A retomada continua o grafo a partir do nó pausado (`pausedNodeId`).

**Dependências externas:** RabbitMQ, Postgres, SMTP (nodemailer), HTTP (axios e `fetch`), LOPS IA, Google Sheets, GLPI, WhatsApp, ERP e storage.

## 3. Matriz de cobertura

Das 28 regras e cenários mapeados, 3 têm cobertura completa e 10 estão totalmente ausentes: as de maior risco são idempotência, roteamento por valor, anti-loop, listeners de entrada e integração com Postgres.

| Regra ou cenário | Teste existente | Tipo | Cobertura | Evidência | Risco |
| --- | --- | --- | --- | --- | --- |
| Ações simples (status, atribuir, webhook, GLPI, WhatsApp) | 6 testes | Unit | Completa (verifica a chamada, não o efeito) | `ENG.spec:221,721,789,850,888,935` | Baixo |
| `condition_field_value` (7 operadores, formatos numéricos) | nenhum | n/a | Ausente | `ENG:365-417` (linhas 397-415 nunca executam) | Alto |
| Condição por status e prioridade | 2 testes | Unit | Parcial: faltam `not_equals`, `less_than` e solicitação ausente | `ENG.spec:153,187` | Médio |
| `http_check` + `condition_response_value` | 4 testes | Unit | Parcial: só `equals`; sem timeout, corpo não-JSON ou 4xx | `ENG.spec:1204-1327` | Médio |
| `condition_approval_result` | 4 testes | Unit | Completa | `ENG.spec:1732-1797` | Baixo |
| Criação de aprovação (fixo, dinâmico, `phase_role`, fase) | 5 testes | Unit | Parcial: falta 2ª aprovação no fluxo, aprovação preexistente decidida ou manual, e notificação aos gestores | `ENG.spec:251,322,358,1617-1708` | Alto |
| Pausa por aprovação e retomada | 12 testes (motor, serviço, listener) | Unit | Parcial: sem retomada duplicada, falha anterior, 2 pausas paralelas ou sub-fluxo | `ENG.spec:390-530`, `SVC.spec:534-687` | Alto |
| Pausa por fase | 12 testes | Unit | Parcial (mesmas lacunas) | `ENG.spec:1799-1878`, `SVC.spec:690-915` | Médio |
| `action_run_flow` | 7 testes | Unit | Parcial: o filho tem só o gatilho; sem falha ou pausa do filho | `ENG.spec:997-1197` | Alto |
| `create_solicitation_from_payload` | 5 testes | Unit | Parcial: sem fallback de `formId`, sem `metadataFieldMappings`, prazo só por tolerância | `ENG.spec:532-720` | Médio |
| LOPS IA | 11 testes | Unit | Parcial: sem timeout, erro de rede, corpo não-JSON, nem inspeção do multipart | `ENG.spec:1330-1615` | Médio |
| `send_email`, `notify_users`, `google_sheets`, `erp_operation` | nenhum | n/a | Ausente | `ENG:486-510,627-685,1042-1063` | Médio |
| Interpolação `{{...}}` | indireto | Unit | Parcial: `submitted_at`, `tracking_url`, requester sem teste | `ENG:454-484` | Médio |
| Validação estrutural no `create` e `update` | 23 testes via método privado | Unit | Parcial: faltam limite de nós, 1 gatilho, aresta órfã, ciclo e `update` | `SVC.spec:255-475` | Alto |
| CRUD e permissões | 11 testes (listar e obter) | Unit | Parcial: `update`, `delete`, `toggle`, `runTest` e `getExecutions` sem teste | `SVC.spec:87-253` | Médio |
| Idempotência `(fluxo, submissão)` | nenhum | n/a | Ausente | `SVC:694-723` | Crítico |
| `findActiveFlowsByTrigger` (curinga, isolamento) | só mockado nos listeners | n/a | Ausente | `SVC:265-278` | Alto |
| Gatilho agendado | 5 testes | Unit | Parcial: sem limite de 50 por ciclo, auto-desativação nem reativação | `flows-scheduled-trigger.service.spec.ts:57-141` | Médio |
| `computeNextRunAt` | 11 testes | Unit | Parcial: sem fuso com DST, cron de 6 campos ou fuso inválido | `lib/compute-next-run.spec.ts` | Baixo |
| Listeners de gatilho (7) | 33 testes | Unit (resto mockado) | Parcial: sem limite de profundidade, falha de dependência ou filtros | `flows-*.listener.spec.ts` | Médio |
| `FlowsListener` e `FlowsConsumer` (caminho do envio de formulário) | nenhum | n/a | Ausente (0%) | `flows.listener.ts`, `flows.consumer.ts` | Alto |
| Anti-loop `MAX_FLOW_EVENT_DEPTH` | nenhum | n/a | Ausente | `flows-solicitation.listener.ts:57`, `flows-approval.listener.ts:45`, `ENG:692,708` | Alto |
| `partial_failure`, `failed` e métricas | só `success` no serviço | Unit | Parcial | `SVC:391-415` | Médio |
| `runTest` | nenhum | n/a | Ausente | `SVC:648-692` | Alto |
| Paginação e limites | nenhum | n/a | Ausente | `SVC:109-115,229-235` | Médio |
| Reconciliação ERP, DLQ monitor, mailer | nenhum | n/a | Ausente (0%, 0% e 17%) | arquivos homônimos | Médio |
| Validação no frontend | 79 testes (vitest) | Unit | Completa para a UI, divergente do backend | `flow-validation.test.ts` | Médio |
| API real com Postgres | nenhum | Integração | Ausente | `api.integration.spec.ts` não contém "flow" | Alto |

## 4. Problemas encontrados

Foram 22 problemas: 1 crítico, 8 altos, 11 médios e 2 baixos. Os nove primeiros têm o detalhe completo; os demais estão numa tabela ao fim da seção.

### P-01 · Crítico · Idempotência por (fluxo, submissão) ignora o tipo de evento \[F\]\[R\]\[C\]

- **Descrição:** `startFlowExecution` descarta a execução se já existe linha para `(flowId, submissionId)`. Para eventos de solicitação, aprovação, SLA, anexo e fase, `buildContextFromJob` anexa a submissão da solicitação ao contexto. O `submissionId` fica preenchido e a trava passa a valer para esses gatilhos, não só para `trigger_form_submit`, caso para o qual o índice foi criado (migration `1778815300000`). O descarte é silencioso, sem log.
- **Evidência:** `SVC:701-703`, `SVC:758` e `flow-execution.entity.ts:15-18`. Na reprodução R10, dois `solicitations.moved` distintos para a mesma solicitação chamaram `engine.execute` 1 vez com submissão e 2 vezes sem submissão.
- **Impacto:** a 2ª movimentação, aprovação, anexo, salvamento de fase ou alerta de SLA da mesma solicitação não dispara o mesmo fluxo, e ninguém é avisado.
- **Cenário:** fluxo com `trigger_solicitation_moved` que notifica o responsável; mova o card duas vezes e só a 1ª notifica. Em `trigger_attachment_uploaded`, só a 1ª foto de cada submissão passa pelo fluxo.
- **Recomendação:** gravar o `submissionId` na execução só quando o evento for `responses.submitted` (não exige migration). A alternativa é incluir o evento e o id do gatilho na chave, o que exige migração do índice e o checklist de deploy (produção sem ts-node e com `DB_AUTO_MIGRATE=false`). Cubra com teste de integração em Postgres.

### P-02 · Alto · "Testar fluxo" executa efeitos reais \[F\]\[R\]

- **Descrição:** `runTest` envia `metadata.testRun = true`, mas nada no motor lê essa chave. O endpoint descreve a execução como "não persiste".
- **Evidência:** `SVC:688` e `flows.controller.ts:118`. Em R9, o teste disparou `mailer.send` para um destinatário real e `outboundWebhook.send`.
- **Impacto:** e-mails, webhooks, notificações a usuários e linhas em planilhas Google saem de verdade ao testar.
- **Cenário:** "Testar" um fluxo com `send_email` para um cliente.
- **Recomendação:** modo `dryRun` no motor que simula as ações com efeito, mais um teste que prove que nenhuma delas é chamada.

### P-03 · Alto · Operadores numéricos leem ponto decimal como separador de milhar \[F\]\[R\]

- **Descrição:** `parseCurrencyBR` remove todos os pontos antes de converter, e `compareValues` o usa em `greater_than` e `less_than`.
- **Evidência:** `ENG:365` e `ENG:400-409`. Resultados de R1: `"18500.00" > "18500"` deu verdadeiro (o correto é falso); `"18500.00" < "20000"` deu falso (o correto é verdadeiro); `"0.5" < "1"` deu falso (o correto é verdadeiro); `"1.5" > "2"` deu verdadeiro (o correto é falso); `"18.500,00"` funciona. O comentário do código diz `18500.00 → 18500`, e isso é falso.
- **Impacto:** a coluna `value_number` é `double precision`, então um número com fração chega como `"18500.5"` e vira 185005 (cálculo pelo mesmo algoritmo). Isso afeta qualquer roteamento por valor, como alçada de compra, e a condição não tem teste algum.
- **Recomendação:** parser que detecte o separador decimal, mais tabela `it.each` de operadores e formatos (T04).

### P-04 · Alto · Sub-fluxo que pausa vira "success" e o pai segue \[F\]\[R\]

- **Descrição:** `runChildFlow` só conhece `success`, `partial_failure` e `failed`. Um filho que pausa em aprovação ou espera de fase é gravado como `success`, sem `approvalId` nem `pausedNodeId`.
- **Evidência:** `ENG:1269-1299`. R5 mostrou o pai concluindo `run:success after:success` e a única atualização do filho com `status: success`, `approvalId: null`, `pausedNodeId: null`. O fixture do filho nos testes tem só o gatilho (`ENG.spec:997-1006`).
- **Impacto:** a aprovação do filho é decidida, mas nada retoma o resto do filho. O pai também não espera, mesmo em modo `sync`.
- **Recomendação:** propagar o estado de pausa para o pai, ou rejeitar na validação filhos que contenham nós de pausa. Cubra com teste.

### P-05 · Alto · Retomada não é atômica nem idempotente \[F\]\[R\]\[I\]

- **Descrição:** `resumePausedExecution` lê o status, executa o motor e só depois grava. Não há atualização condicional nem estado "running" durante a retomada.
- **Evidência:** `SVC:431-465` e `SVC:531-545`. Em R15, duas chamadas concorrentes executaram `resumeFrom` 2 vezes.
- **Impacto:** se o broker redeliverar o job ou o evento de decisão disparar duas vezes \[C5\], o ramo pós-aprovação roda em dobro (por exemplo, duas mensagens de WhatsApp). O `messageId` não deduplica no broker.
- **Recomendação:** transição `UPDATE ... SET status='running' WHERE id=? AND status='waiting_approval'` (compare-and-set), usando o número de linhas afetadas como porta de entrada.

### P-06 · Alto · `action_create_approval` reaproveita qualquer aprovação da solicitação \[F\]\[R\]

- **Descrição:** no escopo "solicitação", o motor busca qualquer aprovação existente. Se achar, não cria a nova e devolve a antiga, mesmo que tenha sido decidida, manual, ou de outro nó do mesmo fluxo.
- **Evidência:** `ENG:736-745`. Em R14, com uma 1ª aprovação já aprovada, o 2º nó `alcada2` terminou em `success` sem chamar `createApproval` e o fluxo seguiu. Os testes cobrem só o caso "pendente" (`ENG.spec:287`) e o escopo de fase (`ENG.spec:1655`).
- **Impacto:** uma 2ª alçada (por exemplo, diretor depois do gerente) é pulada silenciosamente. Uma aprovação manual prévia também bloqueia a automática.
- **Recomendação:** chave de dedupe por nó (id do nó ou do fluxo), mais testes do 2º nó, da aprovação manual prévia e da aprovação já rejeitada.

### P-07 · Alto · Validação do backend é permissiva; ciclo repete efeitos \[F\]\[R\]

- **Descrição:** `validateFlowStructure` aceita ciclo, ids duplicados, nó órfão e `sourceHandle` inválido. Também aceita nós sem configuração obrigatória: e-mail sem destinatário, webhook sem URL, notificação sem usuários, condição de campo sem operador. O `update` só com `edges` nem valida as arestas.
- **Evidência:** `SVC:849-881` e `SVC:182`. R13 e R12b confirmaram tudo isso. Em R4, um ciclo A→B→A gerou 52 resultados: B executou 25 vezes e depois ganhou um resultado `failed` extra, porque o erro de profundidade é lançado antes do `try` do nó filho (`ENG:151`).
- **Impacto:** o frontend rejeita ciclo, nó solto e config vazia (`flow-validation.ts:17-220`), mas só no editor; o autosave só roda sem erros (`useFlowEditor.ts:250`). Qualquer cliente de API grava um fluxo que repete efeitos colaterais 25 vezes.
- **Recomendação:** extrair um validador de grafo puro e compartilhá-lo com o frontend. Cubra também o `update` e valide o resultado combinado.

### P-08 · Alto · Regra anti-loop de eventos sem nenhum teste \[F\]

- **Descrição:** `MAX_FLOW_EVENT_DEPTH = 3` protege contra fluxo que move card, dispara fluxo, e assim por diante. Nenhum spec exercita o limite: a mensagem `Limite de encadeamento` nunca aparece nos specs, e as linhas da guarda nos listeners aparecem como não cobertas.
- **Evidência:** `flows-solicitation.listener.ts:57`, `flows-approval.listener.ts:45` e `ENG:692`.
- **Impacto:** uma regressão aqui causa loop infinito em produção, sem nenhum teste vermelho.
- **Recomendação:** T10.

### P-09 · Alto · `apiKey` e `signingSecret` ficam em claro nos nós e voltam na leitura \[I\]\[C3\]

- **Descrição:** não encontrei mascaramento na leitura de fluxos: sem `ClassSerializer` nem função de mascarar. A sanitização `sanitize-log.util.ts` existe só para logs, e nem é importada fora de si.
- **Evidência:** `SVC:133` (`findOne` devolve a entidade inteira com `nodes`).
- **Impacto:** um usuário com `flows.view` no escopo `assigned` pode ler a chave da LOPS IA e os segredos de assinatura de webhooks do formulário que ele acompanha. Confirmar se a API e o editor devolvem esses campos.
- **Recomendação:** mascarar na leitura e preservar o valor salvo quando o campo chegar mascarado no `update`.

### P-10 a P-22 · Médio e Baixo

| ID | Sev. | Descrição, evidência e impacto | Recomendação |
| --- | --- | --- | --- |
| P-10 | Médio \[F\]\[R\] | Falha anterior à pausa some na retomada: o status final só olha `newResults`. Em R11, com um nó `mail` falho antes da pausa, o resultado final foi `success` e `errorMessage = null`. `SVC:569-577`. | Considerar também os resultados anteriores e testar (T13). |
| P-11 | Médio \[F\]\[R\] | Grafo em diamante executa o nó de convergência 2 vezes (R2: 2 notificações). Condição com arestas sem `sourceHandle` executa os dois ramos (R3). `ENG:318-322`. | Conjunto de visitados, ou validação que rejeite convergência e aresta sem handle (T15, T16). |
| P-12 | Médio \[F\]\[R\] | `toggleActive` não recalcula `nextRunAt` nem zera `consecutiveFailureCount` (R12a). O gatilho reativado dispara na hora, contradizendo o comentário `SVC:194-195`, e desativa de novo na 1ª falha. A auto-desativação (`SVC:596-620`) não tem teste. | T18. |
| P-13 | Médio \[F\]\[C4\] | `payloadFilters` e `fieldCode` são validados, mas nunca aplicados. `grep payloadFilters` só acha validação e tipo; o listener de anexo admite que não sabe o campo. | Aplicar, ou remover do editor, com teste (T30). |
| P-14 | Médio \[F\]\[C2\] | `{{submitted_at}}` usa `toLocaleString('pt-BR')` sem fuso (`ENG:472`). O mesmo instante saiu `05/10/2026 02:30` com `TZ=UTC` e `04/10/2026 23:30` no ambiente local (verificado). Não há `TZ` no `docker-compose.yml` nem no `Dockerfile`. `resolveCreatedSolicitationDueAt` usa fuso local (`ENG:925-936`). | `timeZone` explícito e relógio injetável (T24). |
| P-15 | Médio \[F\] | O teste que diz cobrir "notificar quem tem `flows.manage` se o aprovador não resolve" nunca verifica isso: o mock não tem `findAssignable`, e o `TypeError` é engolido (visível no log da execução). `ENG.spec:81-83,358-388`. | Completar o mock e afirmar as notificações (T23). |
| P-16 | Médio \[F\] | Testes com asserção fraca ou nome enganoso: `ENG.spec:930-933` testa o próprio mock; `1204-1227` promete verificar `lastCheckResponse` e só checa status; `1462` e `1741` não exigem a ausência do ramo oposto; `1383-1425` não confere o multipart nem a mensagem interpolada; `SVC.spec:340-344` duplica `322-329`; `flow.types.spec.ts` só confere constantes. | Reescrever com asserções de comportamento. |
| P-17 | Médio \[F\] | Sem spec: `FlowsListener`, `FlowsConsumer`, `FlowsController`, `DlqMonitor`, `ErpReconciliation`, `FlowMailer`. O limiar de cobertura é global (`jest.config.ts:72`) e exclui `*.controller.ts`, `*.dto.ts` e `*.types.ts`, então 42% no serviço do fluxo não quebra o CI. | Specs dedicados e limiares por arquivo para `flows/`. |
| P-18 | Médio \[F\]\[R\]\[C\] | `action_http_check` e `action_webhook` aceitam qualquer destino. Em R7, o axios foi chamado com `http://169.254.169.254/...`. O guard de URL existe só para o ERP (`erp-url-guard.ts`). | Validar o destino se o modelo de ameaça exigir (T26). |
| P-19 | Médio \[I\] | `getExecutions` converte `page` e `limit` com `Number()` sem DTO, sem limite máximo e sem teste (`flows.controller.ts:148-160`). | DTO de paginação e teste (T27). |
| P-20 | Médio \[F\] | `notify_users` usa `Promise.all` de gravações (`ENG:680-684`): falha parcial deixa notificações já gravadas e uma retentativa duplica. Nós `send_email`, `google_sheets` e `erp_operation` sem teste. | T21 e T22. |
| P-21 | Baixo \[F\] | Código morto `findOwnedOrFail` (`SVC:1262`). O contador `failed` do reconciliador é inalcançável porque `executeFlowWithContext` nunca lança (`flows-erp-reconciliation.service.ts:81`). `Docs/arquitetura_processos.md:112` fala em "topological sort", mas o motor é DFS sem conjunto de visitados. | Remover ou alinhar a documentação. |
| P-22 | Baixo \[F\] | A execução serial emite 295 linhas de log `[Nest]` em 1.333, o que dificulta ler falhas. O CI usa `--forceExit` (`ci.yml`), que mascararia handles abertos; localmente não achei nenhum. | Silenciar o logger nos specs e remover `--forceExit` depois de validar. |

## 5. Cenários de teste ausentes

São 30 testes recomendados: 12 de prioridade P0 (T01 a T12, cobrem os problemas crítico e altos), 16 de P1 e 2 de P2.

| # | Nome sugerido | Contexto, ação e resultado esperado | Tipo | Prioridade | Regra protegida |
| --- | --- | --- | --- | --- | --- |
| T01 | dois eventos distintos da mesma solicitação executam o fluxo duas vezes | Fluxo `trigger_solicitation_moved`, solicitação com submissão; 2 eventos `moved` dão 2 execuções gravadas | Integração (Postgres) | P0 | Idempotência só para form submit (P-01) |
| T02 | reentrega do mesmo `responses.submitted` executa uma vez | 2 jobs iguais dão 1 execução; violação 23505 devolve `null` | Integração e unit | P0 | Idempotência |
| T03 | `runTest` não dispara efeitos reais | Fluxo com e-mail, webhook, notify e sheets; ao rodar `runTest`, nenhum serviço de efeito é chamado | Unit | P0 | Teste sem efeitos (P-02) |
| T04 | condições numéricas com formatos reais | `it.each`: `18500`, `18500.00`, `18.500,00`, `1.234,56`, `0,5`, vazio, `abc` × 7 operadores dão o ramo correto | Unit | P0 | Roteamento por valor (P-03) |
| T05 | sub-fluxo `sync` que pausa não deixa o pai seguir | Filho com `create_approval`; execução do filho fica `waiting_approval` e retomável | Unit e integração | P0 | P-04 |
| T06 | filho falha e pai falha; filho `async` falho não derruba o pai | Filho com nó falho gera o erro "Sub-fluxo falhou..." no `sync` | Unit | P0 | `run_flow` |
| T07 | retomada duplicada executa o ramo uma vez | 2 jobs `flow_resume` concorrentes chamam `resumeFrom` 1× | Unit e integração | P0 | P-05 |
| T08 | 2º `create_approval` no mesmo fluxo cria nova aprovação | 1ª aprovada; o 2º nó cria e pausa; aprovação manual prévia não bloqueia | Unit | P0 | Alçadas em sequência (P-06) |
| T09 | `create` e `update` rejeitam grafos inválidos | Ciclo, ids duplicados, aresta para nó inexistente, `update` só com edges, mais de 100 nós, 0 ou 2 gatilhos, nós sem config; todos dão 400 | Unit (métodos públicos) | P0 | P-07 |
| T10 | limite de encadeamento corta o loop | Listener com `flowDepth` ≥ 3 não publica; `moveCard` e `movePhase` com profundidade 3 falham | Unit | P0 | P-08 |
| T11 | `findActiveFlowsByTrigger` isola por formulário | Tabela (`flow.formId` × `trigger.formId` × evento `null` ou X); aprovação de outro formulário não dispara o fluxo de retorno | Unit | P0 | Isolamento (Docs, "Correção 1") |
| T12 | leitura de fluxo não expõe `apiKey` e `signingSecret` | `findOne` por usuário `viewer` devolve campos mascarados | Unit | P0 | P-09 |
| T13 | retomada preserva falhas anteriores | Execução com nó falho antes da pausa; após retomar, `partial_failure` | Unit | P1 | P-10 |
| T14 | duas pausas paralelas têm comportamento definido | Dois `create_approval` em ramos paralelos: ambos retomam, ou a validação rejeita | Unit | P1 | Pausa |
| T15 | convergência executa uma vez | Diamante: o nó C executa 1× | Unit | P1 | P-11 |
| T16 | aresta sem handle numa condição segue só o ramo certo | Condição falsa executa só o ramo "não" | Unit | P1 | P-11 |
| T17 | ciclo em runtime aborta sem repetir efeitos | A→B→A para sem resultado duplicado | Unit | P1 | P-07 |
| T18 | reativar fluxo agendado | Recalcula `nextRunAt` e zera falhas; 5 falhas desativam; sucesso zera o contador | Unit | P1 | P-12 |
| T19 | `FlowsConsumer` roteia cada `kind` | 4 tipos de job vão ao método certo; job sem `submissionId` lança | Unit | P1 | Caminho do consumer |
| T20 | `FlowsListener` publica com fallback inline e não propaga erro | Fila indisponível executa inline; falha não sobe | Unit | P1 | Caminho do formulário |
| T21 | `send_email` | Interpolação do destinatário, `to[]` vs `toEmail`, lista vazia, sem SMTP | Unit | P1 | E-mail |
| T22 | `notify_users` e `google_sheets` | Sem usuários ou mensagem dá erro; falha parcial; sheets sem conta conectada | Unit | P1 | P-20 |
| T23 | gestores são notificados quando o aprovador não resolve | Mock completo com `findAssignable`; as notificações são afirmadas | Unit | P1 | P-15 |
| T24 | interpolação e `submitted_at` com fuso explícito | Tabela de variáveis; datas com `timeZone` fixo e relógio fake | Unit | P1 | P-14 |
| T25 | LOPS IA: timeout, rede, corpo não-JSON, `save` falhando, multipart | Cada falha vira erro do nó com mensagem clara | Unit | P1 | Nó LOPS IA |
| T26 | HTTP check preserva `lastCheckResponse` em 4xx | Destino interno bloqueado, se a proteção for adotada | Unit | P1 | P-18 |
| T27 | `getExecutions` valida `page` e `limit` | Valores inválidos dão 400 | Unit | P2 | P-19 |
| T28 | E2E: formulário, aprovação, decisão, retomada e status final | RabbitMQ desligado (fallback inline) e Postgres real | Integração | P1 | Transições do fluxo |
| T29 | contrato frontend × backend de nós inválidos | A mesma tabela de nós validada nos dois lados | Contrato | P1 | P-07 |
| T30 | `payloadFilters` e `fieldCode` aplicados (ou removidos) | O comportamento escolhido é afirmado | Unit | P2 | P-13 |

## 6. Problemas de testabilidade

O maior obstáculo é a concentração de responsabilidades no motor e no serviço, somada à falta de um ponto de injeção para relógio, fuso e rede.

1. **`FlowExecutionEngine` concentra tudo.** Tem 1.381 linhas, 17 dependências no construtor e 34 tipos de nó numa cadeia `if/else` em `executeNode` (`ENG:161-247`). O helper de testes monta o construtor por posição (`ENG.spec:105-123`), então qualquer mudança no construtor quebra todos os testes.
2. **Validação acoplada ao serviço.** Cerca de 260 linhas de `switch` de validação vivem dentro do `FlowsService` (`SVC:849-1107`). Os testes só chegam a elas por um cast a método privado (`SVC.spec:259-275`), não pela API pública.
3. **Relógio e fuso não são injetáveis.** `new Date()`, `Date.now()` e `toLocaleString('pt-BR')` aparecem no motor. Os testes de prazo usam janela de tolerância (`ENG.spec:631-635`) em vez de relógio fake.
4. **Globais e ambiente.** `fetch`, `FormData` e `AbortController` são usados direto no motor (`ENG:1107-1124`). O `FlowMailerService` lê `process.env` no construtor. O `DlqMonitorService` chama `fetch` direto.
5. **Contexto montado em 7 lugares.** A conversão de itens da submissão em `fields` está duplicada em `ENG:350-357`, `SVC:725-732` e nos 5 listeners.
6. **Cada listener repete a lógica de publicar e do fallback inline.** São 7 cópias, e cada spec re-testa o mesmo fallback sem exercitar o contrato listener, job, consumer e serviço.
7. **Efeitos ocultos.** Os nós mutam o `ctx` compartilhado (`ctx.solicitation`, `ctx.metadata`, `ctx.attachment`), então o resultado depende da ordem entre ramos. `runTest` tem efeitos reais escondidos. `startFlowExecution` descarta em silêncio.
8. **Faltam cenários de integração com Postgres.** O harness existe (`backend/test/integration`), mas sem nenhum fluxo. A lógica de unicidade e concorrência só se prova no banco.

## 7. Plano de melhoria

A ordem recomendada é escrever primeiro os testes que reproduzem os defeitos, corrigir os mais baratos e críticos, e só depois refatorar. Esforço: Pequeno, Médio ou Grande.

**1. Correções imediatas** (depois da aprovação deste diagnóstico, cada uma começando por um teste que reproduz o defeito)

| Ação | Problema | Esforço |
| --- | --- | --- |
| Parser numérico que detecta o separador decimal | P-03 | Pequeno |
| Completar o mock `findAssignable` e afirmar as notificações | P-15 | Pequeno |
| Chave de idempotência: gravar `submissionId` só em `responses.submitted` (não exige migration) | P-01 | Médio |
| `dryRun` no `runTest` | P-02 | Médio |
| Dedupe de aprovação por nó | P-06 | Médio |
| Retomada com compare-and-set | P-05 | Médio |
| Sub-fluxo que pausa | P-04 | Médio |
| Validador de grafo no backend | P-07 | Médio |
| Mascarar segredos na leitura (inclui ajuste no editor) | P-09 | Médio |

**2. Testes críticos a adicionar**

- T01 a T12 (P0): **Médio**.
- T13 a T26 e T28 a T29 (P1): **Grande**.

**3. Refatorações para testabilidade**

- Extrair `FlowGraphValidator` (puro) e usar no frontend e no backend: **Médio**.
- Extrair `FlowDispatcher` para publicar e fazer o fallback inline: **Médio**.
- Extrair um construtor de contexto único: **Pequeno**.
- Injetar relógio e fuso: **Pequeno**.
- Registro de handlers por tipo de nó, com dependências por handler: **Grande**.

**4. Melhorias de médio prazo**

- Cenários de integração com Postgres no CI: **Grande**.
- Limiares de cobertura por arquivo para `flows/`: **Pequeno**.
- Testes de mutação (Stryker) no motor, começando por `compareValues`: **Médio**.
- Testes de propriedade (fast-check) para invariantes do percurso: **Médio**.
- Silenciar logs nos specs e remover `--forceExit` do CI: **Pequeno**.

Correções como P-01 mudam comportamento e podem exigir migration e deploy; na implementação, os passos de deploy serão reportados conforme o padrão do projeto.

## 8. Critério de conclusão

A suíte é adequada quando as sete condições abaixo forem verificáveis em CI.

- **Regras críticas cobertas:** T01 a T12 passam em CI, e as regras de idempotência, isolamento por formulário, anti-loop, aprovação por nó e validação de grafo têm teste de integração.
- **Casos negativos cobertos:** cada nó com configuração obrigatória tem teste de entrada vazia ou inválida. Cada operador de condição tem teste com valor nulo, vazio e formato numérico distinto.
- **Transições protegidas:** existe teste para toda aresta do diagrama de estados, inclusive retomada duplicada, falha anterior preservada e sub-fluxo que pausa.
- **Sem testes instáveis:** 20 execuções consecutivas, em ordem aleatória e serial, sem falha e sem handles abertos, rodando sem `--forceExit`.
- **Isolamento adequado:** nenhum teste depende de fuso da máquina, relógio real ou rede, e nenhum mock engole erro (nenhum `WARN` de `is not a function` na saída).
- **Execução reproduzível:** o mesmo comando dá o mesmo resultado em Windows e no CI Linux, com `DB_AUTO_MIGRATE` explícito.
- **Cobertura com significado:** limiares por arquivo para `flows.service.ts` e `flow-execution.engine.ts`, sem cobertura de linhas feita só para subir o número.

## Anexo A. Execução

Todos os comandos rodaram no ambiente local, sem alterar configuração, dados ou código, com `DB_AUTO_MIGRATE` limpo explicitamente. Resultado: 155 de 155 testes de backend e 90 de 90 de frontend passaram em todas as execuções.

| Execução | Comando | Resultado | Tempo |
| --- | --- | --- | --- |
| Backend, paralelo com cobertura | `npx jest src/modules/flows --coverage ...` | 11 suítes, 155 testes, todos verdes | 97,7 s (frio) |
| Backend, serial | `npx jest src/modules/flows --runInBand` | 155 verdes | 13,4 s |
| Backend, aleatório | `... --runInBand --randomize --seed=12345` | 155 verdes | 8,8 s |
| Backend, aleatório | `... --randomize --seed=987654` | 155 verdes | 18,0 s |
| Frontend | `npx vitest run src/modules/flows` | 90 verdes (79 de validação e 11 do formulário LOPS IA) | 35,6 s |
| Reproduções | spec temporário com 23 cenários (R1 a R15) | executaram; vários confirmam divergências | n/a |

**Cobertura do módulo `flows`:** 57,8% de statements, 49,0% de branches e 58,7% de linhas. O motor está em 80,2% das linhas e o serviço em 42,6%.

**O que não rodei.** A suíte de integração `test:integration`: ela não tem teste de fluxo e faz reset de schema num banco de teste. Há Postgres local na porta 5432, e preferi não tocá-lo sem pedido.

**Reproduções R1 a R15.** Foram feitas com o motor e o serviço reais e repositórios simulados, em um arquivo temporário fora do repositório. O tempo de 97,7 s da primeira execução inclui o cache frio do compilador (inferência). Com a aprovação do plano, as reproduções viram testes de verdade no projeto.
