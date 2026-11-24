# Visao Geral do Sistema FormHub

Este documento lista, em topicos, os principais recursos, modulos, telas, APIs, entidades e configuracoes existentes no sistema FormHub.

## 1. Objetivo do Sistema

O FormHub e uma plataforma para criacao, gestao, publicacao e acompanhamento de formularios.

O sistema permite:

- Criar formularios estruturados por secoes e campos.
- Versionar formularios a cada alteracao.
- Publicar formularios para preenchimento publico.
- Receber respostas publicas.
- Consultar e exportar respostas.
- Gerenciar usuarios e permissoes.
- Acompanhar indicadores em dashboard.
- Registrar eventos de auditoria.

## 2. Stack Tecnologica

### Backend

- NestJS.
- TypeScript.
- TypeORM.
- PostgreSQL.
- JWT para autenticacao.
- Passport JWT.
- Swagger/OpenAPI.
- Helmet para headers de seguranca.
- Nest Throttler para rate limiting.
- Class Validator e ValidationPipe para validacao de entrada.
- Jest e Supertest para testes.

### Frontend

- React.
- TypeScript.
- Vite.
- React Router DOM.
- Axios.
- Tailwind CSS.
- Vitest e Testing Library.

### Banco e Infraestrutura

- PostgreSQL 16 via Docker Compose.
- Container local `formhub-postgres`.
- Volume Docker persistente `formhub_pg_data`.
- API local em `http://localhost:3000/api`.
- Frontend local em `http://localhost:5173`.

## 3. Estrutura Principal do Repositorio

- `backend/`: API NestJS.
- `frontend/`: aplicacao React.
- `Docs/`: documentacao funcional, modelagem e etapas do projeto.
- `docker-compose.yml`: banco PostgreSQL local.
- `README.md`: instrucoes basicas de execucao, testes e build.

## 4. Modulos do Backend

### Auth

Responsavel pela autenticacao e sessao.

Recursos:

- Login com email e senha.
- Geracao de `accessToken`.
- Geracao de `refreshToken`.
- Renovacao de token.
- Endpoint para retornar o usuario autenticado.
- Protecao por JWT.
- Estrategia separada para access token e refresh token.

Endpoints:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Users

Responsavel pela administracao de usuarios.

Recursos:

- Listagem paginada de usuarios.
- Busca de usuario por ID.
- Criacao de usuario.
- Atualizacao de usuario.
- Desativacao de usuario por soft delete.
- Seed automatico de usuario administrador no startup.
- Normalizacao de email antes de inserir ou atualizar.
- Retorno via DTO sem `passwordHash`.

Endpoints:

- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

Controle de acesso:

- Todas as rotas de usuarios exigem perfil `admin`.

### Forms

Responsavel pela gestao de formularios.

Recursos:

- Criacao de formulario.
- Atualizacao de formulario com criacao de nova versao.
- Listagem paginada com filtros.
- Busca por ID.
- Alteracao de status.
- Duplicacao de formulario.
- Arquivamento por soft delete.
- Consulta publica de formulario publicado.
- Organizacao por secoes, campos e opcoes.
- Registro de auditoria em acoes relevantes.

Endpoints autenticados:

- `GET /api/forms`
- `GET /api/forms/:id`
- `POST /api/forms`
- `PATCH /api/forms/:id`
- `PATCH /api/forms/:id/status`
- `POST /api/forms/:id/duplicate`
- `DELETE /api/forms/:id`

Endpoint publico:

- `GET /api/public/forms/:id`

Controle de acesso:

- Listar e visualizar formularios exige usuario autenticado.
- Criar, atualizar e duplicar exige `admin`, `manager` ou `editor`.
- Alterar status e arquivar exige `admin` ou `manager`.
- Consulta publica nao exige login, mas possui rate limit mais restrito.

### Responses

Responsavel pelo recebimento e consulta de respostas.

Recursos:

- Submissao publica de resposta.
- Validacao contra formulario publicado.
- Armazenamento de respostas por campo.
- Listagem paginada de respostas por formulario.
- Detalhe de uma resposta.
- Exportacao CSV.
- Registro de auditoria na exportacao.

Endpoints:

- `POST /api/responses/submit`
- `GET /api/responses/form/:formId`
- `GET /api/responses/form/:formId/export`
- `GET /api/responses/:id`

Controle de acesso:

- Submissao publica nao exige login e possui rate limit de 10 envios por minuto por IP.
- Listar e detalhar respostas exige `admin`, `manager`, `editor` ou `viewer`.
- Exportar CSV exige `admin` ou `manager`.

### Dashboard

Responsavel por indicadores resumidos da plataforma.

Recursos:

- Estatisticas resumidas.
- Filtro por termo de busca.
- Dados para cards de KPI, tendencias e submisssoes recentes no frontend.

Endpoint:

- `GET /api/dashboard/stats`

Controle de acesso:

- Exige usuario autenticado.

### Audit

Responsavel pelo registro e consulta de eventos de auditoria.

Recursos:

- Registro de eventos com ator, modulo, entidade, acao e payload.
- Listagem paginada.
- Filtros por modulo, acao, ator e periodo.

Endpoint:

- `GET /api/audit`

Controle de acesso:

- Exige perfil `admin`.

## 5. Perfis de Usuario

O sistema possui quatro perfis:

- `admin`: administracao geral, usuarios, auditoria e operacoes sensiveis.
- `manager`: gestao de formularios, status, arquivamento e exportacao.
- `editor`: criacao, edicao e duplicacao de formularios.
- `viewer`: consulta de formularios e respostas onde permitido.

## 6. Autenticacao e Seguranca

Recursos existentes:

- Autenticacao JWT.
- Access token e refresh token.
- Guards de autenticacao.
- Guard de autorizacao por perfil.
- Decorator `@Roles`.
- Decorator `@CurrentUser`.
- `passwordHash` com `select: false` na entidade de usuario.
- DTO de resposta de usuario para evitar retorno direto da entidade sensivel.
- Helmet habilitado globalmente.
- CORS configuravel por variavel de ambiente.
- Prefixo global `/api`.
- Swagger habilitado fora de producao.
- ValidationPipe global com:
  - `whitelist: true`
  - `transform: true`
  - `forbidNonWhitelisted: true`
- Rate limit global de 100 requisicoes por minuto por IP.
- Rate limits especificos para endpoints publicos.

## 7. Integracao Google

O modelo de usuario possui campos relacionados a conexao Google:

- `googleAccountEmail`
- `googleRefreshToken`
- `googleConnectedAt`
- `googleDisconnectedAt`
- `googleLastUsedAt`

O DTO de resposta de usuario expõe dados de status da conexao:

- `googleAccountEmail`
- `googleConnectionStatus`
- `googleConnectedAt`
- `googleDisconnectedAt`
- `googleLastUsedAt`

Status possiveis:

- `configured`
- `connected`
- `disconnected`

Observacao: no codigo atual ha campos de dados Google na entidade e no DTO, mas nao ha um modulo completo de OAuth Google listado entre os modulos principais.

## 8. Modelo de Dados

### users

Representa usuarios da plataforma.

Campos principais:

- `id`
- `fullName`
- `email`
- `passwordHash`
- `role`
- `isActive`
- dados de conexao Google
- `lastLoginAt`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Um usuario pode criar varios formularios.
- Um usuario pode ser ator de varios eventos de auditoria.

### forms

Representa o formulario principal.

Campos principais:

- `id`
- `name`
- `description`
- `status`
- `category`
- `area`
- `createdBy`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Pertence a um usuario criador.
- Possui varias versoes.
- Possui varias submisssoes.

Status possiveis:

- `draft`
- `published`
- `paused`
- `expired`
- `archived`

### form_versions

Representa uma versao de formulario.

Campos principais:

- `id`
- `formId`
- `versionNumber`
- `titleDisplay`
- `descriptionDisplay`
- `isPublished`
- `publishedAt`
- `settingsJson`
- `createdAt`

Relacionamentos:

- Pertence a um formulario.
- Possui secoes.
- Pode estar ligada a submisssoes.

### form_sections

Representa uma secao dentro de uma versao de formulario.

Campos principais:

- `id`
- `formVersionId`
- `title`
- `description`
- `order`

Relacionamentos:

- Pertence a uma versao.
- Possui campos.

### form_fields

Representa um campo dentro de uma secao.

Campos principais:

- `id`
- `formVersionId`
- `sectionId`
- `code`
- `label`
- `fieldType`
- `order`
- `required`
- `settingsJson`

Tipos de campo:

- `short_text`
- `long_text`
- `number`
- `date`
- `time`
- `email`
- `phone`
- `cpf`
- `cnpj`
- `single_select`
- `multi_select`
- `checkbox`
- `file_upload`
- `scale`
- `rating`
- `title`
- `description`
- `divider`

### form_field_options

Representa opcoes de campos seletivos.

Campos principais:

- `id`
- `fieldId`
- `internalValue`
- `displayLabel`
- `order`

### submissions

Representa uma resposta enviada.

Campos principais:

- `id`
- `formId`
- `formVersionId`
- `status`
- `responderName`
- `responderEmail`
- `submittedAt`
- `submitterIp`
- `submitterUserAgent`
- `createdAt`

Status possiveis:

- `in_progress`
- `submitted`
- `edited`
- `invalidated`
- `canceled`

Observacao:

- `submitterIp` e `submitterUserAgent` usam `select: false`.

### submission_items

Representa o valor respondido para cada campo.

Campos principais:

- `id`
- `submissionId`
- `fieldId`
- `fieldCode`
- `valueText`
- `valueNumber`
- `valueBoolean`
- `valueJson`

### audit_events

Representa evento de auditoria.

Campos principais:

- `id`
- `actorId`
- `module`
- `entity`
- `entityId`
- `action`
- `payload`
- `createdAt`

## 9. Telas e Rotas do Frontend

### Rotas publicas

- `/login`: tela de login.
- `/f/:formId`: formulario publico.
- `/public/formulario/:formId`: rota alternativa para formulario publico.

### Rotas autenticadas

- `/dashboard`: dashboard com indicadores.
- `/formularios`: gestao/listagem de formularios.
- `/builder`: construtor de formulario.
- `/respostas`: consulta de respostas.
- `/administracao`: area administrativa.

### Rotas administrativas

- `/administracao/visao-geral`
- `/administracao/usuarios`
- `/administracao/permissoes`
- `/administracao/auditoria`
- `/administracao/configuracoes`

### Layout

O frontend possui:

- `AppShell`.
- Menu lateral.
- Barra superior.
- Controle de autenticacao por `RequireAuth`.
- Contexto de autenticacao.
- Interceptor Axios para tratar `401`.

## 10. Modulos do Frontend

### Auth

- Tela de login.
- Painel visual de marca.
- Card de formulario de login.
- Hook para controle do formulario de login.
- Contexto de autenticacao.

### Dashboard

- Visao geral.
- Grid de KPIs.
- Tendencia de respostas.
- Submissoes recentes.
- Hook para carregamento dos dados.

### Forms

- Tela de listagem de formularios.
- Toolbar de filtros e acoes.
- Tabela de formularios.
- Servico de API para formularios.
- Hook de gerenciamento.

### Builder

- Tela de construcao de formulario.
- Editor de rascunho.
- Lista de campos disponiveis.
- Toolbar do construtor.
- Preview ao vivo.
- Preview da estrutura do formulario.
- Mapeamento de rascunho para payload de criacao.

Tipos disponiveis no builder:

- Texto curto.
- Texto longo.
- E-mail.
- Numero.
- Data.
- Selecao unica.
- Multipla selecao.
- Checkbox.
- Upload de arquivo.

### Public Form

- Tela publica de preenchimento.
- Renderizacao de perguntas.
- Hook para carregar formulario publico e enviar resposta.
- Servico de API publico.

### Responses

- Tela de exploracao de respostas.
- Toolbar de filtros.
- Lista de respostas.
- Formatadores de resposta.
- Servico de API para respostas.

### Admin

- Layout administrativo.
- Visao geral.
- Usuarios.
- Permissoes.
- Auditoria.
- Configuracoes.
- Navegacao entre submodulos.
- Cards de funcionalidades administrativas.
- Hooks para usuarios, auditoria e overview.

### UI Compartilhada

- Button.
- Card.
- Field.
- SectionHeader.
- ToastProvider.
- Utilitario `cn`.

## 11. Configuracoes de Ambiente

Backend usa variaveis como:

- `NODE_ENV`
- `PORT`
- `API_PREFIX`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SYNC`
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_SECRET`
- `JWT_REFRESH_EXPIRES_IN`
- `CORS_ORIGIN`

Frontend usa:

- `VITE_API_URL`, com fallback para `http://localhost:3000/api`.

## 12. Documentacao e Swagger

O backend expõe Swagger em ambiente diferente de producao.

URL local:

- `http://localhost:3000/api/docs`

O Swagger inclui:

- Titulo `FormHub API`.
- Descricao da API.
- Versao `1.0`.
- Bearer Auth JWT.
- Persistencia da autorizacao na interface.

## 13. Testes

### Backend

Scripts:

- `npm test`: testes unitarios.
- `npm run test:watch`: testes em modo watch.
- `npm run test:integration`: testes de integracao HTTP.

Arquivos existentes:

- Testes de controller/app.
- Testes do servico de autenticacao.
- Setup de integracao.
- Spec de integracao da API.

### Frontend

Scripts:

- `npm test`: Vitest.
- `npm run test:watch`: Vitest em modo watch.

Arquivos existentes:

- Testes de componentes UI.
- Teste do utilitario `cn`.
- Setup de testes com Testing Library.

## 14. Scripts de Desenvolvimento

### Backend

- `npm run clean`
- `npm run build`
- `npm run start`
- `npm run start:dev`
- `npm run start:prod`
- `npm run lint`
- `npm run format`
- `npm test`
- `npm run test:integration`
- `npm run migration:generate`
- `npm run migration:run`
- `npm run migration:revert`
- `npm run migration:show`

### Frontend

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm test`
- `npm run test:watch`

## 15. Fluxos Principais

### Login

1. Usuario informa email e senha.
2. Backend valida senha com hash.
3. Backend retorna access token, refresh token e dados do usuario.
4. Frontend armazena token no contexto de autenticacao.
5. Axios passa a enviar `Authorization: Bearer <token>`.

### Criacao de formulario

1. Usuario acessa o builder.
2. Define nome, descricao, categoria e area.
3. Cria secoes.
4. Adiciona campos.
5. Define obrigatoriedade e opcoes quando aplicavel.
6. Frontend envia payload para `POST /api/forms`.
7. Backend cria formulario e primeira versao.

### Atualizacao de formulario

1. Usuario edita formulario existente.
2. Frontend envia novo payload para `PATCH /api/forms/:id`.
3. Backend cria uma nova versao para preservar historico.

### Publicacao e preenchimento

1. Usuario autorizado altera status do formulario para publicado.
2. Respondente acessa rota publica.
3. Frontend busca formulario publicado.
4. Respondente preenche campos.
5. Frontend envia resposta para `POST /api/responses/submit`.
6. Backend grava submissao e itens de resposta.

### Consulta e exportacao de respostas

1. Usuario autenticado acessa a area de respostas.
2. Sistema lista respostas por formulario.
3. Usuario autorizado pode exportar CSV.
4. Backend registra auditoria da exportacao.

### Administracao

1. Admin acessa area administrativa.
2. Pode consultar visao geral, usuarios, permissoes, auditoria e configuracoes.
3. Rotas criticas sao protegidas por perfil.

## 16. Estado Atual Observado

Com base no codigo atual:

- O backend esta modularizado em Auth, Users, Forms, Responses, Dashboard e Audit.
- O frontend possui telas para login, dashboard, formularios, builder, respostas, formulario publico e administracao.
- O banco usa entidades TypeORM e sincronizacao configuravel por `DB_SYNC`.
- Ha controle de acesso por JWT e perfis.
- Ha documentacao Swagger.
- Ha testes unitarios e de integracao configurados.
- Ha campos de integracao Google no usuario, mas nao ha fluxo OAuth Google completo implementado nos modulos listados.
