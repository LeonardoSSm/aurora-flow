# IA para construir processos — análise e preparação

Análise feita sobre a branch `prototipo/processos` (2026-10-15). Objetivo: uma IA dentro do sistema
que monte o processo de ponta a ponta — formulário de abertura (seções, campos, ramificação entre
seções), fases (campos, quem atua, quem aprova, regra de aprovação, visibilidade, SLA) e as regras
que ligam tudo (automações/fluxos).

---

## 1. Resumo

- **A IA não deve gravar direto no banco nem chamar 4 endpoints soltos.** Ela deve produzir um único
  documento — o **Blueprint do Processo** (JSON) — que o backend valida e o Criador carrega como
  **rascunho**. A pessoa revisa no mapa de fases e clica no "Salvar" que já existe.
- **A base atual ajuda muito**: o formulário já é salvo por *código de campo* e *índice de seção*
  (sem UUIDs), que é exatamente o formato que um modelo de linguagem gera bem.
- **O que falta é fundação, não IA**: um contrato único e tipado, um validador estrito que devolva
  erros legíveis, gravação atômica de form + fases, um catálogo de contexto (perfis, áreas, usuários,
  listas) e fechar algumas lacunas de regra de negócio (transições entre fases, devolução na
  reprovação, aprovação condicional, ramificação por valor numérico).
- Essa fundação **vale mesmo sem IA**: vira importar/exportar processo, modelos prontos e — muito
  útil aqui — levar um processo montado localmente para produção sem montar à mão.

---

## 2. Como o sistema está hoje (o que a IA teria que produzir)

| Peça | Onde mora | Como é gravada hoje | Observação para IA |
|---|---|---|---|
| Formulário, versão, seções, campos, opções | `form*.entity.ts` | `POST /forms`, `PATCH /forms/:id` — DTO `CreateFormDto` (`backend/src/modules/forms/dto/create-form.dto.ts`) | Referências por `fieldCode` e `targetSectionIndex` — bom para geração |
| Ligação entre seções (próxima seção / ramificação) | `form-section.entity.ts` (`nextSectionId`), `form-section-branch.entity.ts` | Dentro do mesmo DTO (`nextSectionIndex`, `branches[]`) | Ramifica só por **opção de select** ou **checkbox**; não por valor (`> 10.000`) |
| Regras de exibição de campo | `form-field.entity.ts` (`conditionsJson.show_if` **e** `visibilityRules`) | Dentro do DTO, como `Record<string, unknown>` | **Dois formatos** para a mesma ideia; nenhum tipado no DTO |
| Configuração por tipo de campo | `settingsJson` (fórmula, `displayAs`, tabela de produtos, limites de arquivo, ERP…) | `Record<string, unknown>` | Sem schema: a IA não tem como saber as chaves válidas |
| Fases + campos de fase | `kanban-phase.entity.ts`, `kanban-phase-field.entity.ts` | `PUT /forms/:formId/kanban-phases` (`SaveKanbanPhasesDto`) | Quem atua / quem aprova = `roleCodes` + `userIds`; regra `any`/`all`/`sequential`; visibilidade por perfil/área/usuário; SLA |
| Config do Kanban | `forms.kanban_settings` | `PUT /forms/:formId/kanban-settings` | Só `cardValueField` hoje |
| Automações antigas | `automation-rule.entity.ts` | `/automations` | `conditions`/`actions` sem tipo |
| Fluxos (motor) | `flow.entity.ts` — `nodes`/`edges` | `/flows` | 35 tipos de nó (`flows/types/flow.types.ts`), incluindo `action_create_approval`, `action_move_phase`, `condition_field_value`, `action_ai_agent` |
| IA existente | `integrations/lops-ai/` | — | Só **lista agentes** e executa nó de fluxo com chave do nó. Não há LLM com *tool calling* no backend |

Comportamentos atuais que importam para "regras":

- **Mover entre fases é livre** (`solicitations.service.ts`, `movePhase`): qualquer fase do mesmo
  formulário, em qualquer direção. O único bloqueio é `requiresApproval` da fase atual.
- **Campos obrigatórios de fase** são cobrados ao salvar os valores, não ao mover o card.
- **Reprovação** (`approvals.service.ts`): a aprovação da solicitação inteira leva a solicitação a
  `REJECTED`; a aprovação **de fase** só registra no histórico e o card fica parado na fase — e o
  portão de aprovação impede qualquer saída, inclusive voltar. Não existe "devolver para a fase X".
- **Aprovação de fase é incondicional** (`requiresApproval: boolean`). "Aprovação do diretor acima
  de R$ 50 mil" só é possível hoje com fluxo (`condition_field_value` + `action_create_approval`).
- **Salvar no Criador são duas chamadas em sequência** (`builder-view.tsx`, `handleSave`: form,
  depois fases). Se a segunda falha, fica meio processo gravado.
- **Referências inválidas viram nulo em silêncio** (`form-version.writer.ts`,
  `resolveFlowReferences`): ramificação com `fieldCode` inexistente grava `fieldId = null`; índice
  de seção fora da faixa grava destino nulo. Para IA isso é perigoso — o erro tem que aparecer.
- Campo de fase não aceita `erp_lookup`/`erp_table`, e formulário de fase não tem ramificação
  (pendência conhecida do protótipo).

---

## 3. Como funcionaria

```
 Pessoa descreve o processo      ┌──────────────────────────────┐
 (texto, ou anexa POP/PDF) ────▶ │  Copiloto (backend)          │
                                 │  LLM + ferramentas:          │
                                 │  - consultar catálogo        │
                                 │  - validar blueprint         │
                                 │  - ler processo atual        │
                                 └──────────────┬───────────────┘
                                                │ Blueprint JSON (validado)
                                                ▼
                                 ┌──────────────────────────────┐
                                 │  Criador (frontend)          │
                                 │  carrega no RASCUNHO         │
                                 │  (useFormBuilder +           │
                                 │   usePhasesDraft), mostra    │
                                 │  diferenças no mapa          │
                                 └──────────────┬───────────────┘
                                                │ pessoa revisa / ajusta / pede mais
                                                ▼
                                   "Salvar" → gravação atômica → publicar (manual)
```

Dois modos de uso:

1. **Gerar do zero** — "Processo de pedido de compra: solicitante informa itens e centro de custo;
   compras cota; acima de R$ 10 mil o diretor aprova; financeiro paga." → blueprint completo.
2. **Editar por conversa** — "Coloca aprovação do gerente da área na fase Cotação", "Se o tipo for
   Serviço, pula a seção de itens". Aqui a IA devolve **operações** (patch) sobre o blueprint
   atual, não um processo novo — menos risco de apagar o que a pessoa já ajustou.

Regras de ouro:

- A IA **nunca publica** e nunca grava sem a pessoa clicar em Salvar.
- A IA **nunca cria perfil, usuário ou área sozinha**: se precisar de um perfil que não existe, o
  blueprint traz isso como *pendência* para a pessoa resolver.
- A IA **não lê respostas/solicitações** de ninguém: só a estrutura (metadados). Isso simplifica
  LGPD e custo.

---

## 4. O que preparar no sistema

### 4.1 Blueprint do Processo (contrato único) — **fundação**

Um tipo único, versionado (`schemaVersion`), que descreve tudo por **chaves legíveis** em vez de
UUIDs: seções por `key`, campos por `code`, fases por `key`, perfis por `roleCode`, áreas por nome
ou código. Exemplo enxuto:

```json
{
  "schemaVersion": 1,
  "process": { "name": "Pedido de Compra", "area": "Compras", "description": "..." },
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
          { "code": "valor_total", "label": "Valor total", "type": "currency", "required": true }
        ],
        "next": { "branches": [ { "when": { "field": "tipo", "equals": "servico" }, "goTo": "escopo" } ],
                  "default": "itens" }
      },
      { "key": "itens",  "title": "Itens",  "fields": [ ... ], "next": { "default": "submit" } },
      { "key": "escopo", "title": "Escopo", "fields": [ ... ], "next": { "default": "submit" } }
    ]
  },
  "phases": [
    { "key": "triagem", "label": "Triagem", "actors": { "roles": ["compras"] }, "slaHours": 8 },
    { "key": "aprovacao", "label": "Aprovação",
      "approval": { "approvers": { "roles": ["gerente_area", "diretor"] }, "mode": "sequential" },
      "fields": [ { "code": "parecer", "label": "Parecer", "type": "long_text", "required": true } ] },
    { "key": "concluido", "label": "Concluído", "terminal": true }
  ],
  "rules": [
    { "when": { "event": "submitted", "field": "valor_total", "gt": 10000 },
      "then": [ { "require_approval": { "roles": ["diretor"] } } ] }
  ],
  "pending": [ "Perfil 'diretor' não existe — criar ou escolher outro." ]
}
```

O que construir:

- **Schema único** (recomendo Zod ou JSON Schema gerado a partir das classes) que sirva para: o
  backend validar, o LLM receber como *structured output* e o frontend tipar o rascunho.
- **Mapeadores** `blueprint → CreateFormDto + SaveKanbanPhasesDto + flows` e o inverso
  `processo atual → blueprint` (necessário para o modo "editar por conversa").
- Endpoints novos:
  - `GET  /process-blueprints/:formId` — exporta o processo atual.
  - `POST /process-blueprints/validate` — devolve lista de erros/avisos com caminho
    (`form.sections[1].next.branches[0].when.field: campo 'tipo2' não existe`).
  - `POST /process-blueprints/apply` (com `dryRun`) — grava tudo **numa transação**.

### 4.2 Validador estrito

O validador é o que permite o laço "IA gera → valida → corrige sozinha" antes de chegar à pessoa.
Deve cobrar o que hoje passa em silêncio ou só estoura no publicar:

- códigos de campo únicos (no form **e** entre form e fases, porque fórmulas e `cardValueField`
  misturam os dois escopos);
- toda referência existe (campo de ramificação, opção, seção destino, fase, perfil, área, lista);
- ramificação só sobre tipos que suportam (select/checkbox — ou o que for liberado em 4.5);
- seções alcançáveis e sem ciclo infinito; ao menos um caminho até "enviar";
- fórmula de campo calculado parseia (`common/formula/formula.engine.ts`) e só usa campos
  existentes e numéricos;
- fase com `requiresApproval` tem aprovadores; `sequential` tem `order` coerente;
- pelo menos uma fase terminal; fase terminal não exige aprovação;
- tipos proibidos em fase (`erp_lookup`, `erp_table`).

Parte disso já está espalhada no front e no `FormAggregate`; o ideal é concentrar no backend e
reaproveitar no front.

### 4.3 Gravação atômica

Hoje: `PATCH /forms/:id` e depois `PUT /forms/:id/kanban-phases`, separados. Para aplicar um
blueprint, um serviço único que abra **uma transação** e chame `FormVersionWriter` +
`KanbanPhasesService` + criação de fluxos com o mesmo `EntityManager`. O "Salvar" do Criador pode
passar a usar o mesmo endpoint (resolve também o risco de meio-processo gravado que existe hoje).

### 4.4 Tipar o que hoje é `Record<string, unknown>`

Sem isso o modelo inventa chaves. Prioridade:

1. `settingsJson` de campo como **união discriminada por `fieldType`** (fórmula + casas decimais
   para `calculated`; `productTableColumns` para `product_table`; `maxFiles`/`allowedMimeTypes`/
   `maxSizeInBytes` para `file_upload`; `minDate`/`maxDate`; `min`/`max`/`displayAs` para escala;
   config do ERP; `dependsOn` para listas encadeadas…).
2. `visibilityRules` / `conditionsJson`.
3. `data` dos nós de fluxo que a IA vai usar (ver 4.7) — não precisa tipar os 35 de uma vez.

### 4.5 Fechar lacunas de regra de negócio

Decisões de produto que a IA vai esbarrar logo no primeiro processo real:

| Lacuna | Hoje | Proposta |
|---|---|---|
| Para onde o card pode ir | Livre, qualquer fase | `allowedNext: [phaseKey]` por fase (opcional; vazio = livre, mantém compatibilidade) |
| Reprovação | Aprovação de fase reprovada deixa o card preso na fase | `onReject: { goTo: phaseKey } \| "reject"` por fase |
| Aprovação condicional | Só via fluxo | Condição na aprovação da fase (`when: valor_total > 10000`) **ou** a IA gera o fluxo equivalente |
| Ramificação de seção por valor | Só opção/checkbox | Aceitar as mesmas condições de `visibilityRules` (`greater_than`, `less_than`, `equals`…) |
| Duas formas de condição de campo | `show_if` e `visibilityRules` | Eleger `visibilityRules` como canônica no blueprint; converter o legado na leitura |
| Obrigatórios de fase ao mover | Não cobrados no `movePhase` | Cobrar ao sair da fase (opcional por fase) |
| Ramificação em formulário de fase | Não existe | Pendência do protótipo — decidir antes de a IA gerar fases com seções condicionais |

Nenhuma é obrigatória para começar (a IA pode gerar só o que o sistema já suporta), mas
"processo ponta a ponta com regras" depende das três primeiras.

### 4.6 Catálogo de contexto (o que a IA precisa enxergar)

Endpoint(s) de leitura, filtrados pela permissão de quem pede, devolvendo **só metadados**:

- perfis (`code`, nome, descrição do que faz) — a IA deve preferir **perfil a usuário**;
- áreas; usuários só por busca pontual (nome → id), nunca a lista inteira;
- listas de itens (`item-lists`) e listas/tabelas do ERP disponíveis;
- tipos de campo com descrição de uso e exemplos de `settingsJson`;
- tipos de nó de fluxo liberados para a IA;
- processos existentes como **exemplos** (exportados em blueprint) — "faça parecido com o de
  Cancelamento de Pedido".

Vale melhorar a descrição dos perfis no cadastro: é o que a IA usa para decidir "quem aprova".

### 4.7 Camada de IA no backend

Módulo novo (ex.: `modules/process-copilot/`):

- **Provedor atrás de uma interface** (`generateStructured`, `chatWithTools`). Duas opções:
  - **LOPS IA**, se a API dela suportar *tool calling* e saída estruturada por JSON Schema —
    precisa confirmar; hoje o sistema só usa `/models` e a execução simples do nó.
  - **API de um LLM comercial chamada do backend** (ex.: Claude), que suporta as duas coisas
    nativamente. A chave fica no `.env` do backend, como já é feito com `LOPS_AI_*`.
- **Ferramentas** que o modelo pode chamar (todas só leitura, exceto a última, que só mexe no
  rascunho da conversa):

  | Ferramenta | Faz |
  |---|---|
  | `catalog.roles / areas / itemLists / erpLists / fieldTypes` | Contexto (4.6) |
  | `users.search(nome)` | Resolve uma pessoa citada pelo nome |
  | `process.get(formId)` | Blueprint atual (modo edição) |
  | `process.examples(tema)` | Processos parecidos como referência |
  | `blueprint.validate(json)` | Validador de 4.2 — o modelo itera até zerar erros |
  | `blueprint.propose(json \| ops)` | Entrega a proposta ao front (não grava) |

- Conversa guardada por sessão do Criador (tabela simples `copilot_sessions` com mensagens e o
  último blueprint), para a pessoa continuar depois e para auditoria.
- Fila: geração pode levar dezenas de segundos. Usar SSE/streaming para o front ou o
  `queue` (RabbitMQ) que já existe com polling.

### 4.8 Frontend (Criador)

- Painel lateral "Assistente" no Criador (aba Processo), com conversa e botão
  **"Aplicar ao rascunho"**.
- Aplicar = carregar o blueprint em `useFormBuilder` + `usePhasesDraft` — o Salvar continua o
  mesmo. Nada novo para gravar no front.
- **Mostrar o que mudou**: no mapa (`ProcessMapView`/`ProcessChainCanvas`) destacar fases e seções
  novas/alteradas/removidas; lista de pendências (`pending`) com link para resolver.
- Entrada também pela lista de Processos: "Novo processo com IA".
- Desfazer: guardar o rascunho anterior à aplicação.

### 4.9 Governança

- Permissão nova `ai.copilot.use` (catálogo em `common/constants/permission-catalog.ts`), além de
  exigir `forms.create`/`forms.edit` e `kanban_phases.manage` para aplicar.
- Auditoria (`modules/audit`): registrar pedido, blueprint proposto e o que foi aplicado.
- Limite de uso por usuário/dia e teto de tokens por conversa (custo previsível).
- LGPD: só estrutura vai para o provedor; se aceitar anexo (POP em PDF), avisar que o conteúdo do
  arquivo é enviado.
- Injeção de instrução: texto de documentos anexados é dado, não ordem — e, como a IA só propõe e
  nunca grava, o estrago máximo é uma proposta ruim que a pessoa recusa.

### 4.10 Avaliação

- Conjunto de casos reais como "gabarito": Pedido de Compra, Pedido de Cancelamento, Datar
  Embalagens, Suporte de TI — descrição em texto → blueprint esperado.
- Métricas automáticas: % de blueprints válidos de primeira, nº de iterações até validar,
  pendências geradas, diferença para o gabarito.
- Teste de ponta a ponta do blueprint aplicado: criar solicitação de teste e caminhar pelas fases
  (o motor de fluxos já tem `run-flow-test`; falta o equivalente para "simular processo").

---

## 5. Roteiro sugerido

| Etapa | Entrega | Depende de IA? | Tamanho |
|---|---|---|---|
| 0. Fundação | Blueprint + validador + export/import + `apply` atômico (Salvar do Criador passa a usá-lo) | Não | G |
| 1. Tipagem | `settingsJson` e condições tipados; `visibilityRules` canônica | Não | M |
| 2. Copiloto de formulário | Gera/edita seções, campos e ramificação no rascunho | Sim | M |
| 3. Copiloto de processo | Fases, quem atua/aprova, regra de aprovação, visibilidade, SLA, campos de fase | Sim | M |
| 4. Regras | Lacunas de 4.5 no motor (`allowedNext`, `onReject`, aprovação condicional) + IA gerando fluxos para o resto | Parcial | G |
| 5. Revisor e simulação | IA aponta problemas num processo existente; simulação de uma solicitação pelas fases | Sim | M |

A etapa 0 sozinha já resolve uma dor real: levar processos para produção (onde hoje tudo é
montado à mão) via exportar/importar blueprint.

---

## 6. Decisões (tomadas em 2026-10-15)

1. **Provedor**: LOPS IA, que já chama ferramentas. A conversa acontece na plataforma dela e o
   Tijuca Flow expõe uma API, com um endpoint único que cria o processo inteiro.
2. **Regras**: tudo como **fluxo**. Isso exige ajustes no motor (evento de mudança de fase, voltar
   de fase após reprovação, entre outros).
3. **Ramificação em formulário de fase**: entra **antes** da IA.
4. **Documentos anexos**: já na primeira versão (lidos na LOPS IA).
5. **Quem usa**: quem entra na LOPS IA com a conta do Workspace e tem usuário ativo no Tijuca Flow
   com o mesmo e-mail; conexão protegida por chave compartilhada + token de sessão.

O desenho resultante está em [ia_lops_integracao_api.md](ia_lops_integracao_api.md), que
**substitui** as seções 3, 4.7 e 4.8 deste documento (não há mais painel dentro do Criador).

---

## 7. Riscos

- **Proposta plausível, mas errada** (aprovador errado, campo faltando): mitigado por rascunho +
  diferenças no mapa + pendências explícitas; nunca publicar sozinha.
- **Contrato muda e o blueprint quebra**: `schemaVersion` + testes de ida e volta
  (processo → blueprint → processo idêntico).
- **Custo/latência**: processos grandes geram respostas longas; o modo "operações" na edição e
  limites por usuário seguram isso.
- **Protótipo ainda mudando**: a etapa 0 deve acompanhar as decisões da branch
  `prototipo/processos` (form por fase, integrações dentro da fase) — se o modelo de fases mudar,
  o blueprint muda junto.
