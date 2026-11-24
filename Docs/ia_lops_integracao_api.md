# Integração LOPS IA → Tijuca Flow (API para construir processos)

Especificação feita em 2026-10-15 a partir das decisões tomadas sobre a análise
[ia_construtor_de_processos_analise.md](ia_construtor_de_processos_analise.md).

## Estado: implementado (2026-10-15)

As etapas 1 a 6 da seção 9 estão no código (módulo `backend/src/modules/ai-builder`). Falta a
etapa 7, que é da LOPS IA: importar o OpenAPI, cadastrar a chave e usar o prompt
[ia_construtor_de_processos_prompt_sistema.md](ia_construtor_de_processos_prompt_sistema.md).

**Para ligar num ambiente:**

1. Rodar as migrations `1789400000000-PhaseSectionFlow`, `1789500000000-AiCopilotPermission` e
   `1789600000000-LopsAiSessions`.
2. No `backend/.env`: `LOPS_AI_INBOUND_API_KEY` (mínimo 32 caracteres, gerada para isso; a mesma vai
   na LOPS IA) e, se quiser, `LOPS_AI_SESSION_TTL_MINUTES` (padrão 480) e `LOPS_AI_ALLOWED_IPS`.
   `GOOGLE_WORKSPACE_DOMAIN`, que já existe, limita o domínio do e-mail. Sem a chave, as rotas
   `/ai` respondem 503.
3. Na LOPS IA: importar `GET /api/v1/ai/openapi.json` (enviando `X-API-Key`) e configurar a chave.
4. Dar `ai.copilot.use` a outros perfis, se precisar (a migration dá só a admin e gerente).

**O que ficou diferente do desenho abaixo:**

- Rotas em `/api/v1/ai/...` (versão da API do sistema), não `/api/ai/v1`.
- Seções da fase: sem tabela nova. Cada seção continua aberta por um campo "Título" (código =
  chave da seção) e o caminho fica em `kanban_phases.section_flow`.
- Aprovação de fase vale **por passagem**: para sair da fase, conta só a aprovação criada desde
  que o card entrou nela. Card devolvido que volta à fase precisa de aprovação nova.
- Aviso "para o perfil" num fluxo vira a lista das pessoas do perfil no momento da criação (o nó
  de notificação não tem destinatário por perfil); a criação devolve um aviso dizendo isso.
- Nome de fluxo repetido do mesmo criador ganha " (2)", " (3)"...
- `Idempotency-Key` é guardada na auditoria (`lops_ai.process_created`), junto com o resultado
  e os documentos de origem; não há tabela nova.
- `pending` volta na resposta e fica na auditoria; o Criador ainda não mostra.
- Token de sessão **curto** (`tf-XXXX-XXXX-XXXX-XXXX`, 80 bits), não JWT: a IA repete o token em
  cada chamada e errava ao copiar os ~265 caracteres do JWT (o backend recusava como "expirada").
  Fica na tabela `lops_ai_sessions` (só o hash) e a validade **anda a cada uso**: a sessão dura a
  conversa inteira e cai depois de `LOPS_AI_SESSION_TTL_MINUTES` parada.
- Processo "quase certo" (apelidos como `form.type`, `is_required`, opções em texto) é convertido
  antes da conferência e listado em `adjusted`.
- Na LOPS IA: no corpo, `{{x}}` vai **sem aspas** (`{ "email": {{email}} }`) — ela já põe as
  aspas; e o token não deve ser "preenchido por outra tool" (a LOPS reexecutaria Abrir sessão sem
  o e-mail).

## 1. Decisões

| Tema | Decisão |
|---|---|
| Provedor | **LOPS IA**. A conversa acontece na plataforma da LOPS IA, que já sabe chamar ferramentas. O Tijuca Flow expõe uma API para ela |
| Onde a IA cria | **Direto no Tijuca Flow**, por **um único endpoint** que cria o processo inteiro |
| Regras (aprovação condicional, devolução, roteamento) | **Tudo como fluxo** (motor de fluxos). As fases continuam só com o que já têm |
| Ramificação nos formulários das fases | Entra **antes** da IA (pré-requisito, seção 7) |
| Documentos anexos (procedimento, PDF) | **Na primeira versão**. Como a conversa é na LOPS IA, o arquivo é lido lá; o Tijuca Flow só recebe o processo pronto (seção 8) |
| Quem usa | Quem está logado na LOPS IA com a conta Google do Workspace da empresa **e** tem usuário ativo no Tijuca Flow com o mesmo e-mail |

Consequência importante: **o assistente não fica dentro do Criador**. O painel "Assistente" e o
"aplicar ao rascunho" da análise saem do escopo. Em troca, a pessoa abre o processo criado no
Criador pelo link que a API devolve.

---

## 2. Autenticação e segurança

### Como fica

```
 Pessoa ──login Google Workspace──▶ LOPS IA
                                      │
                                      │ 1. POST /ai/session
                                      │    X-API-Key: <chave compartilhada>
                                      │    { email: "fulano@empresa.com.br" }
                                      ▼
                                 Tijuca Flow
                                 - confere a chave (comparação em tempo constante)
                                 - confere o domínio (GOOGLE_WORKSPACE_DOMAIN)
                                 - procura usuário ATIVO com esse e-mail
                                 - confere a permissão ai.copilot.use
                                      │
                                      │ 2. devolve token de sessão (curto, ligado ao usuário)
                                      ▼
                                   LOPS IA
                                      │ 3. demais chamadas:
                                      │    X-API-Key: <chave compartilhada>
                                      │    Authorization: Bearer <token de sessão>
                                      ▼
                                 Tijuca Flow age COMO aquele usuário
                                 (mesmas permissões, escopo de área e auditoria)
```

### Por que dois segredos e não "devolver a API key ao confirmar o e-mail"

Se o Tijuca Flow devolvesse uma chave só porque recebeu um e-mail existente, qualquer um que
soubesse um e-mail da empresa conseguiria uma chave. Por isso:

- **API key compartilhada** — configurada uma vez nos dois lados (no Tijuca Flow, no `.env`; na
  LOPS IA, nas configurações da conexão). Ela prova que **quem chama é a LOPS IA**.
- **Token de sessão** — emitido pelo Tijuca Flow depois de conferir a pessoa. Ele diz **em nome
  de quem** a LOPS IA está agindo, vale poucas horas e é revogado se o usuário for desativado.

### O que implementar

- Variáveis no `backend/.env`:
  - `LOPS_AI_INBOUND_API_KEY` — a chave que a LOPS IA envia (mínimo 32 caracteres). É diferente
    de `LOPS_AI_API_KEY`, que é a chave que o Tijuca usa para chamar a LOPS.
  - `LOPS_AI_SESSION_TTL_MINUTES` — quanto tempo parada a sessão dura; cada chamada renova (padrão 480).
  - `LOPS_AI_ALLOWED_IPS` (opcional) — IPs da LOPS IA, se forem fixos.
  - Já existe `GOOGLE_WORKSPACE_DOMAIN`, que é reaproveitado.
- **`LopsAiAuthGuard`**: confere a chave e o token e monta `request.user` no **mesmo formato do
  login normal** (`JwtPayload`: `sub`, `email`, `role`, `areaId`, `tokenVersion`). Assim o
  `PermissionsGuard` e os serviços que já existem funcionam sem mudança, inclusive o escopo por
  área. O token carrega o `tokenVersion` do usuário: trocar a senha ou desativar o usuário derruba
  a sessão da IA, como já acontece com o login.
- **Permissão nova `ai.copilot.use`** no catálogo (`common/constants/permission-catalog.ts`).
  Criar processo pela IA exige também `forms.create` e `kanban_phases.manage`; criar fluxo exige
  `flows.manage`. A IA nunca pode mais do que a própria pessoa.
- **Limite de chamadas** (Throttle) por usuário nas rotas `/ai/*`, mais apertado na criação.
- **Auditoria**: todo evento feito pela IA vai para o `audit` com `via: 'lops_ai'` e o e-mail da
  pessoa.
- **Opcional, mais forte**: se a LOPS IA conseguir repassar o *ID token* do Google da pessoa, o
  Tijuca Flow confere esse token direto no Google (assinatura, domínio `hd`, e-mail verificado)
  em vez de confiar no e-mail enviado. Vale perguntar à LOPS IA se isso é possível.

---

## 3. Endpoints

Todos ficam sob `/api/v1/ai` (o prefixo e a versão da API do sistema). Exigem `X-API-Key` e, menos o primeiro, o token de sessão.

### 3.1 Sessão

| Método e rota | Faz |
|---|---|
| `POST /ai/session` `{ email }` | Confere a pessoa e devolve `{ token, expiresAt, user: { nome, perfil, área, permissões resumidas } }`. Recusa e-mail fora do domínio, usuário inexistente ou inativo e falta de `ai.copilot.use` |
| `GET /ai/me` | Quem é a pessoa da sessão e o que ela pode fazer |

### 3.2 Manual do sistema (para a IA entender as regras)

| Método e rota | Faz |
|---|---|
| `GET /ai/openapi.json` | Documento OpenAPI **só das rotas `/ai`**, disponível também em produção. É o que se importa na LOPS IA para ela conhecer as ferramentas |
| `GET /ai/guide` | Manual em JSON: tipos de campo (para que servem e configurações aceitas), opções de fase, tipos de nó de fluxo liberados para a IA, padrões de regra (seção 5) e limites |
| `GET /ai/schema/process` | JSON Schema do corpo de criação (seção 4). A IA monta o processo seguindo esse schema |

### 3.3 Catálogo (o que já existe no sistema)

Só leitura, filtrado pelas permissões da pessoa. Devolve **estrutura e cadastro**, nunca respostas
ou dados de solicitações.

| Método e rota | Devolve |
|---|---|
| `GET /ai/catalog/roles` | Perfis: código, nome, descrição, quantas pessoas ativas têm o perfil |
| `GET /ai/catalog/areas` | Áreas: id, nome |
| `GET /ai/catalog/users?search=` | Busca pontual por nome ou e-mail (até 10): id, nome, e-mail, perfil, área. Sem busca, não lista ninguém |
| `GET /ai/catalog/item-lists` | Listas de itens: id, nome, quantidade e amostra de itens |
| `GET /ai/catalog/erp` | Listas e tabelas do ERP configuradas para o campo "Lista do ERP" e "Tabela do ERP" |
| `GET /ai/catalog/integrations` | O que está disponível para fluxos: Google Sheets, WhatsApp, GLPI, ERP, webhooks de entrada (só nome e se está ativo; nunca credenciais) |
| `GET /ai/processes?search=` | Processos existentes: id, nome, área, situação, nº de fases, data de alteração |
| `GET /ai/processes/:id` | Um processo completo **no mesmo formato da criação** (seção 4), com fluxos. Serve de exemplo ("faça parecido com o de Cancelamento") e de base para editar |

### 3.4 Conferir e criar

| Método e rota | Faz |
|---|---|
| `POST /ai/processes/validate` | Confere o processo sem gravar. Devolve `{ valid, errors[], warnings[] }`, cada item com caminho e mensagem em português, por exemplo `phases[2].approval.approvers.roles[0]: o perfil "diretor" não existe` |
| **`POST /ai/processes`** | **O endpoint único.** Cria **tudo numa transação**: formulário (versão, seções, campos, opções, caminhos e ramificações), fases (campos, seções e ramificação de fase, quem atua, quem aprova, visibilidade, prazo), configuração do Kanban e fluxos. Aceita `?dryRun=true`, que faz tudo e desfaz no fim |
| `PUT /ai/processes/:id` | *(depois da v1)* Substitui o processo por uma nova versão, com as mesmas regras |

Comportamento do `POST /ai/processes`:

- **Confere antes de gravar**, com as mesmas regras do `validate`. Com erro, devolve `422` e a
  lista de erros, sem gravar nada.
- O processo nasce como **rascunho** (não publicado). Publicar continua sendo da pessoa, no
  Criador. Como o formulário não está publicado, os fluxos não disparam até lá.
- Cabeçalho **`Idempotency-Key`** obrigatório: se a LOPS IA repetir a chamada (tempo esgotado,
  nova tentativa), o Tijuca devolve o processo já criado em vez de duplicar.
- A pessoa que está na sessão vira a **criadora** e entra como **responsável** do processo.
- Resposta:

```json
{
  "processId": "…",
  "name": "Pedido de Compra",
  "status": "draft",
  "builderUrl": "https://…/builder/…",
  "created": { "sections": 4, "fields": 23, "phases": 5, "phaseFields": 6, "flows": 3 },
  "warnings": [ "A fase \"Pagamento\" não tem prazo." ],
  "pending": [ "Configurar a planilha do Google Sheets no Criador (precisa de login Google)." ]
}
```

---

## 4. Corpo do processo (formato da criação)

Tudo por **chave legível**: seções e fases por `key`, campos por `code`, perfis por código,
áreas e listas por id do catálogo, pessoas por e-mail. O backend troca por ids ao gravar. Os
mesmos dados saem no `GET /ai/processes/:id`.

```json
{
  "name": "Pedido de Compra",
  "description": "Compra de materiais e serviços",
  "areaId": "…",
  "form": {
    "mode": "stepper",
    "sections": [
      {
        "key": "dados",
        "title": "Dados do pedido",
        "fields": [
          { "code": "tipo", "label": "Tipo", "type": "single_select", "required": true,
            "options": [ { "value": "material", "label": "Material" },
                         { "value": "servico",  "label": "Serviço" } ] },
          { "code": "valor_total", "label": "Valor total", "type": "currency", "required": true },
          { "code": "justificativa", "label": "Justificativa", "type": "long_text", "required": false,
            "visibility": { "action": "show", "operator": "and",
                            "conditions": [ { "field": "valor_total", "op": "greater_than", "value": 5000 } ] } }
        ],
        "next": { "default": "itens",
                  "branches": [ { "field": "tipo", "option": "servico", "goTo": "escopo" } ] }
      },
      { "key": "itens",  "title": "Itens",  "fields": [ "…" ], "next": { "default": "submit" } },
      { "key": "escopo", "title": "Escopo", "fields": [ "…" ], "next": { "default": "submit" } }
    ]
  },
  "phases": [
    { "key": "triagem", "label": "Triagem", "color": "blue",
      "actors": { "roles": ["compras"] }, "sla": { "hours": 8, "businessHours": true } },
    { "key": "aprovacao_gerente", "label": "Aprovação do gerente",
      "actors": { "roles": ["compras"] },
      "approval": { "approvers": { "roles": ["gerente_area"] }, "rule": "any" },
      "sections": [
        { "key": "parecer", "title": "Parecer",
          "fields": [ { "code": "parecer_gerente", "label": "Parecer", "type": "long_text", "required": true } ] }
      ] },
    { "key": "aprovacao_diretoria", "label": "Aprovação da diretoria",
      "approval": { "approvers": { "roles": ["diretor"] }, "rule": "any" } },
    { "key": "compra", "label": "Compra", "actors": { "roles": ["compras"] } },
    { "key": "concluido", "label": "Concluído", "terminal": true }
  ],
  "kanban": { "cardValueField": "valor_total" },
  "flows": [
    {
      "name": "Acima de R$ 10 mil vai para a diretoria",
      "nodes": [
        { "key": "decidiu",  "type": "trigger_approval_completed", "data": { "phase": "aprovacao_gerente" } },
        { "key": "aprovado", "type": "condition_approval_result",  "data": { "operator": "equals", "value": "approved" } },
        { "key": "valor",    "type": "condition_field_value",      "data": { "fieldCode": "valor_total", "operator": "greater_than", "value": "10000" } },
        { "key": "dir",      "type": "action_move_phase",          "data": { "phase": "aprovacao_diretoria" } },
        { "key": "compra",   "type": "action_move_phase",          "data": { "phase": "compra" } }
      ],
      "edges": [
        { "from": "decidiu",  "to": "aprovado" },
        { "from": "aprovado", "to": "valor", "when": "yes" },
        { "from": "valor", "to": "dir",    "when": "yes" },
        { "from": "valor", "to": "compra", "when": "no" }
      ]
    }
  ],
  "pending": [ "Perfil \"diretor\" não existe — criar antes de publicar." ]
}
```

Observações:

- Fluxos usam `phase` (chave) e `fieldCode`; o backend troca pelos ids das fases recém-criadas.
  Posições no canvas são calculadas automaticamente.
- Os tipos de nó aceitos da IA são uma **lista fechada** (seção 5). Nós com credenciais (webhook
  com segredo, LOPS IA, ERP) ficam de fora da v1: a IA deixa como `pending` para a pessoa montar
  no editor de fluxos.
- `pending` é gravado como observação do processo e aparece no Criador.
- Opções do processo ficam em `form`, ao lado de `mode`, e são opcionais (ausente = padrão):
  `showResponderIdentification` (`false` esconde o bloco de nome e e-mail),
  `requireResponderIdentification` (`true` torna nome e e-mail obrigatórios) e
  `requiresResponseApproval` (`true` faz o solicitante aprovar a resposta do atendente). O
  `GET /ai/processes/:id` devolve as que fogem do padrão; a IA mantém essas chaves ao propor a
  versão nova, senão o processo recriado volta ao padrão.

---

## 5. Regras como fluxo

### O que já dá para fazer com o motor atual

- Condição por valor de campo (`condition_field_value`: igual, diferente, contém, maior, menor,
  vazio, preenchido), com saídas `yes`/`no`.
- Mover o card de fase (`action_move_phase`).
- Criar aprovação ligada à fase (`action_create_approval` com `scope: 'phase'`), com regra
  `any`/`all`/`sequential`, e esperar a decisão; depois desviar pelo resultado
  (`condition_approval_result`).
- Esperar os campos de uma fase serem salvos (`action_wait_for_phase_fields`).
- Avisar pessoas (`action_notification`), atribuir responsável (`action_assign_responsible`),
  chamar outro fluxo (`action_run_flow`).

### O que falta no motor (pré-requisito para "tudo como fluxo")

| # | Falta | Por que importa | Proposta |
|---|---|---|---|
| F1 | **Evento de mudança de fase.** Mover o card de fase não dispara nada; o gatilho `trigger_solicitation_moved` reage à mudança de *status*, não de fase | Sem ele, nenhuma regra "quando chegar na fase X…" funciona | Emitir `solicitations.phase_changed` no `movePhase` e criar o gatilho `trigger_phase_entered` (fase de destino; opcionalmente fase de origem) |
| F2 | **Devolver o card bloqueia.** Ao reprovar uma aprovação de fase, o card fica na fase, e o portão de aprovação impede *qualquer* saída, inclusive voltar | A regra "reprovou, volta para Triagem" não passa | Liberar a volta para uma fase **anterior** (ordem menor) sem exigir aprovação |
| F3 | **Aprovação de fluxo não segura o card.** O portão só olha `requiresApproval` da fase. Uma aprovação criada por fluxo não impede a pessoa de mover o card antes da decisão | "Acima de 10 mil o diretor aprova" pode ser furado | O portão passa a exigir também que não haja aprovação da fase **pendente ou reprovada** criada por fluxo |
| F4 | **Aprovação de fluxo por perfil.** No modo fixo, o nó aceita só pessoas e e-mails; por perfil, só "o aprovador da fase atual" | A IA precisa dizer "o diretor aprova" sem depender da configuração da fase | Aceitar `approverRoleCodes` no modo fixo |
| F5 | **Gatilho de aprovação por fase.** `trigger_approval_completed` filtra só por formulário; não há como dizer "quando a aprovação **desta fase** terminar", nem condição "a fase atual é X" | Num processo com duas fases de aprovação, o fluxo de uma dispara na outra | Filtro opcional de fase no gatilho (e, se útil, a condição `condition_current_phase`) |
| F6 | **Impedir um caminho.** Fluxo reage *depois* do movimento; não consegue proibir que o card vá da Triagem direto para Concluído | Limite a explicar à pessoa | Na v1, a IA monta um fluxo que **devolve** o card e avisa. Se isso for pouco, rever a decisão de não colocar regra na fase |

### Padrões que a IA deve usar (vão no `GET /ai/guide`)

| Pedido | Fluxo |
|---|---|
| "Acima de R$ X, a diretoria aprova" | Duas fases de aprovação. Aprovação da anterior concluída → aprovada → `condition_field_value` → `action_move_phase` para a diretoria (sim) ou para a seguinte (não) (precisa de F5). Alternativa com F1 + F3: ao entrar na fase → condição → `action_create_approval` só quando passar do valor |
| "Se reprovar, volta para a Triagem" | `trigger_approval_completed` (da fase) → `condition_approval_result = rejected` → `action_move_phase` para Triagem + aviso ao solicitante (precisa de F2 e F5) |
| "Quando aprovar, segue sozinho" | `trigger_approval_completed` (da fase) → `approved` → `action_move_phase` para a próxima fase (precisa de F5) |
| "Se for serviço, pula a fase de estoque" | `trigger_phase_entered` na fase anterior → `condition_field_value tipo = servico` → `action_move_phase` |
| "Avisar o financeiro quando chegar no pagamento" | `trigger_phase_entered` (Pagamento) → `action_notification` para o perfil |
| "Prazo estourado, avisar o gestor" | `trigger_sla_breached` (fase) → `action_notification` |

---

## 6. Validação feita pelo backend

Além do que o DTO já confere, o `validate` e o `POST` cobram:

- códigos de campo únicos no processo inteiro (formulário e fases juntos);
- toda referência existe: campo e opção das ramificações, seção de destino, fase dos fluxos, perfil,
  área, lista, pessoa;
- ramificação de seção só sobre lista de opção única ou caixa de seleção;
- toda seção alcançável e todo caminho termina no envio, sem ciclo;
- fórmula de campo calculado válida e só sobre campos numéricos ou de moeda;
- fase com aprovação tem aprovadores; ao menos uma fase terminal; fase terminal sem aprovação;
- tipos proibidos em fase (`erp_lookup`, `erp_table`);
- fluxo com exatamente um gatilho, nós e ligações coerentes, tipos de nó dentro da lista liberada,
  sem ciclo;
- limites: até 30 seções, 300 campos, 20 fases e 30 fluxos por processo.

Hoje uma referência errada vira vazio em silêncio (`form-version.writer.ts`,
`resolveFlowReferences`). Na criação pela IA, isso tem que virar erro.

---

## 7. Pré-requisito: ramificação nos formulários das fases

Hoje os campos de fase são uma lista plana, agrupada visualmente por campos "Título"
(`kanban-phases/lib/phase-form-sections.ts`), sem caminho condicional. Duas formas de fazer:

| Opção | Como | Prós | Contras |
|---|---|---|---|
| **A. Seções reais na fase** (recomendada) | Tabela `kanban_phase_sections` com o mesmo modelo do formulário (`next`, `branches`); campo de fase ganha `section_id` | Mesmo modelo do formulário de abertura: o Criador, o corpo da IA e a validação reaproveitam tudo | Migration e ajuste no app móvel |
| B. Regra de exibição por bloco | O campo "Título" ganha `visibilityRules`, que valem para o bloco inteiro | Sem tabela nova | Modelo diferente do formulário; mais um formato para a IA aprender |

O corpo da seção 4 já está escrito supondo a opção A (`phases[].sections`).

**Feito (2026-10-15), opção A:** as seções continuam abertas pelos campos "Título" (sem tabela nova
nem conversão de dados) e o caminho fica em `kanban_phases.section_flow` (jsonb, migration
`1789400000000-PhaseSectionFlow`), referenciando seções e campos pelo código. Regra em
`backend/src/modules/kanban-phases/phase-section-flow.ts`, espelhada no front em
`frontend/src/modules/kanban-phases/lib/phase-section-flow.ts`. No card só aparecem as seções do
caminho; obrigatório fora do caminho não é cobrado e o valor dele é apagado ao salvar. Na
criação pela IA, `phases[].sections` vira campos "Título" + `sectionFlow`.

---

## 8. Documentos anexos

Como a conversa acontece na LOPS IA, o PDF ou procedimento é lido **lá**. O Tijuca Flow não
recebe o arquivo, só o processo pronto. Para a v1:

- nada a fazer no Tijuca Flow para ler documentos;
- opcional: o corpo da criação aceita `sourceDocuments: [{ name, summary }]`, guardado como
  observação do processo, para registrar de onde ele veio;
- o prompt da LOPS IA deve tratar o conteúdo do documento como referência, nunca como ordem.

---

## 9. Ordem de implementação

| # | Entrega | Depende de |
|---|---|---|
| 1 | Ramificação nos formulários das fases (opção A) | — |
| 2 | Motor de fluxos: F1 a F5 | — |
| 3 | Autenticação: `LopsAiAuthGuard`, `POST /ai/session`, permissão `ai.copilot.use`, limite de chamadas, auditoria | — |
| 4 | Formato do processo + conversores (processo ↔ formato) + `validate` | 1 |
| 5 | `POST /ai/processes` atômico, com `dryRun` e `Idempotency-Key` | 2, 3, 4 |
| 6 | Catálogo, `guide`, `schema` e `openapi.json` | 3, 4 |
| 7 | Configurar na LOPS IA: importar o OpenAPI, cadastrar a chave, ajustar o prompt e testar com processos reais | 5, 6 |

Os itens 1, 2 e 3 são independentes e podem andar em paralelo.

Cada um precisa de migration? 1 sim (tabela de seções de fase). 2 não (só código; o portão novo
lê a tabela de aprovações). 3 só a permissão nova no catálogo, que é semeada. 4 a 6 não, a não ser
que `pending`/`sourceDocuments` vire coluna (pode ficar em JSON nas configurações do formulário).

---

## 10. Perguntas para a LOPS IA

1. Ela consegue repassar o **ID token do Google** da pessoa? (autenticação mais forte, seção 2)
2. Ela importa **OpenAPI 3** para definir as ferramentas ou o cadastro é manual?
3. Os IPs de saída dela são fixos? (lista de IPs permitidos)
4. Qual o tempo máximo de espera por chamada de ferramenta? (a criação de um processo grande
   pode levar alguns segundos)
5. Ela reenvia a chamada sozinha quando dá erro de rede? (confirma a necessidade da
   `Idempotency-Key`)
