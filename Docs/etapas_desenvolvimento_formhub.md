# Etapas de Desenvolvimento - FormHub

## Etapa 0 - Alinhamento (concluída)
- Leitura completa dos documentos:
  - `padronizacao_plataforma_formularios.md`
  - `requisitos_funcionais_detalhados_plataforma_formularios.md`
  - `modelagem_banco_dados_plataforma_formularios.md`
- Leitura do protótipo (`FormHubPrototipo.zip`) e definição do design base.
- Decisão de stack obrigatória: **ReactJs + NestJs + PostgreSQL**.

## Etapa 1 - Fundação Técnica (iniciada nesta entrega)
- Monorepo com `frontend` e `backend`.
- `docker-compose.yml` com PostgreSQL 16.
- Backend NestJS com:
  - autenticação JWT (`/auth/login`);
  - módulos iniciais (`users`, `forms`, `responses`, `audit`);
  - entidades centrais de domínio (forms, versions, sections, fields, submissions, audit).
- Frontend React com:
  - rotas principais (login, dashboard, formulários, builder, respostas);
  - layout inspirado no protótipo (paleta e tipografia);
  - integração com API (login + listagem/criação de formulário + leitura de respostas).

## Etapa 2 - MVP Funcional
- RF prioritários:
  - RF-01, RF-05 a RF-11, RF-13, RF-14, RF-17, RF-21, RF-25, RF-27, RF-31.
- Entregáveis:
  - CRUD de formulário completo (incluindo edição);
  - publicação por link único;
  - submissão pública;
  - exportação CSV;
  - trilha de auditoria consultável.

## Etapa 3 - Consolidação de Produto
- Versionamento robusto (RF-15 + RF-32).
- Lógica condicional (RF-12).
- Templates (RF-29).
- Dashboard operacional real com agregações de banco.

## Etapa 4 - Governança e Escala
- Controle de escopo por área/unidade (RF-36).
- Segurança avançada (rate limit por formulário público, antifraude básico RF-24).
- Políticas de retenção e classificação de dados sensíveis (LGPD).

## Etapa 5 - Diferenciação
- Webhooks e integrações.
- Automações.
- Recursos avançados de analytics.
