# Ciclo 02 — Auditoria de segurança

**Repositório:** Aurora Flow (`cycle/02-architectural-decoupling`)  
**Baseline:** `a1437a7932696de148a8a15d518da8e74d3fca8c`  
**Escopo:** arquivos rastreados, configurações, documentação, migrations, seeds e histórico Git acessível.  
**Regra:** valores secretos não são reproduzidos neste relatório.

## Resumo

Não foram encontradas chaves privadas, certificados PEM ou `.env` rastreados no Git. Há **segredos de desenvolvimento versionados como placeholders** (JWT de exemplo, senhas Docker locais) e **referências corporativas residuais** em código legado inativo. Produção não usa mais senha de administrador universal: o seed exige `SEED_ADMIN_PASSWORD` quando `NODE_ENV=production`.

## Credenciais e tokens

| Localização | Natureza | Ação |
|---|---|---|
| `backend/.env.example` | Placeholders de JWT, senha de seed, senhas Docker (`aurora_flow`) | Trocar em qualquer ambiente compartilhado. Não usar os valores de exemplo fora da máquina local. |
| `docker-compose.yml` | Senhas padrão de Postgres, RabbitMQ, Grafana, pgAdmin | Apenas desenvolvimento. Sobrescrever por variáveis de ambiente. |
| `backend/src/common/constants/product.ts` | Senha de seed **somente** em não-produção | Produção retorna `null` sem `SEED_ADMIN_PASSWORD`. |
| Arquivo local `backend/.env` (não rastreado, `.gitignore`) | Pode conter placeholders herdados do produto anterior | Rotacionar JWT e senhas se este arquivo já foi usado contra qualquer serviço compartilhado. **Não versionar.** |
| `observability/prometheus/metrics_token` | Ignorado pelo Git | Manter fora do repositório. |

Não há evidência de tokens de API corporativos reais no histórico acessível desta cópia. Caso alguém tenha copiado um `.env` de produção para esta árvore no passado, isso ficaria só na máquina local — **revogar e rotacionar** se houver dúvida.

## Superfície de ataque reduzida neste ciclo

- Nós de formulário/processo recusados na API (`FlowNodeDto` + `ENABLED_FLOW_NODE_TYPES`) e no motor (`flow-capabilities.ts`).
- SSRF em HTTP de saída: `backend/src/common/security/outbound-url.guard.ts` (webhook real e `action_http_check`). `HTTP_ALLOW_PRIVATE_URLS=true` só para testes/local.
- JWT de acesso e refresh exigem **mínimo de 32 caracteres** (`env.validation.ts`).
- Cookie de refresh: `aurora_flow_refresh`.
- Assinatura de webhook: `X-Aurora-Flow-Signature` / `x-aurora-flow-signature` (alias GitHub `x-hub-signature-256`). Cabeçalho legado `x-formhub-signature` removido.
- Logs Pino: redaction de `authorization`, cookies, senhas, tokens Google, `apiKey`, `signingSecret`.
- Rotas HTTP de formulário público: 404 (confirmado em integração).
- Permissões de processo: sem `ProcessAccessService` no produto, códigos de processo são **negados**.

## Autenticação, cookies e autorização

- Login JWT + refresh cookie HttpOnly.
- `PermissionsGuard` usa permissões de papel; domínio de processo é opcional e desligado.
- Fluxos exigem `flows.view` / `flows.manage`. Sem token: 401 (integração).
- Webhooks inbound públicos: token de endpoint + HMAC opcional.

## Produção

- `SEED_ADMIN_PASSWORD` obrigatório para seed; senha de desenvolvimento **não** é aplicada.
- Health check alerta se produção subir sem admin provisionado (`health.controller.ts`).
- `DB_SYNC` não deve ser `true` em produção (já documentado no `.env.example`).
- Swagger permanece desligado em produção (ciclo 01).

## Identidade visual e dados corporativos residuais

- Documentação antiga em `Docs/` ainda descreve a plataforma de formulários (histórico, não apagado).
- Testes e código de módulos **não importados** ainda usam e-mails fictícios `@formhub.local` e menções a domínio corporativo em specs de OAuth.
- `erp-lookup` (profile `legacy`) e `mobile/` permanecem no repositório, fora da superfície.

## Dependências privadas

Nenhuma dependência npm privada da infraestrutura original foi identificada nos `package.json` rastreados.

## Verificação heurística de segredos

Comando (CI e local):

```bash
git ls-files | grep -E '(^|/)\.env$|(^|/)\.env\.local$|\.pem$|id_rsa'
```

Resultado esperado: vazio. Job `secrets` em `.github/workflows/ci.yml`.
