# Roteiro de Demonstração FormHub

Demonstração completa do ciclo de vida de uma solicitação corporativa — da captura via formulário à aprovação humana, com automação, SLA e observabilidade. Duração estimada: **15 minutos**.

---

## Preparação (antes da demo)

```bash
# 1. Subir infraestrutura
docker compose up -d

# 2. Rodar migrations (apenas na primeira vez)
npm --prefix backend run migration:run

# 3. Iniciar backend e frontend
npm --prefix backend run dev   # porta 3000
npm --prefix frontend run dev  # porta 5173

# 4. Popular dados de demonstração
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@formhub.local","password":"FormHub@123"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

curl -s -X POST http://localhost:3000/api/v1/admin/seed/demo \
  -H "Authorization: Bearer $TOKEN"
```

O seed cria os seguintes usuários (senha: `FormHub@Demo123`):

| Email | Papel | Área |
|---|---|---|
| admin@formhub.local | Admin | — |
| gerente.rh@formhub.local | Manager | RH |
| gerente.ti@formhub.local | Manager | TI |
| editor.rh@formhub.local | Editor | RH |
| editor.ti@formhub.local | Editor | TI |
| editor.fin@formhub.local | Editor | FIN |
| viewer.log@formhub.local | Viewer | LOG |

---

## Roteiro (15 minutos)

### 1. Captura via formulário público (2 min)

**Objetivo:** mostrar que qualquer pessoa pode submeter sem criar conta.

1. Abrir o formulário público "Solicitação de Compra":
   - No FormHub, ir em **Formulários** → localizar "Solicitação de Compra"
   - Clicar em **Ver formulário** para copiar o link público (`/f/<id>`)
   - Abrir o link em uma aba anônima

2. Preencher o formulário:
   - **Descrição:** "Aquisição de notebooks para equipe de TI"
   - **Valor total:** `8500` (acima de R$5.000 para acionar o fluxo de aprovação)
   - **Fornecedor:** "Tech Supply Ltda"

3. Submeter e mostrar a tela de confirmação.

> **Ponto de discussão:** o formulário pode ter campos condicionais — campos que aparecem ou somem dependendo de respostas anteriores, sem código adicional.

---

### 2. Automação disparada pela submissão (2 min)

**Objetivo:** mostrar o motor de fluxos executando automaticamente.

1. Logar como **admin@formhub.local**.
2. Ir em **Fluxos** → abrir "Aprovação automática de compras".
3. Mostrar o editor visual:
   - Nó de gatilho: "Formulário submetido"
   - Nó de condição: `valor_total > 5000`
   - Ramo **SIM** → "Criar aprovação" (atribuída a gerente.ti)
   - Ramo **NÃO** → "Notificar usuários" (editor.fin)
4. Ir em **Solicitações** → localizar a solicitação recém-criada com status **Aguardando Aprovação**.
5. Mostrar que a aprovação foi criada automaticamente e atribuída a `gerente.ti@formhub.local`.

> **Ponto de discussão:** o fluxo executa via RabbitMQ de forma assíncrona, mas tem fallback inline — se a fila cair, o fluxo ainda executa de forma síncrona.

---

### 3. Aprovação humana (3 min)

**Objetivo:** mostrar a experiência do aprovador e o rastreamento da decisão.

1. Abrir nova aba e logar como **gerente.ti@formhub.local** (senha: `FormHub@Demo123`).
2. No menu lateral, ir em **Aprovações**.
3. Mostrar a pendência listada com dados da solicitação.
4. Clicar em **Aprovar**, adicionar comentário:
   > "Aprovado. Orçamento dentro do limite semestral de TI."
5. Confirmar a aprovação.
6. Mostrar a solicitação mudando para status **Aprovado**.
7. Clicar na solicitação e abrir a aba **Histórico** para mostrar o rastreamento completo:
   - Criada → Aguardando Aprovação → Aprovada (com nome e timestamp de cada transição)

> **Ponto de discussão:** todo evento é imutável e auditável. O log de auditoria (admin) também registra quem aprovou, quando e com qual comentário.

---

### 4. Visibilidade operacional via Kanban (3 min)

**Objetivo:** mostrar controle visual de todo o backlog.

1. Voltar como **admin@formhub.local**.
2. Ir em **Kanban**.
3. Mostrar as colunas e os cards distribuídos por status.
4. Apontar um card com **badge de SLA vencido** (borda vermelha pulsante):
   - O SLA foi configurado em 48h; o card em questão está vencido há mais de 24h.
5. Clicar no card para abrir o detalhe lateral com histórico completo e campos respondidos.
6. Mostrar o card com **SLA em alerta** (amarelo) — 2h restantes.

> **Ponto de discussão:** SLA é configurável por organização (settings) e pode futuramente ser configurado por tipo de formulário.

---

### 5. Editor visual de fluxos (3 min)

**Objetivo:** mostrar que um gestor consegue configurar a automação sem código.

1. Ir em **Fluxos** → "Aprovação automática de compras".
2. Mostrar os nós arrastáveis e o painel lateral de configuração.
3. Clicar no nó de condição e mostrar os campos: campo do formulário, operador, valor.
4. Clicar no nó de ação e mostrar a configuração de aprovação (responsável, prazo).
5. Ir em **Histórico de execuções** (aba dentro do fluxo) para mostrar:
   - A execução disparada pela submissão
   - Status: sucesso / falha
   - Tempo de execução

---

### 6. Observabilidade (2 min)

**Objetivo:** mostrar que a operação é visível sem abrir um terminal.

1. Ir em **Administração → Observabilidade**.
2. Mostrar os KPIs operacionais: total de solicitações, aprovações pendentes, execuções de fluxo hoje.
3. Mostrar o gráfico de solicitações por status.
4. Mostrar a tabela de integrações (GLPI, WhatsApp, Webhooks) com indicadores de saúde.
5. Clicar em **Abrir Grafana** → mostrar o dashboard técnico com métricas de latência, filas e banco de dados.

> **Ponto de discussão:** o Grafana já vem configurado com datasource Prometheus e dashboards provisionados — nada precisa ser configurado manualmente.

---

## Respostas a perguntas frequentes

| Pergunta | Resposta rápida |
|---|---|
| "Funciona sem internet?" | Sim — toda a stack roda local via Docker. Integrações externas (GLPI, WhatsApp) precisam de conectividade. |
| "Como eu adiciono um campo novo no formulário?" | Editor visual drag-and-drop em **Formulários → Criador**. Suporta texto, número, seleção, data, arquivo e campos condicionais. |
| "Posso ter dois aprovadores em sequência?" | O modelo atual suporta um aprovador por step. Múltiplos steps sequenciais estão no roadmap. |
| "Como integro com o nosso ERP?" | Via conector REST configurável em **Integrações → Conectores**, ou adicionando uma ação de fluxo que chama um webhook. |
| "Os dados são seguros?" | Tokens armazenados criptografados (AES-256-GCM), senhas com bcrypt (fator 12), auditoria imutável de todas as ações. |
