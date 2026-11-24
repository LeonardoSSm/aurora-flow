# Especificação para produção — Campo Tabela Dinâmica do ERP

> **Revisada em 2026-10-08 contra o código.** As correções estão nas subseções marcadas "revisão de 2026-10-08" (§3, §4.1, §5.3, §6.1, §7.3–7.6, §8.1, §9.1, §10, §15, §16.1). Quando houver conflito, elas prevalecem sobre o texto original.

## 1. Objetivo

Implementar um novo campo de formulário denominado `erp_table`, apresentado no construtor como **Tabela dinâmica do ERP**.

Esse campo deverá:

- Consultar uma fonte autorizada do ERP.
- Usar valores de outros campos do formulário como parâmetros.
- Criar automaticamente uma linha para cada item retornado.
- Mostrar os dados provenientes do ERP como somente leitura.
- Permitir o preenchimento de colunas adicionais pertencentes exclusivamente ao formulário.
- Salvar a tabela completa como parte da resposta.
- Nunca realizar inclusão, alteração ou exclusão no ERP.

Exemplo de uso:

1. O usuário seleciona o pedido `12345`.
2. O ERP devolve sete itens.
3. O formulário cria sete linhas.
4. Código, produto, unidade e quantidade pedida ficam bloqueados.
5. O usuário informa quantidade conferida e observação.
6. O formulário salva o retrato dos dados do ERP e os valores informados.

## 2. Escopo funcional

### 2.1. Colunas provenientes do ERP

São preenchidas automaticamente e não podem ser alteradas:

- Código do item.
- Código do produto.
- Descrição.
- Unidade.
- Quantidade do pedido.
- Valor unitário.
- Valor total.
- Qualquer outra propriedade exposta pela fonte cadastrada.

Essas colunas devem ser consideradas um snapshot de consulta, e não uma referência viva ao ERP depois do envio.

### 2.2. Colunas preenchíveis

São configuradas no construtor do formulário e pertencem exclusivamente ao Tijuca Flow.

Tipos inicialmente suportados:

- Texto curto.
- Texto longo.
- Número.
- Valor monetário.
- Data.
- Seleção única.
- Checkbox.

Cada coluna poderá configurar:

- Obrigatoriedade.
- Valor mínimo e máximo.
- Quantidade de casas decimais.
- Tamanho máximo do texto.
- Opções disponíveis.
- Texto de ajuda.
- Valor inicial, quando aplicável.

### 2.3. Origem dos parâmetros

A consulta poderá receber parâmetros de outros campos do formulário.

Exemplo:

```text
Parâmetro da consulta: pedidoId
Valor obtido do campo: numero_pedido
```

No MVP, recomenda-se permitir parâmetros vindos de:

- Lista do ERP.
- Texto curto.
- Número.
- Seleção única.

O campo utilizado como parâmetro deverá estar antes da tabela, na mesma seção ou em uma seção anterior.

## 3. Modelo de configuração

A configuração administrativa será armazenada em `form_fields.settings_json`, que já utiliza `jsonb`.

Exemplo:

```json
{
  "erpConnectorId": "uuid-do-conector",
  "fonte": "pedidos",
  "dataset": "itens",
  "rowKey": "id_item",
  "parameterBindings": [
    {
      "parameter": "pedidoId",
      "fieldCode": "pedido"
    }
  ],
  "sourceColumns": [
    {
      "key": "codigo",
      "label": "Código",
      "type": "text"
    },
    {
      "key": "produto",
      "label": "Produto",
      "type": "text"
    },
    {
      "key": "quantidadePedido",
      "label": "Qtd. pedida",
      "type": "number"
    }
  ],
  "inputColumns": [
    {
      "id": "quantidadeConferida",
      "label": "Qtd. conferida",
      "type": "number",
      "required": true,
      "min": 0,
      "decimals": 3
    },
    {
      "id": "observacao",
      "label": "Observação",
      "type": "text",
      "required": false,
      "maxLength": 500
    }
  ],
  "maxRows": 500,
  "exigirLogin": false
}
```

> Revisão de 2026-10-08: `requireLogin` passa a se chamar `exigirLogin`, o mesmo nome já usado pelo campo `erp_lookup` (`erp-lookup.settings.ts`).

O formulário público não deverá receber:

- ID do conector.
- Nome interno da fonte.
- URL do serviço.
- Token.
- Nome de tabela do ERP.
- SQL utilizado pela fonte.

A projeção pública receberá somente:

- Campos dos quais a tabela depende.
- Colunas que devem ser exibidas.
- Colunas que podem ser preenchidas.
- Regras de validação necessárias à interface.

## 4. Contrato da consulta ERP

O `erp-lookup` deve continuar trabalhando apenas com fontes previamente registradas. Não deverá existir configuração de SQL pelo construtor do formulário.

Sugestão de extensão do contrato:

```ts
interface ErpTableDefinition {
  id: string;
  label: string;
  parameters: ErpTableParameter[];
  columns: ErpTableSourceColumn[];
  maxRows: number;
}

interface ErpTableParameter {
  name: string;
  type: 'text' | 'number';
  required: boolean;
}

interface ErpTableSourceColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'boolean';
}

interface ErpTableResult {
  schemaVersion: 1;
  tableId: string;
  fetchedAt: string;
  rows: Array<{
    key: string;
    values: Record<string, string | number | boolean | null>;
  }>;
}
```

Cada fonte poderá expor uma ou mais tabelas:

```ts
interface Fonte {
  pesquisar(...): Promise<ItemFonte[]>;
  resolver(...): Promise<ItemFonte | null>;
  detalhar?(...): Promise<DetalhesItem | null>;

  listarTabelas?(): ErpTableDefinition[];
  consultarTabela?(
    tableId: string,
    parameters: Record<string, unknown>,
  ): Promise<ErpTableResult>;
}
```

A fonte de pedidos poderá reaproveitar a consulta de itens já existente em `erp-lookup/src/fontes/pedidos.detalhes.ts`.

Diferentemente da ficha atual, a nova consulta deve devolver valores tipados. Valores monetários e quantidades não devem chegar apenas como textos formatados.

### 4.1. Ajustes da revisão (2026-10-08)

- **Nomes em português**, como o resto do `erp-lookup` (`TabelaDetalhe`, `ColunaDetalhe`, `chave`). Contrato implementado:

```ts
type TipoColunaTabela = 'texto' | 'numero' | 'moeda' | 'data' | 'booleano';
type ValorCelula = string | number | boolean | null;

interface ParametroTabela { nome: string; tipo: 'texto' | 'numero'; obrigatorio: boolean; }
interface ColunaTabela { chave: string; label: string; tipo: TipoColunaTabela; }
interface DefinicaoTabela {
  id: string; label: string;
  parametros: ParametroTabela[];
  colunas: ColunaTabela[];
  /** Coluna que identifica a linha (estável entre consultas). */
  chaveLinha: string;
  maxLinhas: number;
}
interface ResultadoTabela {
  versao: 1; tabela: string; consultadoEm: string;
  linhas: Array<{ chave: string; valores: Record<string, ValorCelula> }>;
}

interface Fonte {
  // ...pesquisar, resolver, detalhar
  tabelas?(): DefinicaoTabela[];
  consultarTabela?(tabela: string, parametros: Record<string, string>): Promise<ResultadoTabela | null>;
}
```

- **Valores tipados de verdade.** O mysql2 devolve `DECIMAL` como texto (o pool não liga `decimalNumbers`). A consulta converte explicitamente: `numero`/`moeda` viram `number` (ou `null`), `data` vira ISO `YYYY-MM-DD` (ou `null` para `0000-00-00`), texto passa pela decodificação de entidades HTML de `formato.ts`.
- `consultarTabela` devolve `null` quando o registro pai (ex.: o pedido) não existe — diferente de "existe, mas sem linhas" (`linhas: []`).
- Endpoints da API `erp-lookup` (protegidos pelo `TokenGuard`, só `GET`):
  - `GET /fontes/:fonte/tabelas` → `DefinicaoTabela[]` (lista vazia quando a fonte não tem tabelas).
  - `GET /fontes/:fonte/tabelas/:tabela?<parametro>=<valor>` → `ResultadoTabela`; 404 `TABELA_NAO_EXISTE`, 404 `ITEM_NAO_ENCONTRADO` (registro pai inexistente), 400 para parâmetro obrigatório ausente ou inválido. Os parâmetros vão na query string como já acontece em `/item?value=` — chamada interna backend → `erp-lookup`, nunca exposta ao navegador. O log registra só fonte, tabela, quantidade de linhas e duração.

## 5. Endpoints

### 5.1. Administração

Para configuração no construtor:

```http
GET /erp/lookup/connectors/:connectorId/fontes/:fonte/tabelas
```

Resposta:

```json
{
  "tables": [
    {
      "id": "itens",
      "label": "Itens do pedido",
      "parameters": [
        {
          "name": "pedidoId",
          "type": "text",
          "required": true
        }
      ],
      "columns": [
        {
          "key": "produto",
          "label": "Produto",
          "type": "text"
        }
      ],
      "maxRows": 500
    }
  ]
}
```

### 5.2. Preenchimento público

```http
POST /public/forms/:formId/fields/:fieldCode/erp-table/load
```

Requisição:

```json
{
  "dependencies": {
    "pedido": {
      "value": "12345"
    }
  }
}
```

Resposta:

```json
{
  "schemaVersion": 1,
  "sourceHash": "sha256-do-resultado",
  "fetchedAt": "2026-10-08T15:30:00.000Z",
  "rows": [
    {
      "key": "ITEM-001",
      "values": {
        "codigo": "101",
        "produto": "Produto A",
        "quantidadePedido": 10
      }
    }
  ]
}
```

O backend deverá localizar o campo, carregar sua configuração e montar os parâmetros. O navegador não poderá escolher livremente conector, fonte ou dataset.

Aplicar:

- Limite de requisições.
- Autenticação opcional conforme configuração.
- Timeout máximo de cinco segundos.
- Cache curto por conector, fonte, dataset e parâmetros.
- Limite máximo de 500 linhas.

### 5.3. Ajustes da revisão (2026-10-08)

- **Teste da consulta no construtor (§9, item 10)** precisa de um endpoint administrativo próprio: `POST /erp/lookup/connectors/:connectorId/fontes/:fonte/tabelas/:tabela/teste` com `{ "parametros": { ... } }`, permissão `forms.edit` (mesma regra da listagem de fontes: quem monta formulário vê dados do ERP, mas não URL nem token). Resposta limitada às 20 primeiras linhas.
- **Limite de requisições do `load` público:** 60/min, igual ao `lookup` (o padrão de 30/min do formulário público é pouco para quem troca de pedido algumas vezes).
- **O cache vale só para o `load`.** A revalidação no envio (§7) consulta sempre o ERP direto; senão o hash do envio repete o do carregamento e o `409 ERP_TABLE_CHANGED` nunca dispara.
- No `load`, `dependencies` vem do navegador (é só uma consulta). No envio, **não** — ver §7.3.

## 6. Persistência da resposta

Cada tabela será salva como um único `submission_item`, utilizando `value_json`, estrutura que já suporta valores complexos.

Formato recomendado:

```json
{
  "schemaVersion": 1,
  "source": {
    "dependencyFieldCode": "pedido",
    "dependencyValue": "12345",
    "dataset": "itens",
    "fetchedAt": "2026-10-08T15:30:00.000Z",
    "sourceHash": "sha256-do-resultado"
  },
  "rows": [
    {
      "key": "ITEM-001",
      "sourceValues": {
        "codigo": "101",
        "produto": "Produto A",
        "unidade": "CX",
        "quantidadePedido": 10
      },
      "answers": {
        "quantidadeConferida": 8,
        "observacao": "Duas caixas avariadas"
      }
    }
  ]
}
```

O snapshot é necessário para garantir que:

- Uma resposta antiga continue mostrando o que foi consultado no momento do envio.
- Mudanças posteriores no ERP não alterem respostas históricas.
- Exportações não dependam da disponibilidade futura do ERP.
- Auditorias consigam comparar o dado consultado com o informado.

Não é necessária alteração estrutural no banco para o MVP: `field_type` já é `varchar` e `settings_json`/`value_json` já são `jsonb`. Será necessário apenas acrescentar `ERP_TABLE` aos enums e contratos da aplicação.

### 6.0. Formato implementado (revisão de 2026-10-08)

O formato gravado difere do exemplo acima em dois pontos:

- **`source.dependencies`** é um mapa `{ "<código do campo>": "<valor>" }`, no lugar de `dependencyFieldCode`/`dependencyValue`. Assim cabe uma tabela com mais de um parâmetro.
- **`columns`** guarda os rótulos e tipos das colunas no momento do envio. A resposta continua exibível mesmo que a configuração mude ou a versão seja apagada.

```json
{
  "schemaVersion": 1,
  "source": { "dataset": "itens", "dependencies": { "pedido": "12345" }, "fetchedAt": "...", "sourceHash": "sha256-..." },
  "columns": {
    "source": [{ "key": "produto", "label": "Produto", "type": "text" }],
    "input": [{ "id": "quantidadeConferida", "label": "Qtd. conferida", "type": "number", "decimals": 3 }]
  },
  "rows": [{ "key": "ITEM-001", "sourceValues": { "produto": "Produto A" }, "answers": { "quantidadeConferida": 8 } }]
}
```

A chave de linha (`rowKey` no exemplo da §3) não fica na configuração do campo. Ela vem da definição da tabela no `erp-lookup` (`chaveLinha`), e a publicação recusa uma tabela que não a declara.

### 6.1. Resumo em `value_text` (revisão de 2026-10-08)

No envio, o backend grava em `value_text` o resumo textual da tabela (formato da §11), como o `erp_lookup` já grava o nome devolvido pelo ERP. Assim CSV, Excel, Google Sheets (`google-sheets-headers.service.ts` usa `valueText` antes de `JSON.stringify(valueJson)`) e as variáveis `{{campo}}` dos fluxos (`flow-field-values.ts`) funcionam sem código específico.

O resumo é truncado em **45.000 caracteres** com o sufixo `… (+N itens)`: uma célula do Google Sheets aceita no máximo 50.000, e 500 linhas × ~100 caracteres chegam a esse teto. O `value_json` continua completo.

## 7. Validação e proteção contra adulteração

O frontend não deve ser considerado fonte confiável para os dados do ERP.

No envio, o backend deverá:

1. Identificar o campo `erp_table`.
2. Ler os parâmetros da resposta.
3. Consultar novamente o ERP.
4. Gerar novamente o `sourceHash`.
5. Comparar o hash com o carregado no formulário.
6. Validar as chaves das linhas.
7. Aceitar somente colunas configuradas em `inputColumns`.
8. Descartar ou rejeitar propriedades não configuradas.
9. Montar o snapshot usando os dados provenientes do servidor.
10. Persistir tudo em uma única transação.

O backend não deve salvar `sourceValues` enviados diretamente pelo navegador.

### 7.1. Mudança no ERP durante o preenchimento

Se os itens forem alterados entre o carregamento e o envio, retornar:

```http
409 Conflict
```

```json
{
  "code": "ERP_TABLE_CHANGED",
  "message": "Os itens foram alterados no ERP. Atualize a tabela e confira os valores novamente."
}
```

O frontend deverá:

- Manter os valores informados nas linhas que ainda possuam a mesma chave.
- Destacar linhas adicionadas ou removidas.
- Exigir nova confirmação antes do envio.

### 7.2. ERP indisponível

Se o ERP não responder durante a validação:

```http
503 Service Unavailable
```

Nenhuma resposta deverá ser parcialmente persistida. Esse comportamento é compatível com a validação atual do campo `erp_lookup`.

### 7.3. Origem dos parâmetros no envio (revisão de 2026-10-08)

No envio, os parâmetros da consulta **não** vêm de um bloco `dependencies` mandado pelo navegador. Saem do item do próprio campo dependente na mesma submissão, **depois** de `ErpLookupFieldService.resolveSubmissionItems` ter conferido aquele código no ERP. Se o navegador mandar dependências junto da tabela, elas são ignoradas.

Sem isso, seria possível carregar a tabela do pedido A e enviar a resposta com o pedido B.

### 7.4. Escopo do `sourceHash`

O hash cobre **somente**:

- as chaves das linhas, na ordem devolvida;
- os valores das `sourceColumns` configuradas no campo (as exibidas).

Colunas que o ERP devolve mas o formulário não mostra ficam fora. Do contrário, campos que mudam com o andamento do pedido (quantidade faturada, peso, quebra) gerariam `409` o tempo todo.

Serialização canônica: SHA-256 de `JSON.stringify` com as chaves de cada objeto ordenadas e números como o ERP tipado devolve (nunca texto formatado). Formato: `sha256-<hex>`.

### 7.5. Tempo total do envio

As consultas ao ERP no envio (conferência dos `erp_lookup` e depois revalidação das `erp_table`) rodam **em paralelo dentro de cada etapa**, cada uma com timeout de 5 s. Um formulário com uma Lista do ERP e uma tabela fica em até ~10 s no pior caso. O frontend mantém o botão de envio em estado de carregamento durante esse tempo.

### 7.6. Tamanho do envio

O backend usa hoje o limite padrão do body parser do Express (100 kb), porque `main.ts` não configura outro. Com 500 linhas e observações de até 1.000 caracteres, o envio passa disso e volta `413`.

Correção: `app.useBodyParser('json', { limit: '2mb' })` em `main.ts`. Conferir também o `client_max_body_size` do proxy à frente do backend em produção.

## 8. Validações das células

O backend deverá validar individualmente:

- Tipo do valor.
- Obrigatoriedade.
- Tamanho máximo.
- Número finito.
- Mínimo e máximo.
- Casas decimais.
- Opção pertencente à lista configurada.
- Data em formato ISO.
- Ausência de colunas desconhecidas.

Limites recomendados:

- Até 500 linhas.
- Até 20 colunas originadas no ERP.
- Até 10 colunas preenchíveis.
- Textos com no máximo 1.000 caracteres.
- Chave de linha com no máximo 180 caracteres.
- Payload total de até 2 MB.
- Chaves de linha obrigatoriamente únicas.

### 8.1. Casos que a primeira versão não cobria (revisão de 2026-10-08)

- **Registro pai inexistente** (ex.: pedido não encontrado no ERP): erro no campo, "Pedido não encontrado no ERP".
- **Zero linhas devolvidas:**
  - Se a tabela for obrigatória, bloqueia o envio com "O pedido não tem itens no ERP".
  - Se for opcional, grava a tabela vazia (snapshot com `rows: []`).
- **Campo dependente vazio ou oculto** (regra de visibilidade, ou seção pulada por desvio): a tabela é tratada como vazia. O validador só exige o que está visível.
- **Pedido cancelado:** a tabela não decide nada sobre isso. Quem bloqueia ou não um pedido cancelado é a Lista do ERP (que hoje mostra `CANCELADO` no rótulo).

## 9. Construtor do formulário

Adicionar **Tabela dinâmica do ERP** em **Tabelas e Listas**.

O editor deverá permitir:

1. Selecionar o conector.
2. Selecionar a fonte.
3. Selecionar o dataset.
4. Associar cada parâmetro a um campo anterior.
5. Escolher as colunas do ERP que serão mostradas.
6. Reordenar as colunas.
7. Adicionar colunas preenchíveis.
8. Configurar validações.
9. Visualizar uma prévia estrutural.
10. Testar a consulta com parâmetros controlados.

A publicação deve ser recusada quando:

- O conector não existir ou estiver inativo.
- A fonte não expuser o dataset.
- Um parâmetro obrigatório não estiver associado.
- O campo dependente não existir.
- O campo dependente estiver depois da tabela.
- A chave de linha não estiver disponível.
- Não existir nenhuma coluna visível.
- Houver IDs de coluna duplicados.

A configuração deverá entrar no hash da versão do formulário, como já ocorre com `settingsJson`.

### 9.1. Ajustes da revisão (2026-10-08)

- **"O campo dependente vem antes da tabela"** quer dizer: está na mesma seção, numa ordem anterior, ou numa seção que **sempre** é percorrida antes da seção da tabela. Com desvios de seção, uma seção anterior pode ser pulada. Para o MVP vale a regra simples (mesma seção ou seção de ordem menor) mais o tratamento em tempo de envio da §8.1 (dependente ausente = tabela vazia).
- **Fases do kanban e perguntas padrão:** `save-kanban-phases.dto.ts` e `save-standard-questions.dto.ts` já excluem `ERP_LOOKUP`. `ERP_TABLE` precisa ser excluído também, senão esses dois lugares passam a aceitar o tipo novo sem saber tratá-lo.
- **Auditoria (§12):** como a configuração entra no hash, alterar o campo gera uma versão nova, e a publicação já é auditada (`forms.published` no `audit.listener.ts`). Não é necessário um evento novo por alteração de campo.

## 10. Formulário público

Criar um componente específico, por exemplo:

```text
frontend/src/modules/public-form/components/erp-table-field.tsx
```

Comportamento esperado:

- Não consultar enquanto faltarem parâmetros.
- Carregar automaticamente quando os parâmetros estiverem disponíveis.
- Cancelar a requisição anterior quando um parâmetro mudar.
- Limpar a tabela ao trocar o pedido, solicitando confirmação caso existam respostas preenchidas.
- Exibir carregamento, erro, vazio e sucesso.
- Manter respostas ao navegar entre seções.
- Mostrar cabeçalho fixo em tabelas grandes.
- Usar paginação visual para grandes volumes.
- Em telas pequenas, representar cada linha como cartão.
- Exibir erros por linha e por célula.
- Identificar visualmente quais colunas são provenientes do ERP.

No envio, o runtime deverá serializar `sourceHash`, chaves das linhas e somente os valores preenchíveis. As dependências não são enviadas: o backend as lê do próprio campo dependente na submissão (§7.3).

Formato enviado em `valueJson`:

```json
{
  "sourceHash": "sha256-...",
  "rows": [{ "key": "ITEM-001", "answers": { "quantidadeConferida": 8 } }]
}
```

## 11. Exibição e exportação

A resposta salva deve ser mostrada como tabela no detalhe da submissão.

As colunas devem preservar:

- Rótulo configurado na versão do formulário.
- Ordem configurada.
- Dados do snapshot.
- Valores preenchidos.
- Formatação de número, moeda e data.

Para CSV, Excel e Google Sheets, o MVP poderá exportar uma representação textual por resposta:

```text
101 - Produto A | Qtd. pedida: 10 | Qtd. conferida: 8 | Observação: Duas caixas avariadas
```

Para relatórios mais avançados, recomenda-se posteriormente uma exportação normalizada com uma aba auxiliar, contendo uma linha por item da tabela.

Fórmulas sobre as colunas da tabela e agregações em dashboards devem ficar fora do MVP, evitando incluir cálculo não solicitado na primeira entrega.

## 12. Segurança

Requisitos obrigatórios:

- Usuário do banco ERP somente com permissão `SELECT`.
- SQL exclusivamente definido no código do `erp-lookup`.
- Parâmetros sempre enviados por prepared statements.
- Proibição de SQL configurável pelo construtor.
- Tokens e URLs nunca enviados ao formulário público.
- Logs sem valores pesquisados ou conteúdo das células.
- Timeout máximo.
- Rate limit.
- Limites de linhas, colunas e payload.
- Validação de URL interna já existente no conector.
- Registro de auditoria quando a configuração do campo for alterada.
- Respeito ao indicador `isSensitive` do campo.
- Nenhum endpoint de escrita direcionado ao ERP.

O uso de `POST` para carregar a tabela pública é somente para transportar parâmetros de consulta sem expô-los na URL. A operação interna continuará sendo estritamente de leitura.

## 13. Observabilidade

Registrar métricas:

- Quantidade de consultas.
- Latência do ERP.
- Quantidade de linhas retornadas.
- Erros por fonte e dataset.
- Timeouts.
- Respostas `409 ERP_TABLE_CHANGED`.
- Respostas `503 ERP_INDISPONIVEL`.
- Falhas de validação.
- Tamanho médio dos payloads.

Logs devem conter:

- ID do conector.
- Fonte.
- Dataset.
- Quantidade de linhas.
- Duração.
- Resultado.
- Correlation ID.

Não devem conter:

- Número do pedido.
- Código de cliente.
- Descrições.
- Observações.
- Conteúdo das células.

## 14. Testes obrigatórios

### 14.1. Backend

- Configuração válida e inválida.
- Fonte ou dataset inexistente.
- Parâmetros ausentes.
- Limite de linhas.
- Chaves duplicadas.
- Tipos inválidos.
- Colunas desconhecidas.
- Adulteração de valores do ERP.
- Adulteração de chaves.
- Mudança dos itens entre carregamento e envio.
- ERP indisponível.
- Timeout.
- Submissão idempotente.
- Garantia de que nenhuma transação seja aberta antes da consulta externa terminar.
- Garantia de ausência de gravação parcial.

### 14.2. Frontend

- Carregamento após preenchimento da dependência.
- Troca do pedido.
- Preservação ao navegar entre seções.
- Validação por célula.
- Layout responsivo.
- Estado vazio.
- Erro de integração.
- Reconciliação após `409`.
- Serialização correta.
- Acessibilidade por teclado e leitor de tela.

### 14.3. E2E

Cenário mínimo:

1. Criar formulário.
2. Adicionar Lista do ERP.
3. Adicionar Tabela dinâmica.
4. Associar a tabela ao pedido.
5. Publicar.
6. Selecionar pedido com múltiplos itens.
7. Confirmar que a quantidade de linhas coincide com o ERP.
8. Preencher as colunas.
9. Enviar.
10. Abrir a resposta.
11. Conferir o snapshot.
12. Exportar.
13. Confirmar que nenhuma alteração foi realizada no ERP.

## 15. Estratégia de implantação

Ordem recomendada:

1. Adicionar contratos e consulta tipada ao `erp-lookup`.
2. Implantar backend com o novo tipo desabilitado por feature flag.
3. Implantar endpoints administrativos e públicos.
4. Implantar validação e persistência.
5. Implantar visualização de respostas e exportação.
6. Implantar construtor e formulário público.
7. Criar um formulário piloto restrito.
8. Validar com uma fonte real de pedidos.
9. Monitorar latência, erros e tamanho dos resultados.
10. Liberar gradualmente para outros formulários.

Feature flag sugerida:

```env
ERP_TABLE_ENABLED=false
```

A ativação inicial deve ser feita por formulário ou por ambiente.

> Revisão de 2026-10-08: não existe hoje mecanismo de liberação por formulário. Para o MVP, a flag vale **por ambiente**. Com `ERP_TABLE_ENABLED=false`:
>
> - o construtor não oferece o tipo;
> - publicar um formulário com `erp_table` é recusado;
> - o `load` público e o envio respondem `503` com o código `ERP_TABLE_DESATIVADO`;
> - respostas já salvas continuam sendo exibidas e exportadas normalmente, porque usam só o snapshot.
>
> O piloto restrito (passo 7) é feito ligando a flag e publicando um único formulário com o campo.

### 15.1. Compatibilidade de versão

Como não há migração obrigatória de banco, o principal risco é uma versão antiga da aplicação encontrar um formulário com `fieldType: "erp_table"`.

Por isso:

- Backend e renderizadores devem ser implantados antes da liberação no construtor.
- A feature flag só deve ser ativada depois que todas as instâncias estiverem atualizadas.
- O rollback preferencial deve ser feito desligando a feature flag.
- Submissões já salvas devem continuar legíveis mesmo com a criação de novas tabelas desabilitada.

## 16. Compatibilidade mobile

O aplicativo mobile possui suporte para a atual `product_table`, mas não possui implementação explícita para a integração `erp_lookup`.

Para a primeira entrega em produção existem duas opções:

1. Restringir o `erp_table` ao preenchimento web e mostrar uma mensagem explícita no mobile.
2. Implementar o componente equivalente em React Native na mesma entrega.

O aplicativo não deve ignorar o campo silenciosamente. Quando não houver suporte, deverá informar que o formulário precisa ser preenchido pelo portal web.

### 16.1. Situação real do app (revisão de 2026-10-08)

O `FormFillScreen` não ignora tipos desconhecidos: cai no `default` do `switch` e desenha um **campo de texto livre**. Já acontece hoje com o `erp_lookup`. O app manda `valueText` e o backend recusa com 400.

Os APKs são instalados manualmente nos tablets, então "todas as instâncias atualizadas" (§15.1) não vale para eles: um APK antigo continua em uso depois do deploy.

Decisão para o MVP (opção 1, só web):

- **Servidor:** um `erp_table` em formato diferente do esperado (ex.: `valueText`, que é o que o APK antigo manda) é recusado com a mensagem **"Este campo só pode ser preenchido pelo portal web."** Nada é gravado.
- **APK antigo:** em qualquer erro de envio ele mostra só o alerta genérico "Não foi possível enviar o formulário" (`FormFillScreen.tsx`, `catch` do envio). A mensagem do servidor não aparece, e não há como o backend distinguir um APK antigo. Por isso, **antes de publicar o primeiro formulário com `erp_table`, os tablets precisam receber o APK novo** (passo adicional da §15, depois do passo 6).
- **APK novo:** identifica `erp_table`, mostra um aviso no lugar do campo com o mesmo texto e não deixa enviar.
- Implementar o componente em React Native fica para uma etapa posterior.

## 17. Critérios de aceite para produção

A entrega estará pronta quando:

- A quantidade de linhas coincidir com os itens devolvidos pelo ERP.
- As colunas originadas no ERP não forem editáveis.
- Somente as colunas do formulário puderem ser preenchidas.
- Nenhuma requisição de escrita for realizada contra o ERP.
- A troca do parâmetro recarregar corretamente a tabela.
- Valores obrigatórios forem validados por linha.
- Tentativas de adulteração forem rejeitadas.
- Mudanças ocorridas no ERP forem detectadas antes do envio.
- Indisponibilidade do ERP não causar persistência parcial.
- A resposta armazenar o snapshot completo.
- Respostas antigas puderem ser visualizadas sem nova consulta.
- Exportação funcionar.
- Logs não expuserem os parâmetros ou dados das linhas.
- O fluxo completo estiver coberto por testes automatizados.

## 18. Estimativa inicial

Estimativa para uma implementação web completa, incluindo backend, integração, construtor, preenchimento, visualização da resposta, exportação, testes e rollout:

- Backend e `erp-lookup`: 4 a 6 dias úteis.
- Construtor e formulário público: 4 a 6 dias úteis.
- Visualização, exportação e integrações secundárias: 2 a 3 dias úteis.
- Testes, observabilidade e implantação gradual: 3 a 5 dias úteis.
- Total estimado: 13 a 20 dias úteis para um desenvolvedor familiarizado com o projeto.

A compatibilidade completa com o aplicativo mobile deve ser planejada como etapa adicional caso seja necessária já no primeiro lançamento.

## 19. Definição de pronto

A feature só poderá ser considerada concluída quando:

- Código, contratos e documentação estiverem revisados.
- Testes unitários, de integração e E2E estiverem aprovados.
- A fonte real do ERP estiver validada em homologação.
- Alertas e métricas estiverem configurados.
- O formulário piloto tiver sido validado pelo usuário responsável.
- O procedimento de rollback tiver sido testado.
- A feature flag tiver sido ativada de forma gradual.
- Não houver qualquer caminho de escrita no ERP.
