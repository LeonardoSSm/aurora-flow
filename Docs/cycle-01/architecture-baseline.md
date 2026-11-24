# Ciclo 01 — Baseline de arquitetura

Data: 2026-11-24  
Pasta: `E:\Desenvolvimento\aurora-flow`  
Git: **não há repositório Git nesta pasta** (sem remotes). O trabalho permanece isolado localmente.

## Origem

Cópia autorizada do Tijuca Flow / FormHub: plataforma NestJS + React que unia **formulários inteligentes**, **solicitações/kanban** e um **motor de fluxos visuais**.

## Stack

| Camada | Tecnologia |
|---|---|
| API | NestJS 10, TypeORM, PostgreSQL 16, RabbitMQ, JWT |
| Frontend | React 18, Vite, TanStack Query, `@xyflow/react` |
| Mobile | Expo (fora do escopo Aurora Flow) |
| Observabilidade | Prometheus / Grafana (opcional) |

## Motor de automações (essencial)

- Módulo `backend/src/modules/flows`
- Entidades `flows`, `flow_executions`
- Editor `frontend/src/modules/flows` (canvas, biblioteca de nós, teste, histórico)
- Gatilhos genéricos: `trigger_webhook_received`, `trigger_scheduled`
- Ações genéricas: e-mail, webhook, HTTP check, notificação, WhatsApp, Google Sheets, subfluxo
- Fila: `queue/` (RabbitMQ, fallback inline)
- Integrações: `integrations/` (webhooks in/out), `google-workspace/`, `notifications/`

## Plataforma compartilhada

Auth, users, roles, areas, settings, audit, storage, health, observability, crypto.

## Domínio de formulários (dispensável na superfície)

Forms, responses, solicitations, kanban-phases, approvals, automations (regras JSON), connectors por formulário, analytics, dashboards, records, reports, process access, attachments, realtime, item-lists, standard-questions, public forms, AI builder de processos.

O motor de fluxos **ainda importa** esse domínio internamente (nós de processo, listeners, `form_id`). No ciclo 01 isso foi **isolado**, não reescrito.

## Corporativo / Tijuca

- Branding Tijuca Alimentos, e-mail `admin@tijucaalimentos.com`, `org.name` Tijuca Flow
- `erp-lookup`, hosts `appstijuca.com.br`, LOPS IA, validador de rótulos
- Prefixo de métricas `formhub_*`, containers Docker `formhub-*`

## Testes na baseline

Suítes existentes: Jest unitário (`backend`), Vitest (`frontend`), Jest integração HTTP contra Postgres. Centenas de testes de formulário/kanban. Integração dependia do admin Tijuca e de rotas de formulário.

Após o ciclo 01 (reexecução local): **2566** testes unitários backend e **1243** frontend passando. Integração HTTP não foi reexecutada neste ambiente (ver `validation-report.md`).
