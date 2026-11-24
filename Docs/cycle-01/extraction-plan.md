# Ciclo 01 — Plano de extração

## Decisão principal

Não reescrever o motor de execução neste ciclo. Remover a **superfície** de formulários e promover fluxos a permissão de plataforma. Manter o domínio interno (entidades, serviços, nós de processo) **desativado via HTTP** até um ciclo posterior poder extraí-lo sem regressão.

Justificativa: `FlowExecutionEngine` e `FlowsService` acoplam-se a solicitações, fases, aprovações e submissões. Extração imediata desses serviços quebraria execução, testes e o grafo persistido.

## Superfície a preservar

- Lista e editor visual de fluxos
- Execução, histórico, teste, DLQ
- Webhooks, agendamento, e-mail, HTTP, notificações, WhatsApp, Google Sheets, ERP HTTP genérico
- Auth, usuários, papéis, áreas, auditoria, configurações, observabilidade

## Superfície a desativar

- Rotas e páginas de formulários, builder, registros, kanban, solicitações, aprovações externas, painéis, listas de itens, formulário público
- Controllers NestJS desses módulos (`controllers: []`)
- Seed de demo de processos/formulários (`POST /admin/seed/demo` → 410)
- App mobile e `erp-lookup` fora do produto (pastas permanecem no disco)

## Rebranding

- Produto: Aurora Flow
- Admin semente: `admin@aurora-flow.local` / `AuroraFlow@123` (somente local)
- `org.name` padrão: Aurora Flow
- API health: `aurora-flow-backend`

## Permissões

`flows.view` e `flows.manage` deixam de ser permissões de vínculo com processo e passam a ser de **sistema** (perfil). Sem isso, ninguém veria fluxos sem `form_members`.

## Integrações futuras

Reusar webhooks de entrada, ação HTTP e fila. Sem stubs de Aurora Forms neste ciclo.

## Riscos aceitos neste ciclo

- Tabelas e código de formulário continuam no schema e no compile
- Nós de processo ainda existem no tipo e no engine; só saíram da paleta
- Nomes Docker/`formhub_*` nas métricas
- Documentação de ajuda ainda contém artigos de formulário (manual legado)
- Cookie de refresh e métricas Prometheus ainda usam o prefixo `formhub_*` (contrato operacional; troca exige ciclo dedicado)

## Execução do plano

A extração de superfície foi aplicada: HTTP de formulários vazio, rotas SPA redirecionadas, brand Aurora, permissões de fluxo no catálogo de sistema. O domínio interno permanece compilado.
