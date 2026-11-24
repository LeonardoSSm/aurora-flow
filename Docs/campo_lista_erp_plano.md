# Campo "Lista do ERP" — plano de implementação

Data: 2026-10-07 · Status: **Fases 1 (API e Docker), 2 (backend, incluindo o 2.5) e 3 (web) prontas.**
Nenhuma lista real ainda. Fases 4 (app) e 5 (deploy) não começaram.

## Objetivo

Nos formulários, um campo onde o usuário **pesquisa** ou **escolhe de uma lista** opções que vêm do
banco do ERP (MySQL). A escolha fica gravada na resposta, aparece nas telas de solicitação, aprovação
e exportação, e fica disponível para os fluxos.

## Arquitetura

```
Formulário (web / app)  →  Backend do Tijuca  →  API erp-lookup (nova)  →  MySQL do ERP
  campo "Lista do ERP"      confere o campo,        consultas fixas,          usuário só de leitura,
                            repassa a busca,        em Docker                 de preferência em views
                            valida no envio
```

- **API separada `erp-lookup`, em Docker, no mesmo padrão do backend**: Node 20 alpine, build em 2
  estágios, serviço no `docker-compose.yml` com `profiles: [app]`, rede `formhub-network`,
  healthcheck por `wget` e limite de memória. Container: **`tijucaflow-erp-lookup`**.
- **O navegador e o app nunca falam com a API nem com o banco.** Sempre passam pelo backend do Tijuca,
  que só consulta a lista configurada no campo. O cliente nunca escolhe conector, lista ou SQL.
- **A API é cadastrada no Tijuca como um Conector de ERP** (Administração → ERP). Isso reaproveita o
  que já existe: URL, token criptografado, tempo limite, "Testar conexão" e a proteção que só aceita
  endereços internos ([erp-url-guard.ts](../backend/src/modules/integrations/erp/erp-url-guard.ts)).
  Nenhuma tabela nova.
- **Formato único de resposta para todas as listas.** Lista nova = arquivo novo na API, sem mudar o Tijuca.

## Decisões (2026-10-07)

| # | Assunto | Decisão |
|---|---|---|
| 1 | Qual ERP | **Não é o Protheus.** Nada de regra específica de ERP no plano: as regras de cada lista são definidas lista a lista |
| 2 | Listas | **Uma lista por enquanto.** O dono do projeto já sabe quais dados ela deve retornar. **Antes de criar qualquer lista, perguntar a ele** (ver "Como definir uma lista") |
| 3 | Exigir login para pesquisar | **Opção por campo, desligada por padrão**, para testar como funciona |
| 4 | Banco do ERP fora do ar no envio | **Bloquear o envio e mostrar um popup** avisando que o banco está fora |
| 5 | Banco | **MySQL, na mesma rede** do servidor do Tijuca. A conexão já funciona |
| 6 | Nome do container | **`tijucaflow-erp-lookup`** (não `formhub-…`) |

---

## Fase 0 — Pré-requisitos no MySQL

1. **Usuário só de leitura**, com acesso **apenas a views** num banco separado. As views isolam a API
   das regras do ERP (registro inativo, empresa, filial). Se o ERP mudar, só a view muda.
2. **Token** compartilhado entre o Tijuca e a API: `openssl rand -hex 32`.

Modelo (as colunas reais saem da conversa da seção "Como definir uma lista"):

```sql
CREATE DATABASE tijuca_lookup;

-- Uma view por lista. As colunas value/label/busca são o contrato com a API.
CREATE VIEW tijuca_lookup.vw_<lista> AS
SELECT <coluna_codigo>                              AS value,
       <coluna_nome>                                AS label,
       CONCAT_WS(' ', <coluna_codigo>, <coluna_nome>, <outras_colunas_pesquisaveis>) AS busca
FROM <banco_do_erp>.<tabela>
WHERE <filtros: só ativos, empresa etc.>;

-- Restringir o host ao IP do servidor onde roda o Docker do Tijuca.
CREATE USER 'tijuca_lookup'@'<ip-do-servidor-tijuca>' IDENTIFIED BY '<senha forte>';
GRANT SELECT ON tijuca_lookup.* TO 'tijuca_lookup'@'<ip-do-servidor-tijuca>';
```

Por padrão a view roda com as permissões de quem a criou (`SQL SECURITY DEFINER`). Por isso o usuário
`tijuca_lookup` só precisa de acesso ao banco `tijuca_lookup`, e não às tabelas do ERP.

Se não der para criar views no servidor do ERP, a alternativa é liberar só as colunas necessárias:
`GRANT SELECT (col1, col2) ON <banco_do_erp>.<tabela> TO ...`. Nesse caso os filtros ficam no SQL da API.

---

## Listas criadas

**`pedidos` — Pedidos de venda** (definida em 2026-10-07,
[`erp-lookup/src/fontes/pedidos.fonte.ts`](../erp-lookup/src/fontes/pedidos.fonte.ts)). Consulta direto
nas tabelas, sem view: `ve_pedidos` + `clientes` + `empresas` por `LEFT JOIN`.

- **Modo pesquisa pelo número exato do pedido.** São 3,2 milhões de pedidos e só a chave primária
  responde na hora. Texto que não é número dá "nenhum resultado" sem ir ao banco.
- **Texto exibido:** `Pedido 123 — cliente (fantasia ou razão social) — empresa — saída dd/mm/aaaa`,
  com `— CANCELADO` no fim quando for o caso. Cancelados aparecem (decisão do dono do projeto).
- **Ficha do pedido** (2026-10-08, `GET /fontes/pedidos/detalhes?value=`, montada em
  [`pedidos.detalhes.ts`](../erp-lookup/src/fontes/pedidos.detalhes.ts)): aparece no formulário: em tela
  larga (≥ 1280 px) num painel que abre à direita enquanto o formulário (720 px) desliza para a
  esquerda; em tela estreita, logo abaixo do pedido escolhido. Tem alertas (cancelado, cliente desativado, sincronismo TOTVS pendente,
  total de item diferente de qtde × unitário), resumo, tabelas de itens, romaneios e descontos de
  quebra/mortes, e seções de cliente, valores, pedido, datas, comercial, entrega, nota fiscal, avarias,
  observações e empresa emitente. O campo continua guardando só o pedido (código + texto).
  - Vem de **quatro consultas pela chave do pedido** (cabeçalho, itens, romaneios, descontos). A
    consulta única com romaneios e descontos agrupados em subconsultas faz o MySQL agrupar a tabela
    inteira de romaneios (2,2 mi de linhas) a cada pedido; separadas, a ficha sai em ~60 ms.
  - Os códigos (situação, tipo de venda, envio da NF-e, sincronismo, tipo de avaria...) viram texto
    pelos comentários das colunas no ERP. Código sem significado documentado aparece como "código N";
    `analiseAvaria = 2` (a maioria dos pedidos) some. `financeiro_desconto_quebra.descontoSituacao` e
    `status` aparecem como número: o comentário só documenta 1–4, mas há valores até 16 (talvez ids de
    `motivos_avarias` — não confirmado).
  - `clientes.cidade` é o código IBGE (nome por `tab_municipios`). Textos livres do ERP vêm com
    entidades HTML (`n&atilde;o`) e são decodificados.
  - Quem vê a ficha: a mesma regra da pesquisa (`exigirLogin` do campo) — decisão do dono do projeto.
    Sem login exigido, qualquer pessoa com o link do formulário vê cliente, documento, contatos e
    valores do pedido que digitar.
- **Datas "vazias" do ERP:** o ERP grava data vazia como `0000-00-00`, inclusive em
  `datahoraCancelamento`, que é `NOT NULL`. Num `SELECT`, `IS NOT NULL` dá verdadeiro para essa data
  zero (o `IS NULL` no `WHERE` é que casa com ela, peculiaridade do MySQL). Por isso a lista testa
  `> '1000-01-01'`. Cancelado = tem data real de cancelamento; todos esses estão com `status = 2`, e há
  3 pedidos recentes com `status = 2` sem data, que não aparecem como cancelados.
- No construtor, sugestão de configuração: mínimo de **2** caracteres e texto de ajuda "Digite o
  número do pedido".

## Como definir uma lista (perguntar antes de criar cada uma)

Antes de escrever qualquer lista, perguntar ao dono do projeto:

1. De qual **tabela** (ou tabelas, se tiver junção) vêm os dados?
2. Qual coluna é o **código** (`value`), que os fluxos e o ERP usam? É composto de mais de uma coluna?
3. O que o usuário deve **ver** em cada opção (`label`)? Ex.: "nome — documento".
4. Por quais colunas dá para **pesquisar**?
5. Quais **filtros** sempre se aplicam (só ativos, empresa, filial etc.)?
6. **Ordem** dos resultados.
7. Mais ou menos **quantas linhas** a tabela tem. Isso define o modo: até umas 200 linhas → modo
   **lista**; mais que isso → modo **pesquisa**.

---

## Fase 1 — API `erp-lookup`

> **Feito em 2026-10-07** — código em [`erp-lookup/`](../erp-lookup) (ver o
> [README](../erp-lookup/README.md)). Diferenças em relação ao que estava planejado:
>
> - **Configuração pelo `.env` da raiz** (variáveis `ERP_LOOKUP_*`), repassadas pelo compose, em vez
>   de `env_file: ./erp-lookup/.env`. Com `env_file`, o arquivo faltando quebraria o
>   `docker compose --profile app up` inteiro, backend incluso.
> - **Sobe "não configurada"** quando falta banco ou token: `/health` responde
>   `db: "nao_configurado"`, as consultas respondem 503 e o container não fica reiniciando.
> - **Lista `exemplo` só para desenvolvimento**, ligada por `ERP_LOOKUP_FONTE_EXEMPLO=true`. Ela lê
>   a view de `dev/seed.sql` e não existe no ERP real. Nenhuma lista real foi criada.
> - Códigos de erro da API: `BANCO_INDISPONIVEL` e `BANCO_NAO_CONFIGURADO` (os dois com 503). É o
>   backend do Tijuca (Fase 2) que vai traduzi-los no `ERP_INDISPONIVEL` do popup.
> - Verificado: 27 testes unitários, 11 de integração contra o MySQL local (acentos, `%`/`_`
>   literais, filtro da view, timeout, usuário sem acesso às tabelas), e no Docker: chamada pela rede
>   em `http://erp-lookup:3100`, 401 sem token, MySQL parado → 503, e volta sozinha quando o MySQL
>   volta. Container sem root, 32 MB de memória.

**Stack:** NestJS + TypeScript + [`mysql2`](https://www.npmjs.com/package/mysql2) (versão com
promises, pool de conexões). É a mesma stack do backend: mesmo jeito de validar env, logar e testar.

**Estrutura** (pasta nova na raiz, ao lado de `mock-erp/`):

```
erp-lookup/
  Dockerfile              ← mesmo padrão de backend/Dockerfile (2 estágios, node:20-alpine)
  .env.example
  package.json
  src/
    main.ts
    app.module.ts
    config/env.validation.ts
    db/mysql.service.ts     ← um pool só (connectionLimit 10), tempo limite por consulta
    auth/token.guard.ts     ← Bearer, comparado com crypto.timingSafeEqual
    fontes/
      fonte.types.ts        ← interface Fonte { id, label, modo, pesquisar(q, limit), resolver(value) }
      <lista>.fonte.ts      ← a primeira lista, definida com o dono do projeto
      registry.ts
    lookup.controller.ts
  dev/
    seed.sql                ← tabela e view falsas para o MySQL local
```

**Endpoints:**

| Método | Caminho | Auth | Retorno |
|---|---|---|---|
| GET | `/health` | não | `{ status, db }`, usado pelo healthcheck do Docker |
| GET | `/` | não | `{ status: "ok" }`. O "Testar conexão" do conector chama a raiz da URL |
| GET | `/fontes` | Bearer | `[{ id, label, modo }]`, para o construtor de formulário |
| GET | `/fontes/:fonte?q=texto&limit=20` | Bearer | `{ items: [{ value, label }] }` |
| GET | `/fontes/:fonte/item?value=123` | Bearer | `{ value, label }` ou 404 se não existe mais |
| GET | `/fontes/:fonte/detalhes?value=123` | Bearer | Ficha pronta para exibir (`titulo`, `alertas`, `resumo`, `secoes`, `tabelas`); 404 `ITEM_NAO_ENCONTRADO` ou `SEM_DETALHES` (lista sem ficha) |

O `value` vai na query string porque códigos do ERP podem ter caracteres especiais.

**Regras:**

- SQL **só com parâmetros** (`pool.execute(sql, [params])`). Nunca concatenar texto do usuário.
- Escapar os curingas do `LIKE` vindos do usuário (`\`, `%`, `_`) antes de montar o padrão.
- `limit` padrão 20, máximo 50, validado como inteiro. Com `execute`, o `mysql2` tem problema conhecido
  com `LIMIT ?`: usar o número já validado no SQL, ou passá-lo como string.
- No modo pesquisa, `q` com no mínimo 2 caracteres.
- Tempo limite de 5s por consulta, com o hint `SELECT /*+ MAX_EXECUTION_TIME(5000) */` (MySQL 5.7.8+;
  se for MariaDB, usar `max_statement_time`) mais o `timeout` do `mysql2`. Pool pequeno: o banco é do
  ERP e não pode ser sobrecarregado.
- Leitura não trava o ERP: `SELECT` simples no InnoDB não bloqueia nada.
- Acentos e maiúsculas: na collation padrão do MySQL 8 (`utf8mb4_0900_ai_ci`), "joao" encontra "João".
  Conferir a collation das tabelas do ERP.
- Devolver **só** `value` e `label`, nunca outras colunas.
- Log por consulta com fonte, duração e quantidade de linhas. Não logar o texto pesquisado.

**Docker** (`docker-compose.yml`):

```yaml
  erp-lookup:
    build:
      context: ./erp-lookup
      dockerfile: Dockerfile
    container_name: tijucaflow-erp-lookup
    restart: unless-stopped
    profiles: [app]
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3100
      LOOKUP_API_TOKEN: ${ERP_LOOKUP_API_TOKEN:-}
      ERP_DB_HOST: ${ERP_LOOKUP_DB_HOST:-}
      # ... demais ERP_LOOKUP_* (ver docker-compose.yml)
    expose:
      - "3100"          # sem "ports": só o backend, na mesma rede, enxerga a API
    networks:
      - formhub-network
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3100/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
    deploy:
      resources:
        limits:
          memory: 128m
```

O backend chega nela por `http://erp-lookup:3100`. Um nome sem ponto passa direto pela proteção de URL
interna ([erp-url-guard.ts:44](../backend/src/modules/integrations/erp/erp-url-guard.ts)).

**Variáveis** (no Docker vêm do `.env` da raiz com prefixo `ERP_LOOKUP_`, ex.:
`ERP_LOOKUP_DB_HOST`; `erp-lookup/.env.example` serve para rodar fora do Docker):

```
PORT=3100
LOOKUP_API_TOKEN=            # mesmo valor cadastrado no conector do Tijuca
ERP_DB_HOST=                 # IP/host do MySQL do ERP na rede
ERP_DB_PORT=3306
ERP_DB_NAME=tijuca_lookup
ERP_DB_USER=tijuca_lookup
ERP_DB_PASSWORD=
ERP_DB_CONNECTION_LIMIT=10
ERP_DB_QUERY_TIMEOUT_MS=5000
```

**Desenvolvimento local sem tocar no ERP real:** um MySQL em container, num profile próprio. Na
primeira subida, o MySQL roda sozinho os arquivos de `/docker-entrypoint-initdb.d`.

```yaml
  erp-mysql-dev:
    image: mysql:8.4
    container_name: tijucaflow-erp-mysql-dev
    profiles: [erp-dev]
    environment:
      MYSQL_ROOT_PASSWORD: ${ERP_DEV_ROOT_PASSWORD:-tijuca-dev}
    ports:
      - "3307:3306"     # 3307 para não brigar com um MySQL que já exista na máquina
    volumes:
      - ./erp-lookup/dev:/docker-entrypoint-initdb.d:ro
    networks:
      - formhub-network
    deploy:
      resources:
        limits:
          memory: 768m
```

Subir com `docker compose --profile erp-dev up -d erp-mysql-dev`. O `seed.sql` cria uma tabela falsa
`erp_demo.itens_exemplo` (com itens inativos e com `%`/`_` no nome, para testar filtros e escape), a
view `tijuca_lookup.vw_exemplo` e o usuário `tijuca_lookup`, que só enxerga as views. Quando a primeira
lista real for definida, o seed ganha uma cópia mínima da tabela dela.

**Testes:**

- Unitários: escape do `LIKE`, guard do token, limites de `q` e `limit`, registry de fontes.
- Integração contra o MySQL do profile `erp-dev`: pesquisa, resolver, item inexistente → 404, e
  registros filtrados (inativos etc.) que não aparecem.

---

## Fase 2 — Backend do Tijuca

> **Feito em 2026-10-07.** Código novo em
> [`backend/src/modules/integrations/erp/lookup/`](../backend/src/modules/integrations/erp/lookup).
> Diferenças e decisões em relação ao planejado:
>
> - **2.5 feito depois do nó de notificação**, no mesmo dia: os 7 pontos de `modules/flows/` passaram a
>   usar o helper `buildFlowFieldValues` (`flows/lib/flow-field-values.ts`), que acrescenta
>   `<campo>_codigo` quando a resposta tem o formato gravado pela Lista do ERP. O editor de fluxos (painel
>   de variáveis e nó de notificação) lista `{{campo_codigo}}` para esses campos
>   (`frontend/src/modules/flows/lib/field-variables.ts`).
> - **Configuração validada só na publicação**, não no salvamento: o rascunho pode ter o campo ainda sem
>   conector ou lista enquanto é montado.
> - **API erp-lookup**: a raiz `GET /` passou a exigir o token. Assim o "Testar conexão" do conector
>   acusa token errado em vez de só "chegou no host". Os 404 ganharam `code` (`ITEM_NAO_ENCONTRADO` ou
>   `LISTA_NAO_EXISTE`): o backend só trata como "opção não existe" o primeiro; o segundo é configuração
>   errada e vira "ERP indisponível".
> - **Log sem o texto pesquisado.** O log de requisições (pino-http) gravava a URL inteira, com `?q=...`.
>   Nas pesquisas da "Lista do ERP" o `q` agora sai como `***` (`erp-lookup.log.ts`, ligado no `app.module.ts`).
> - **Token inválido com `exigirLogin`** conta como anônimo (401 "Entre na sua conta…"), nunca 500.
> - **Resolver em cache por 1 min**: o mesmo código conferido há menos de 1 min passa mesmo com o ERP
>   caindo nesse intervalo. É aceitável: o código acabou de ser confirmado.
> - Verificado: 39 testes novos do módulo + specs de envio e validação ajustados. Roteiro ponta a ponta
>   com backend isolado (Postgres descartável), API erp-lookup e MySQL de dev, 32 checagens: conector e
>   "Testar conexão", publicação bloqueada sem lista, formulário público sem conector/lista, pesquisa
>   (mínimo de caracteres, acento, inativo, 404, 400), envio gravando o nome do ERP e não o forjado,
>   código inativo → 422, MySQL fora → 503 `ERP_INDISPONIVEL` sem gravar nada, volta sozinho,
>   `exigirLogin` e conector desativado.

### 2.1 Tipo de campo `erp_lookup`

- Adicionar em [form-field-type.enum.ts](../backend/src/common/enums/form-field-type.enum.ts).
  `field_type` é `varchar(30)` nas três tabelas, então **não precisa de migration**. O `FieldTypeVO`
  e os DTOs de formulário passam a aceitar o tipo sozinhos (usam `Object.values(FormFieldType)`).
- No v1, **tirar o tipo** das listas de campos de fase e de perguntas padrão
  ([save-kanban-phases.dto.ts:16](../backend/src/modules/kanban-phases/dto/save-kanban-phases.dto.ts),
  [save-standard-questions.dto.ts:16](../backend/src/modules/standard-questions/dto/save-standard-questions.dto.ts)).
- Configuração do campo em `settingsJson`:

  ```json
  {
    "erpConnectorId": "uuid-do-conector",
    "fonte": "<id-da-lista>",
    "modo": "pesquisa",
    "minCaracteres": 3,
    "exigirLogin": false,
    "placeholder": "Digite para pesquisar"
  }
  ```

  `modo` pode ser `"lista"` (carrega tudo ao abrir, para listas curtas) ou `"pesquisa"` (busca
  enquanto digita). **`exigirLogin` começa desligado** (decisão 3). Ao salvar ou publicar o
  formulário, validar que o conector existe e está ativo e que `fonte` foi preenchida.

### 2.2 `ErpLookupService`

Novo, em `backend/src/modules/integrations/erp/lookup/`:

- `listarFontes(connectorId)`, `pesquisar(connectorId, fonte, q)`, `resolver(connectorId, fonte, value)`.
- Usa do conector: `baseUrl`, token descriptografado (`decryptToken`) e `validateInternalUrl`. Tempo
  limite de no máximo 5s nas buscas.
- Cache em memória: modo lista por 5 min, `resolver` por 1 min.
- 404 da API → `null`. Timeout, 5xx ou API sem conexão com o MySQL → erro próprio `ErpIndisponivelError`.

### 2.3 Endpoints

| Método | Caminho | Acesso | Para quê |
|---|---|---|---|
| GET | `/public/forms/:id/fields/:fieldCode/lookup?q=` | público, com login opcional, 60/min por IP | Busca do campo durante o preenchimento |
| GET | `/erp/lookup/connectors` | JWT + `forms.edit` | Conectores ativos (só id e nome, sem URL nem token) para o construtor |
| GET | `/erp/lookup/connectors/:id/fontes` | JWT + `forms.edit` | Listas disponíveis no conector, para o construtor |

O endpoint público fica em
[public-forms.controller.ts](../backend/src/modules/forms/public-forms.controller.ts) e:

1. carrega a **versão publicada**;
2. exige que `fieldCode` seja um campo `erp_lookup` dessa versão (senão 404);
3. lê conector e fonte **das configurações do campo**;
4. se `exigirLogin` estiver ligado e não houver token válido → 401;
5. aplica `minCaracteres` e o limite de 20 itens;
6. devolve `{ items: [{ value, label }] }`.

Precisa de um `OptionalJwtAuthGuard` novo, ao lado de
[jwt-auth.guard.ts](../backend/src/modules/auth/guards/jwt-auth.guard.ts): preenche `req.user` quando
o token é válido e não bloqueia quando não há token.

### 2.4 Envio da resposta (validação e registro do que o usuário viu)

- O cliente envia `valueJson: { value: "<código>" }`.
- `validateSubmissionPayload` ([responses.service.ts](../backend/src/modules/responses/responses.service.ts))
  e `normalizeAnswer`/`validateRules`
  ([form-submission.validator.ts](../backend/src/modules/responses/form-submission.validator.ts))
  ganham um ramo para o tipo novo: `valueJson.value` precisa ser texto de até 100 caracteres.
  `comparableValue` = o código.
- **Passo novo e assíncrono em `ResponsesService.submit`**, entre a validação (linha 230) e a
  transação. O validador atual é síncrono, por isso o passo fica aqui. Para cada campo `erp_lookup`,
  chamar `resolver`:
  - item não existe → erro no campo: "Opção não encontrada no ERP. Pesquise de novo.";
  - **banco do ERP fora do ar → bloqueia o envio** (decisão 4) com HTTP 503 e um corpo que a web e o
    app reconhecem para abrir o popup:
    ```json
    { "statusCode": 503, "code": "ERP_INDISPONIVEL",
      "message": "O banco de dados do ERP está fora do ar no momento. Suas respostas não foram perdidas: tente enviar novamente em alguns minutos." }
    ```
  - **nunca** chamar o ERP dentro da transação do banco.
- O que fica gravado vem do ERP, não do cliente:
  - `valueText` = **label** (o texto que o usuário viu);
  - `valueJson` = `{ value, label, fonte, resolvidoEm }`.

**Por que o label vai em `valueText`:** todas as telas já mostram `valueText` primeiro. É o caso da web,
das exportações, da página de aprovação por link
([external-approvals.service.ts:67](../backend/src/modules/approvals/external/external-approvals.service.ts)),
do detalhe de aprovação no app
([ApprovalDetailScreen.tsx:509](../mobile/src/screens/ApprovalDetailScreen.tsx)) e do `{{campo}}` em
e-mail e WhatsApp. Todos passam a mostrar o nome certo sem mudança, até no app antigo.

### 2.5 Fluxos

- `{{campo}}` passa a mostrar o label.
- Para usar o **código** (ex.: mandar para o ERP no `action_erp_operation`), expor `{{campo_codigo}}`.
  Hoje o mapa de campos do fluxo é montado copiado em 7 lugares
  (`flows.service.ts:752`, `flow-execution.engine.ts:435`, `flows-approval.listener.ts:178`,
  `flows-attachment.listener.ts:162`, `flows-phase-fields.listener.ts:169`, `flows-sla.listener.ts:108`,
  `flows-solicitation.listener.ts:141`). Juntar num helper único e adicionar o `_codigo` nele.
- `condition_field_value` compara pelo label no v1. Comparar pelo código fica para depois.

### 2.6 Testes do backend

- `ErpLookupService` com axios mockado: sucesso, 404 → `null`, timeout → `ErpIndisponivelError`, cache.
- Endpoint público: campo de outro tipo → 404, `minCaracteres`, `exigirLogin` desligado → 200 sem token,
  `exigirLogin` ligado sem token → 401.
- `submit`: `resolver` chamado; código inexistente → erro no campo; ERP fora → 503 com
  `code: "ERP_INDISPONIVEL"` e nada gravado; label gravado é o do ERP, mesmo que o cliente mande outro.
- Helper de campos dos fluxos: `{{campo}}` = label, `{{campo_codigo}}` = código.
- Rodar a suíte com `DB_AUTO_MIGRATE` desligado (o shell local tem `DB_AUTO_MIGRATE=true` ambiente).

---

## Fase 3 — Web

> **Feito em 2026-10-07.** Diferenças e decisões em relação ao planejado:
>
> - **Construtor:** o tipo "Lista do ERP" fica no grupo "Seleção". O painel de configuração
>   (`builder/components/erp-lookup-settings-editor.tsx`) carrega conectores e listas da API; o modo
>   (lista ou pesquisa) vem da própria lista escolhida. Foi preciso ensinar o `sanitizeFieldSettings` a
>   preservar a configuração; sem isso, salvar apagava conector e lista. Os editores de campos de fase
>   e de perguntas padrão não oferecem o tipo.
> - **Condições e fórmulas** não oferecem o campo (v1).
> - **Preenchimento** (`public-form/components/erp-lookup-field.tsx`): o estado guarda
>   `{ value, label }` para mostrar a escolha mesmo ao trocar de seção. No envio vai só o código. O modo
>   lista carrega tudo uma vez e filtra no navegador, sem acento. Na pré-visualização do construtor o
>   campo aparece desativado, porque ainda não há formulário publicado para pesquisar.
> - **Login (`exigirLogin`):** a tela de login não volta para a página de origem. Por isso o aviso
>   "Entre na sua conta" abre o login em **outra aba**: a pessoa entra, volta e pesquisa de novo sem
>   perder o que já preencheu. O cookie de sessão vale para as duas abas, e a instância `api` renova o
>   token num 401.
> - **Popup** (`public-form/components/erp-unavailable-dialog.tsx`): 503 `ERP_INDISPONIVEL` no envio
>   abre "Banco do ERP fora do ar" com "Tentar enviar de novo" e "Fechar". As respostas continuam na tela.
>   Na pesquisa, o mesmo erro aparece dentro do próprio campo.
> - Exibição de respostas, exportações e aprovações não precisaram de mudança: todas mostram
>   `value_text`, que é o nome.
> - Verificado: 604 testes do frontend, incluindo 7 do campo, 3 de variáveis e os novos de
>   `form-runtime`/`types`. Também no navegador, em ambiente isolado, com o MySQL de dev:
>   - pesquisa com mínimo de caracteres e sem acento;
>   - escolha e "Trocar";
>   - envio gravando o nome do ERP;
>   - MySQL fora → popup, nada gravado, e "Tentar enviar de novo" depois que o banco voltou;
>   - construtor carregando conector e lista e salvando o "exigir login";
>   - pesquisa logada com "exigir login" ligado.

- **Construtor:** [builder/types.ts](../frontend/src/modules/builder/types.ts) ganha o tipo "Lista do
  ERP" na paleta. Não é um campo de opções fixas. O painel de configuração
  ([SectionEditModal.tsx](../frontend/src/modules/builder/components/flow/SectionEditModal.tsx) /
  [builder-wizard-field-row.tsx](../frontend/src/modules/builder/components/builder-wizard-field-row.tsx))
  tem: conector, lista (carregada de `/erp/lookup/connectors/:id/fontes`), modo, mínimo de
  caracteres, **exigir login (desmarcado por padrão)** e placeholder.
- No v1, o campo **não aparece** como alvo de condições ou regras de visibilidade.
- **Preenchimento:** componente `ErpLookupField` em
  [public-question-field.tsx](../frontend/src/modules/public-form/components/public-question-field.tsx):
  - campo de busca com lista de resultados;
  - modo lista: carrega ao abrir;
  - modo pesquisa: espera 300 ms depois da digitação e respeita o mínimo de caracteres;
  - estados de carregando, "nenhum resultado" e erro na busca (mensagem dentro do próprio campo).

  Em [form-runtime.ts](../frontend/src/modules/public-form/form-runtime.ts), o envio manda
  `valueJson: { value }` e a checagem de obrigatório reconhece o tipo novo.
- **Popup de banco fora do ar (decisão 4):** se o envio voltar 503 com `code: "ERP_INDISPONIVEL"`,
  abrir um popup (o modal/diálogo que o projeto já usa) com a mensagem do backend e um botão
  "Tentar enviar de novo". As respostas preenchidas **continuam na tela**.
- **Login (quando `exigirLogin` estiver ligado):** garantir que a página `/f/:formId` mande o token
  quando houver sessão. Sem login, mostrar "Entre para pesquisar", com link para o login que volta ao
  formulário.
- **Exibição:** [response-formatters.ts](../frontend/src/modules/responses/utils/response-formatters.ts)
  já mostra `valueText` (o label). Conferir e, se quiser, mostrar o código em texto menor.
- **Documentação interna:** adicionar o campo e o endpoint em
  [formularios.ts](../frontend/src/modules/admin/docs/content/formularios.ts).
- Testes com vitest do componente, do `fieldToSubmitItem` e do popup no 503.

---

## Fase 4 — App mobile

- [FormFillScreen.tsx](../mobile/src/screens/FormFillScreen.tsx):
  - novo `case 'erp_lookup'` antes do `default` (linha 817), com um modal de busca (`TextInput` +
    `FlatList`) que espera a digitação parar;
  - o envio manda `valueJson: { value }` (ajustar a montagem do payload, perto da linha 355);
  - a busca usa o `client` (que manda o token), não o `axios` puro que `fetchPublicForm` usa hoje
    ([forms-api.ts:124](../mobile/src/api/forms-api.ts));
  - **popup no 503 `ERP_INDISPONIVEL`**: `Alert.alert('Banco do ERP fora do ar', mensagem)`, mantendo
    as respostas preenchidas.
- A exibição já funciona, porque `valueText` = label.
- **Gerar o APK novo e instalar nos tablets antes de publicar qualquer formulário com esse campo.** O
  app antigo cai no `default` (campo de texto livre) e o envio seria recusado.

---

## Fase 5 — Deploy em produção

1. Fase 0 pronta: banco `tijuca_lookup` com a view da primeira lista, usuário só de leitura, token gerado.
2. No `.env` da raiz do projeto no servidor (o mesmo que o compose já lê), preencher
   `ERP_LOOKUP_API_TOKEN`, `ERP_LOOKUP_DB_HOST`, `ERP_LOOKUP_DB_PASSWORD` e, se forem diferentes do
   padrão, `ERP_LOOKUP_DB_PORT`/`_NAME`/`_USER`. **Não** definir `ERP_LOOKUP_FONTE_EXEMPLO`. Nunca
   commitar esse arquivo.
3. Build e subida:
   ```
   docker compose --profile app up -d --build erp-lookup backend frontend
   ```
4. Conferir se o container chega no MySQL:
   ```
   docker compose exec erp-lookup wget -qO- http://localhost:3100/health
   ```
   Deve responder com `"db": "ok"`.
5. **Migration:** nenhuma esperada (`field_type` varchar(30), `settings_json` jsonb, `value_json`
   jsonb, tabela de conectores já existe). Confirmar no fim da implementação. Se surgir alguma:
   `docker compose exec backend npx typeorm migration:run -d dist/database/data-source.js`
   (produção roda com `DB_AUTO_MIGRATE=false`).
6. Administração → ERP → Conectores → Novo: "Consultas ERP", URL `http://erp-lookup:3100`, token da
   Fase 0 → **Testar conexão**.
7. Instalar o APK novo nos tablets.
8. Piloto: um formulário em rascunho com o campo, testar na web e no tablet, incluindo o popup (parar o
   container `tijucaflow-erp-lookup` e tentar enviar). Só então publicar.

## Ordem sugerida

Fase 0 e Fase 1 em paralelo (a API é desenvolvida contra o MySQL local) → Fase 2 → Fases 3 e 4 em
paralelo (dependem dos endpoints da Fase 2) → Fase 5. A primeira lista só é escrita depois da conversa
da seção "Como definir uma lista".

## Fora do v1

- Seleção múltipla.
- Campos de fase do kanban (`PhaseFieldsScreen`) e perguntas padrão.
- `product_table` puxando produtos do ERP. Hoje usa lista fixa
  ([form-submission.validator.ts:589](../backend/src/modules/responses/form-submission.validator.ts)).
- Condições do formulário e dos fluxos pelo código.
- Dashboards agrupando pela opção escolhida.
- Preencher outros campos com dados do item escolhido (ex.: escolher o cliente preenche documento e cidade).

## Riscos

| Risco | Mitigação |
|---|---|
| **Com `exigirLogin` desligado (padrão), qualquer pessoa com o link do formulário pesquisa a lista** | Throttle de 60/min por IP, mínimo de caracteres, máximo de 20 itens, só `value`/`label`. Ligar `exigirLogin` em listas com dado sensível antes de divulgar o link |
| Carga no banco do ERP | Espera da digitação, mínimo de caracteres, `LIMIT`, `MAX_EXECUTION_TIME`, pool pequeno, cache |
| ERP muda tabelas ou colunas | Views no banco `tijuca_lookup`: só a view muda |
| Nome do item muda no ERP depois | O label fica gravado na resposta: o histórico mostra o que o usuário viu |
| Tablet com app antigo | Instalar o APK novo antes de publicar formulários com o campo |
