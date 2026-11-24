# Aurora Flow

Motor de automações de propósito geral do **Aurora Ecosystem**.

Aurora Flow é um produto independente, derivado de uma cópia autorizada do Tijuca Flow. O ciclo 02 desacopla o núcleo de automações dos domínios de formulários e processos corporativos, isola a infraestrutura operacional e reduz a superfície de ataque.

## O que o produto faz

- Editor visual de automações (React Flow)
- Gatilhos de webhook e agendamento
- Ações de e-mail, HTTP, notificação, WhatsApp, Google Sheets, subfluxo e conectores HTTP genéricos
- Histórico de execuções, fila (RabbitMQ com fallback inline), credenciais de integração e monitoramento
- Validação de grafos no backend: nós descontinuados de formulário/processo não podem ser salvos nem executados

Integrações futuras com outros produtos (por exemplo Aurora Forms) devem ocorrer por **APIs, eventos e webhooks**, sem acoplamento de código. Contrato de entrada: `backend/src/modules/integrations/platform-boundaries.ts`.

## Requisitos

- Node.js 20+
- npm 10+
- Docker e Docker Compose (PostgreSQL e RabbitMQ locais)

## Setup rápido

```bash
cd aurora-flow

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Editar backend/.env: JWT_ACCESS_SECRET e JWT_REFRESH_SECRET (mínimo 32 caracteres)
# GOOGLE_TOKEN_ENCRYPTION_KEY: deixe vazio sem OAuth Google; se preencher, use Base64 de 32+ bytes

docker compose --profile app up -d postgres rabbitmq

npm --prefix backend install
npm --prefix backend run migration:run

npm --prefix backend run start:dev

# em outro terminal
npm --prefix frontend install
npm --prefix frontend run dev
```

Portas e identificadores são configuráveis por ambiente (`API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `RABBITMQ_PORT`, `DB_NAME`, `RABBITMQ_FLOW_SUBMISSION_QUEUE`). Não é necessário alterar código-fonte.

Na primeira execução em **desenvolvimento** o backend cria um administrador local:

- E-mail: `admin@aurora-flow.local`
- Senha: valor de `SEED_ADMIN_PASSWORD` (exemplo local em `.env.example`)

Altere essa senha após o primeiro acesso. Em **produção** o seed **não** usa senha padrão: defina `SEED_ADMIN_PASSWORD` ou provisione o administrador por outro meio.

## Serviços locais (padrão do ciclo 02)

| Serviço | URL / porta |
|---|---|
| API REST | http://localhost:3010/api/v1 |
| Swagger (não-produção) | http://localhost:3010/api/v1/docs |
| Frontend | http://localhost:5174 |
| PostgreSQL | localhost:5434 (`aurora_flow` / `aurora_flow`) |
| RabbitMQ AMQP | localhost:5674 |
| RabbitMQ Management | http://localhost:15674 |

Projeto Compose: `aurora-flow`. Containers, rede e volumes usam o prefixo `aurora-flow` / `aurora_flow`. Não reutilize bancos, containers ou volumes do Tijuca Flow ou do Aurora Forms.

## Comandos

| Comando | Descrição |
|---|---|
| `npm --prefix backend run start:dev` | API em watch |
| `npm --prefix backend run build` | Build da API |
| `npm --prefix backend test` | Testes unitários |
| `npm --prefix backend run test:integration` | Integração HTTP (Postgres isolado `aurora_flow_test`) |
| `npm --prefix backend run lint` | ESLint |
| `npm --prefix frontend run dev` | Vite |
| `npm --prefix frontend run build` | Build do frontend |
| `npm --prefix frontend test` | Vitest |
| `npm --prefix frontend run lint` | ESLint |

## Documentação

Caminhos usam `Docs/` (compatível com Windows e Linux).

### Ciclo 02

| Documento | Conteúdo |
|---|---|
| [Docs/cycle-02/security-audit.md](Docs/cycle-02/security-audit.md) | Auditoria de segurança |
| [Docs/cycle-02/dependency-map.md](Docs/cycle-02/dependency-map.md) | Mapa de dependências do motor |
| [Docs/cycle-02/architecture-decisions.md](Docs/cycle-02/architecture-decisions.md) | Decisões arquiteturais |
| [Docs/cycle-02/implementation-report.md](Docs/cycle-02/implementation-report.md) | O que foi implementado |
| [Docs/cycle-02/validation-report.md](Docs/cycle-02/validation-report.md) | Testes e evidências |
| [Docs/cycle-02/remaining-technical-debt.md](Docs/cycle-02/remaining-technical-debt.md) | Pendências e riscos |

### Ciclo 01

| Documento | Conteúdo |
|---|---|
| [Docs/cycle-01/architecture-baseline.md](Docs/cycle-01/architecture-baseline.md) | Arquitetura herdada e classificação de módulos |
| [Docs/cycle-01/extraction-plan.md](Docs/cycle-01/extraction-plan.md) | Plano de extração |
| [Docs/cycle-01/implementation-report.md](Docs/cycle-01/implementation-report.md) | Extração e rebrand |
| [Docs/cycle-01/validation-report.md](Docs/cycle-01/validation-report.md) | Testes do ciclo 01 |

## Fora da superfície do produto

- App mobile de preenchimento de formulários (`mobile/`)
- Serviço `erp-lookup` (profile Docker `legacy`)
- Construtor de formulários, kanban e solicitações — código interno isolado, HTTP e paleta desativados; o backend recusa os nós correspondentes

Este diretório não deve receber `git push` para o repositório original do Tijuca Flow.
