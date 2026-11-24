# Ciclo 01 — Relatório de implementação

## Identidade

- Pacotes: `aurora-flow`, `aurora-flow-backend`, `aurora-flow-frontend`
- Brand ativo: `frontend/src/brand/aurora`
- Swagger: Aurora Flow API
- Constantes: `backend/src/common/constants/product.ts`

## Extração da superfície

- Router: rotas de formulário/kanban/solicitações redirecionam para `/inicio` ou `/flows`
- Menu e Início: só automações
- Paleta do editor: webhook, agendamento, condições genéricas, comunicação, integrações, subfluxo
- Controllers HTTP de formulários e processos esvaziados
- Seed de demo desativado (HTTP 410)
- Modo simplificado (“criar processo”) removido do shell
- Realtime de solicitações desligado no AppShell
- `flows.view` / `flows.manage` no catálogo de sistema; listagem de fluxos respeita o perfil

## Preservado

- Motor de fluxos, fila, webhooks, notificações, Google, ERP admin, WhatsApp
- Editor visual, teste de fluxo, histórico de execuções
- Auth JWT, convites, papéis, áreas, auditoria, settings (org/segurança/integrações)

## Isolado (não removido do disco)

- Módulos NestJS de forms/solicitations/kanban/approvals e entidades TypeORM
- Nós de processo no engine (execução possível se um grafo legado os contiver)
- `mobile/`, `erp-lookup/`, artigos de ajuda de formulário
- Prefixo Prometheus `formhub_*` e nomes Docker `formhub-*`

## Fronteira de integração

`backend/src/modules/integrations/platform-boundaries.ts` documenta eventos/webhooks já existentes para o ecossistema.

## Ajustes de boot neste ciclo

- TypeORM CLI: glob `migrations/*{.ts,.js}` em `data-source.ts` (antes `*.js` ignorava as migrations TypeScript).
- `.env.example`: `GOOGLE_TOKEN_ENCRYPTION_KEY` vazio por padrão; valor inválido impedia o Nest de subir.

## Git

Não há `.git` nesta pasta. Nenhum remote foi configurado. Nenhum push foi realizado.

## Validação

Ver `docs/cycle-01/validation-report.md`: lint e build verdes; 2566 testes backend e 1243 frontend; API local criou e testou um fluxo; `GET /forms` retorna 404.
