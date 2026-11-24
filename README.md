# Aurora Flow

Motor de automações de propósito geral do **Aurora Ecosystem**.

Aurora Flow é um produto independente, derivado de uma cópia autorizada do Tijuca Flow. O ciclo 01 preserva o editor visual e o motor de execução de fluxos, e retira da superfície do produto o domínio de formulários, solicitações, kanban e particularidades corporativas da instância original.

## O que o produto faz

- Editor visual de automações (React Flow)
- Gatilhos de webhook e agendamento
- Ações de e-mail, HTTP, notificação, WhatsApp, Google Sheets, subfluxo e conectores HTTP genéricos
- Histórico de execuções, fila (RabbitMQ com fallback), credenciais de integração e monitoramento

Integrações futuras com outros produtos (por exemplo Aurora Forms) devem ocorrer por **APIs, eventos e webhooks**, sem acoplamento de código.

## Requisitos

- Node.js 20+
- npm 10+
- Docker e Docker Compose (PostgreSQL e RabbitMQ locais)

## Setup rápido

```bash
cd aurora-flow

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Editar backend/.env: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# GOOGLE_TOKEN_ENCRYPTION_KEY: deixe vazio sem OAuth Google; se preencher, use Base64 de 32+ bytes

docker compose --profile app up -d postgres rabbitmq

npm --prefix backend install
npm --prefix backend run migration:run

npm --prefix backend run start:dev

# em outro terminal
npm --prefix frontend install
npm --prefix frontend run dev
```

Na primeira execução o backend cria um administrador local:

- E-mail: `admin@aurora-flow.local`
- Senha: `AuroraFlow@123`

Altere essa senha após o primeiro acesso. Não use estas credenciais fora de ambiente local.

## Serviços locais

| Serviço | URL |
|---|---|
| API REST | http://localhost:3000/api/v1 |
| Swagger (não-produção) | http://localhost:3000/api/v1/docs |
| Frontend | http://localhost:5173 |
| PostgreSQL | localhost:5432 |
| RabbitMQ Management | http://localhost:15672 |

Os nomes de usuário/banco no `docker-compose.yml` ainda refletem a origem da cópia (`formhub`). São credenciais **locais de desenvolvimento**, não de produção.

Se a porta 5432 já estiver ocupada por outro Postgres, use outra porta no `.env` (`DB_PORT`) e um container isolado. Não aponte esta cópia para bancos corporativos.

## Comandos

| Comando | Descrição |
|---|---|
| `npm --prefix backend run start:dev` | API em watch |
| `npm --prefix backend run build` | Build da API |
| `npm --prefix backend test` | Testes unitários |
| `npm --prefix backend run test:integration` | Integração HTTP (Postgres local `formhub_test`) |
| `npm --prefix backend run lint` | ESLint |
| `npm --prefix frontend run dev` | Vite |
| `npm --prefix frontend run build` | Build do frontend |
| `npm --prefix frontend test` | Vitest |
| `npm --prefix frontend run lint` | ESLint |

## Documentação do ciclo 01

| Documento | Conteúdo |
|---|---|
| [docs/cycle-01/architecture-baseline.md](docs/cycle-01/architecture-baseline.md) | Arquitetura herdada e classificação de módulos |
| [docs/cycle-01/extraction-plan.md](docs/cycle-01/extraction-plan.md) | Plano de extração |
| [docs/cycle-01/implementation-report.md](docs/cycle-01/implementation-report.md) | O que foi feito |
| [docs/cycle-01/validation-report.md](docs/cycle-01/validation-report.md) | Testes e evidências |

## Fora deste produto

- App mobile de preenchimento de formulários e aprovações (`mobile/`)
- Serviço `erp-lookup` (listas de ERP em campos de formulário)
- Construtor de formulários, kanban e solicitações — código interno isolado, HTTP desativado

Este diretório não deve receber `git push` para o repositório original do Tijuca Flow.
