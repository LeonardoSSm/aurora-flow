# Ciclo 02 — Dívida técnica remanescente

## Schema e entidades

TypeORM ainda mapeia formulários, submissões, solicitações, kanban, aprovações, item lists, dashboards. Uma instalação limpa cria essas tabelas vazias via migrations históricas.

**Estratégia futura:** nova baseline (`Docs/` + migration squash) após o último ambiente derivado ter migrado. Risco: instâncias que ainda tenham dados de processo na mesma base (não é o caso de uma instalação Aurora Flow nova). Compatibilidade: leitura da cadeia antiga até o squash.

## Engine

Métodos `executeMovePhase`, `executeCreateApproval`, LOPS IA, etc. permanecem no arquivo do engine. Proteção: allowlist. Remoção física no ciclo 03 reduz superfície de revisão.

## Frontend

Módulos `forms`, `public-form`, `solicitations`, `kanban-phases`, `builder` ainda existem; rotas redirecionam. Bundles de admin ainda puxam APIs kanban em chunks lazy. Não é redesign: extração de pastas no ciclo 03.

## Ajuda e Docs antigos

Arquivos em `Docs/` com vocabulário FormHub / plataforma de formulários. Artigos in-app (`frontend/src/modules/admin/docs`, `help`) misturam o produto antigo. Não apagados para não destruir histórico de produto.

## Observabilidade

Dashboards Grafana podem ainda referir `formhub_*`. Prefixos de métricas de código: `aurora_flow_*`. Alinhar painéis no próximo ciclo.

## erp-lookup e mobile

Profile Docker `legacy` / `erp-dev` e pasta `mobile/` no repositório. Isolados; não sobem no profile `app`.

## Testes de domínio morto

Specs skipadas em vez de deletadas, para auditoria. Limpar arquivos no ciclo 03 quando o código correspondente sair.

## CI audit

`npm audit --omit=dev --audit-level=high` com `continue-on-error`. Tornar bloqueante exige triagem de CVEs.

## Segredos locais

`backend/.env` gitignored pode ainda ter placeholders da origem. Rotacionar na máquina do desenvolvedor. Sem force-push / filter-repo neste ciclo.
