# erp-lookup

API interna que consulta o banco do ERP (MySQL) para os campos "Lista do ERP" dos formulários do
Tijuca Flow. Só o backend do Tijuca fala com ela. Plano completo:
[Docs/campo_lista_erp_plano.md](../Docs/campo_lista_erp_plano.md).

## Endpoints

| Método | Caminho | Auth | Retorno |
|---|---|---|---|
| GET | `/` | Bearer | `{ status: "ok" }` (o "Testar conexão" do conector; com token errado acusa 401) |
| GET | `/health` | não | `{ status: "ok", db: "ok" \| "down" \| "nao_configurado" }` |
| GET | `/fontes` | Bearer | `[{ id, label, modo }]` |
| GET | `/fontes/:fonte?q=texto&limit=20` | Bearer | `{ items: [{ value, label }] }` |
| GET | `/fontes/:fonte/item?value=123` | Bearer | `{ value, label }` ou 404 |
| GET | `/fontes/:fonte/detalhes?value=123` | Bearer | Ficha do item pronta para exibir, ou 404 (`ITEM_NAO_ENCONTRADO` / `SEM_DETALHES`) |
| GET | `/fontes/:fonte/tabelas` | Bearer | `[{ id, label, parametros, colunas, chaveLinha, maxLinhas }]` (vazia se a lista não tem tabelas) |
| GET | `/fontes/:fonte/tabelas/:tabela?pedidoId=123` | Bearer | `{ versao: 1, tabela, consultadoEm, linhas: [{ chave, valores }] }` com valores tipados; 404 `TABELA_NAO_EXISTE` / `ITEM_NAO_ENCONTRADO`, 400 parâmetro ausente/inválido/desconhecido, 502 `TABELA_INVALIDA` (chave vazia ou repetida no ERP) |

Banco fora → `503 { code: "BANCO_INDISPONIVEL" }`. Banco não configurado → `503 { code: "BANCO_NAO_CONFIGURADO" }`.
404 traz `code`: `ITEM_NAO_ENCONTRADO` (o código não existe na lista) ou `LISTA_NAO_EXISTE`
(configuração errada no Tijuca) — o backend trata os dois de forma diferente.

## Rodar no Docker (como em produção)

O serviço `erp-lookup` do `docker-compose.yml` lê as variáveis `ERP_LOOKUP_*` do `.env` da raiz:

```
ERP_LOOKUP_API_TOKEN=          # openssl rand -hex 32 (mesmo valor do conector no Tijuca)
ERP_LOOKUP_DB_HOST=            # IP/host do MySQL do ERP
ERP_LOOKUP_DB_PORT=3306
ERP_LOOKUP_DB_NAME=tijuca_lookup
ERP_LOOKUP_DB_USER=tijuca_lookup
ERP_LOOKUP_DB_PASSWORD=
```

Sem essas variáveis o container sobe "não configurado" e responde 503 nas consultas: não derruba
nem trava o resto do `docker compose --profile app up`.

## Desenvolver sem tocar no ERP real

```bash
# MySQL falso (dev/seed.sql roda sozinho na primeira subida), na porta 3307 do host
docker compose --profile erp-dev up -d erp-mysql-dev

# Testes
cd erp-lookup
npm test                   # unitários
npm run test:integration   # contra o MySQL do erp-dev

# API rodando fora do Docker: copie .env.example para .env e descomente o bloco do erp-dev
npm run start:dev
```

Para recriar o MySQL de dev do zero (roda o seed de novo):
`docker compose --profile erp-dev rm -s -f -v erp-mysql-dev`.

## Criar uma lista

1. **Antes de tudo, combinar com o dono do projeto** os dados da lista (tabela, código, texto
   exibido, colunas pesquisáveis, filtros, ordem). Ver "Como definir uma lista" no plano.
2. No MySQL do ERP, criar a view em `tijuca_lookup` com as colunas `value`, `label` e `busca`.
3. Registrar em [src/fontes/fontes.config.ts](src/fontes/fontes.config.ts) com `ViewFonte`.
4. Deploy só deste serviço: `docker compose --profile app up -d --build erp-lookup`.
