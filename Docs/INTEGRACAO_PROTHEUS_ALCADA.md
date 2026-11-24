# Integração Protheus (SIGACOM) — Aprovação de Compras por Alçada

Montado e testado em ambiente local (Docker). A configuração inicial (webhook/connector/flows) não
precisou de migration — são registros de banco criados via API/admin, não código. Depois, uma
revisão mais profunda encontrou 2 problemas reais de isolamento/observabilidade que **exigiram
mudança de código** (sem migration nova — ver seção "Correções de código" abaixo).

## O que foi criado (local)

| Item | Nome | ID local | Observação |
|---|---|---|---|
| Webhook Endpoint | Protheus - Pendencia de Alcada | `820e564f-c8bd-4d2f-b1e7-bc74e7ceac32` | token: `9d4773d0-d3bc-42b0-8027-7a5428b7d6ea` (local — gerar um novo em produção) |
| ERP Connector | Protheus SIGACOM | `049c1c7a-5d12-4811-a0c9-2d736eb44ae1` | baseUrl e bearerToken são **placeholders**, precisam ser trocados pelos reais |
| ERP Operation Template | Retorno de Aprovacao por Alcada | `afff5121-37b6-4b4c-95cd-23c15323cbb7` | POST `/rest/api/pedidos/aprovacao` (path de exemplo) |
| Form de roteamento | Protheus - Pedidos de Compra (Alcada) | `cba29b9a-606c-433c-94d9-1bf116bbba8d` | **Novo.** Form técnico, status `draft` (nunca público), usado só pra escopar o fluxo — ver correção #1 abaixo |
| Flow 1 | Protheus - Criar Solicitacao e Aprovacao de Alcada | `b51de989-d019-41cd-8e2b-4f1dc82ccc98` | webhook → cria solicitação (tagueada com o form acima) → cria aprovação (aprovadores dinâmicos) |
| Flow 2 | Protheus - Retorno de Decisao de Alcada | `76ba4af8-1395-4bd0-a759-aee5f62f4af9` | aprovação concluída **apenas deste form** → chama Protheus via ERP Connector |

## Reconciliação (cron opcional — rede de segurança)

Nova classe `FlowsErpReconciliationService` (`backend/src/modules/flows/flows-erp-reconciliation.service.ts`),
rodando a cada 30 min, **desativada por padrão**. Não substitui o webhook — existe pra cobrir o caso
de um pedido pendente nunca ter chegado via webhook (falha de rede, endpoint fora do ar no momento
do envio, etc).

Como funciona: chama um Operation Template do ERP Connector que lista os pendentes, e para cada item
da lista, **reexecuta o mesmo Flow 1** como se aquele item fosse o payload de um webhook individual —
reaproveita 100% da lógica de mapeamento/idempotência/aprovação já existente, sem duplicar regras de
negócio. Configuração via variáveis de ambiente (ver `.env.example`):

```
ERP_RECONCILIATION_ENABLED=false   # true pra ativar
ERP_RECONCILIATION_TEMPLATE_ID=    # id do Operation Template "listar pendentes"
ERP_RECONCILIATION_FLOW_ID=        # id do Flow 1
ERP_RECONCILIATION_ITEMS_PATH=     # dot-path pro array de itens na resposta (vazio = resposta já é o array)
```

Testado localmente com um servidor mock simulando o Protheus: confirmado que pedidos pendentes são
criados corretamente, e que reprocessar o mesmo item em ciclos seguintes **não duplica solicitação
nem aprovação** (idempotência + guarda de aprovação duplicada, ambas descritas abaixo).

## Correções de código (encontradas na revisão, já aplicadas e testadas)

**1. Isolamento do gatilho de retorno.** O nó `trigger_approval_completed` do Flow 2, sem escopo de
formulário, disparava para **qualquer aprovação concluída no sistema inteiro** (RH, TI, etc.), não só
pedidos do Protheus — porque `formId: null` é tratado como curinga em `FlowsService.findActiveFlowsByTrigger`,
não como filtro. Corrigido:
- `SolicitationsService.createFromFlowPayload` (`solicitations.service.ts`) e `ActionCreateSolicitationFromPayloadData`
  (`flow.types.ts`) ganharam um campo `formId` opcional — antes era sempre `null` fixo.
- Criei o form de roteamento acima e apontei o Flow 1 (`action_create_solicitation_from_payload.formId`)
  e o Flow 2 (`flow.formId`) pra ele.
- **Testado**: uma aprovação não relacionada ao Protheus decidida → 0 chamadas ao ERP. Um pedido do
  Protheus decidido → chamada ao ERP disparada normalmente, com o `numeroPedido` certo no corpo.

**2. Falha silenciosa quando o aprovador não existe.** Se o Protheus mandar um e-mail de aprovador
que não existe/está inativo no Tijuca Flow, `action_create_approval` falhava e o fluxo simplesmente
parava — a solicitação ficava criada, sem aprovação, sem ninguém saber. Corrigido em
`flow-execution.engine.ts` (`resolveApproverUserIds`): antes de lançar o erro, agora notifica (in-app)
todos os usuários com permissão `flows.manage`, com o título/ID da solicitação e o motivo exato.
**Testado**: pedido com e-mail inexistente → solicitação criada sem aprovação (como antes) + 2
notificações in-app criadas apontando o problema.

**3. Reforço do isolamento (defesa em profundidade).** Ao testar a correção #1 pela tela do
construtor de fluxos, percebi que **abrir o Flow 1 no editor e deixá-lo salvar sozinho já apagava
o `formId` do nó** (o editor não conhece esse campo e não o preserva no round-trip) — o que
reintroduziria o problema #1 silenciosamente, sem precisar de nenhuma edição manual. Corrigido em
`executeCreateSolicitationFromPayload`: se o nó não tiver `formId`, cai pro `formId` do próprio Flow
(coluna `form_id`, nunca tocada pelo salvamento do editor — mesmo padrão já usado por `trigger_form_submit`).
Isso resolve o risco de fato, independente da causa raiz exata do editor (que não investiguei a fundo).

**4. Aprovação duplicada em reprocessamento.** A chave de idempotência da solicitação (item 5 dos
"pontos de atenção") já evita duplicar a *solicitação*, mas não impedia recriar a *aprovação* toda
vez que o mesmo item era reprocessado (webhook reenviado, ou reconciliação pegando o mesmo pendente
de novo) — cada replay criava mais uma aprovação na mesma solicitação. Corrigido em
`executeCreateApproval`: antes de criar, verifica se a solicitação já tem alguma aprovação e pula
se tiver. **Testado**: mesmo payload de webhook enviado 2x → só 1 aprovação; reconciliação rodando
repetidamente sobre os mesmos itens por >1 min → contagem de aprovações não aumenta.

Arquivos alterados (sem migration): `backend/src/modules/flows/types/flow.types.ts`,
`backend/src/modules/flows/flow-execution.engine.ts`, `backend/src/modules/flows/flow-execution.engine.spec.ts`,
`backend/src/modules/solicitations/solicitations.service.ts`,
`backend/src/modules/flows/flows-erp-reconciliation.service.ts` (novo),
`backend/src/modules/flows/flows.module.ts`, `backend/.env.example`.

## Teste ponta a ponta (local)

Enviei este payload simulando o Protheus:

```json
{
  "header": {
    "numeroPedido": "PC-000123",
    "comprador": "Fulano de Tal",
    "dataEntrega": "2026-08-20",
    "observacao": "Compra de insumos para producao"
  },
  "itens": [{ "codigo": "001", "descricao": "Farinha", "quantidade": 100, "valorUnitario": 12.5 }],
  "valores": { "total": 15400.00 },
  "aprovadores": [{ "email": "admin@tijucaalimentos.com", "nome": "Administrador" }]
}
```

Resultado:
- Solicitação `PC-000123` criada com status `waiting_approval`, metadata mapeado corretamente.
- Aprovação criada e atribuída ao usuário resolvido a partir do e-mail em `aprovadores`.
- Ao aprovar, o Flow 2 disparou e tentou o POST para `http://protheus-sigacom:8080/rest/api/pedidos/aprovacao` com corpo:
  ```json
  {"numeroPedido":"PC-000123","decisao":"approved","tijucaFlowSolicitacaoId":"f0e3f07e-2dea-4338-990c-ebf157a8846b"}
  ```
  Falhou apenas porque `protheus-sigacom` é um host fictício (esperado) — a lógica de interpolação e disparo está correta.

## Pontos de atenção / decisões pendentes

1. **`{{decision}}` só produz `"approved"`/`"rejected"` (inglês literal)** — não há tradução automática para `"aprovado"/"reprovado"`. Ou o Protheus aceita esses valores, ou isso precisa de um ajuste de código (fora do escopo desta configuração).
2. **Nomes de campo são genéricos** (`header.numeroPedido`, `valores.total`, `aprovadores[].email`, etc.) — preciso do JSON real do Protheus para ajustar os dot-paths (`titlePath`, `metadataFieldMappings`, `approversPath`) e o `endpointPath`/`bodyTemplate` do retorno.
3. **URL do Protheus**: se não for um host interno (IP privado ou sem TLD), a criação do Connector em produção vai falhar por causa do guard de SSRF — precisa adicionar o host em `ALLOWED_ERP_HOSTS` (variável de ambiente do backend) antes.
4. ~~Sem sincronização/polling de status~~ — **resolvido**: `FlowsErpReconciliationService` cobre isso agora (opcional, desativado por padrão — ver seção "Reconciliação" acima). Falta configurar um Operation Template real de "listar pendentes" no Protheus pra ativar.
5. **Reenvio de pedido reprovado**: a chave de idempotência é só o `numeroPedido` — se o Protheus reenviar o mesmo número depois de reprovado (ex: corrigido), o sistema devolve a solicitação antiga já decidida em vez de criar uma nova aprovação. Se isso for um cenário real, precisa de um componente extra na chave (ex: `numeroPedido + versão/tentativa`).
6. **Sem confirmação síncrona pro Protheus**: o webhook responde `200 OK` antes do Flow rodar (processamento é assíncrono via fila). Combinado com o item 5, o Protheus não tem como saber, pela resposta HTTP, se a aprovação foi realmente criada.

## Checklist para produção (flowapi.appstijuca.com.br)

Não tenho acesso ao servidor de produção. Duas partes distintas:

**A) Deploy de código** (as 4 correções + o novo `FlowsErpReconciliationService`) — precisa do
   pipeline normal de build/deploy da imagem Docker do backend. **Sem migration nova.** Se for
   usar a reconciliação, configurar as 4 variáveis `ERP_RECONCILIATION_*` no ambiente de produção
   (documentadas em `.env.example`) — fica desativada por padrão até isso ser feito.

**B) Configuração de dados** (webhook/connector/template/form/flows) — são registros criados via
   UI/API, recriar do zero em produção:

1. **Forms → Novo formulário**: nome "Protheus - Pedidos de Compra (Alçada)", 1 seção com 1 campo qualquer (só pra passar da validação), **deixar em Rascunho** (nunca publicar). Guardar o ID gerado.
2. **Webhooks → Novo Endpoint**: nome "Protheus - Pendência de Alçada", ativar "Disparar Flow". Guardar o token gerado — a URL que o Protheus vai chamar é `https://flowapi.appstijuca.com.br/api/v1/webhooks/in/<token>`.
3. **Administração → ERP → Conectores → Novo**: nome "Protheus SIGACOM", `baseUrl` real, tipo de autenticação real e credencial real (preencher direto na tela — nunca me passe o token real).
   - Se a URL do Protheus não for interna, adicionar o host em `ALLOWED_ERP_HOSTS` no ambiente do backend antes de criar o connector.
4. **Dentro do connector → Novo Template**: método POST, `endpointPath` real do endpoint de retorno do Protheus, `bodyTemplate` ajustado aos nomes de campo reais.
5. **Fluxos → Novo Fluxo** (x2): recriar os dois fluxos, **cada um apontando pro form criado no passo 1** (Flow 1 no campo `formId` do formulário do fluxo E no `formId` dentro do nó `action_create_solicitation_from_payload`; Flow 2 no campo `formId` do formulário do fluxo) — isso é o que impede o Flow 2 de disparar pra aprovações de outros processos.
6. Trocar `endpointId` (Flow 1), `connectorId`/`templateId` (Flow 2) e os `formId` pelos IDs reais gerados nos passos 1-4.
7. Testar com um payload real de sandbox do Protheus antes de ativar de vez.
