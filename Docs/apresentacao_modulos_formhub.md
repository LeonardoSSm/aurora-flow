# Apresentação dos Módulos do FormHub

## 1. Visão geral

O **FormHub** é um hub corporativo de processos orientado por formulários inteligentes. A plataforma permite que áreas como RH, TI, Financeiro, Logística e Operações criem formulários, recebam submissões, transformem respostas em solicitações rastreáveis e automatizem etapas de trabalho com aprovações, integrações externas e acompanhamento por dashboards.

A proposta do sistema é centralizar o ciclo completo:

1. **Criar formulários inteligentes** com campos dinâmicos, seções, versionamento e regras.
2. **Publicar formulários** para captação de dados interna ou externa.
3. **Receber respostas** de forma estruturada.
4. **Transformar respostas em solicitações** acompanháveis por status, SLA e histórico.
5. **Executar fluxos automáticos** com aprovações, notificações e integrações.
6. **Integrar com sistemas externos**, como Google Sheets, GLPI, WhatsApp, webhooks e ERP.
7. **Acompanhar operação** com dashboards, Kanban, auditoria, observabilidade e relatórios.

## 2. Perfis de usuário

O controle de acesso é baseado em papéis:

| Perfil | Papel no sistema |
|---|---|
| **Admin** | Acesso total, administração de usuários, áreas, permissões, auditoria, configurações e integrações críticas. |
| **Manager** | Gerencia formulários, respostas, solicitações, integrações operacionais e acompanhamento da área/equipe. |
| **Editor** | Cria e edita formulários, acompanha respostas e opera fluxos dentro do escopo permitido. |
| **Viewer** | Acesso de consulta a formulários, respostas e informações permitidas. |

O frontend filtra parte da navegação por perfil, e o backend reforça a segurança por JWT, guards e validações de papel.

## 3. Módulos de autenticação e acesso

### Autenticação

O módulo de autenticação permite:

- Login local com e-mail e senha.
- Login principal via Google Workspace.
- Refresh token em cookie seguro.
- Proteção de rotas autenticadas.
- Identificação do usuário logado.
- Revogação de sessão no logout.

### Google Workspace

O Google Workspace é usado para:

- Login corporativo com restrição de domínio.
- Conexão da conta Google do usuário.
- Criação de planilhas no Google Sheets.
- Sincronização assíncrona de respostas.

O sistema armazena tokens Google de forma criptografada e mantém informações de status, última conexão, conta vinculada e último uso.

## 4. Módulo de Dashboard

O Dashboard é a visão executiva e operacional do sistema.

Ele consolida:

- Total de formulários.
- Formulários publicados.
- Volume total de respostas.
- Respostas dos últimos 30 dias.
- Tendência de submissões.
- Submissões recentes.
- Indicadores operacionais por status.

Esse módulo ajuda gestores a entenderem volume, uso da plataforma e evolução das coletas sem abrir cada formulário individualmente.

## 5. Módulo de Formulários

O módulo de Formulários é o catálogo principal da plataforma.

Funcionalidades:

- Listagem paginada de formulários.
- Busca por nome, categoria, área e status.
- Filtros por status.
- Edição de formulários existentes.
- Duplicação.
- Publicação.
- Pausa, expiração e arquivamento.
- Controle de responsável atribuído.
- Exibição de criador, responsável, versão e contagem de respostas.

Status principais:

| Status | Significado |
|---|---|
| **Rascunho** | Formulário em construção ou edição. |
| **Publicado** | Disponível para recebimento de respostas. |
| **Pausado** | Temporariamente indisponível para novos envios. |
| **Expirado** | Encerrado por ciclo ou regra operacional. |
| **Arquivado** | Retirado da operação ativa. |

O módulo respeita escopo por usuário, papel e atribuição, permitindo que usuários vejam formulários criados por eles ou atribuídos a eles, conforme as regras do backend.

## 6. Módulo Criador de Formulários

O Criador é o ambiente visual para construir formulários.

Ele organiza a criação em etapas:

1. **Configurações**: nome, descrição, categoria, área, responsável e modo do formulário.
2. **Campos**: criação de seções e perguntas.
3. **Integrações**: configuração de Google Workspace e Google Sheets.
4. **Preview**: validação visual antes da publicação.

Tipos de campo suportados:

- Texto curto e longo.
- Número.
- Data e hora.
- E-mail.
- Telefone.
- CPF e CNPJ.
- Seleção única.
- Múltipla seleção.
- Checkbox.
- Upload de arquivo.
- Escala.
- Avaliação.
- Título, descrição e divisor.

O formulário possui versionamento. Assim, alterações podem gerar novas versões sem perder o histórico de versões anteriores.

## 7. Formulário público e captação de dados

O módulo público permite que respondentes preencham formulários sem acessar a área administrativa.

Rotas públicas:

- `/f/:formId`
- `/public/formulario/:formId`

Recursos disponíveis ao respondente:

- Identidade visual da empresa.
- Nome, descrição, categoria e área do formulário.
- Identificação opcional com nome/e-mail.
- Campos obrigatórios.
- Validações por tipo de campo.
- Upload de arquivos, quando configurado.
- Formulário em página única ou multi-etapas.
- Proteção anti-bot, quando habilitada.

Após o envio, a resposta é persistida no backend e pode disparar sincronizações, fluxos e solicitações.

## 8. Módulo de Respostas

O módulo de Respostas concentra a consulta das submissões recebidas.

Funcionalidades:

- Seleção de formulário.
- Listagem de respostas paginadas.
- Busca por respondente ou conteúdo visível.
- Visualização das respostas por campo.
- Atualização manual da listagem.
- Exportação CSV.
- Suporte backend a exportação XLSX e PDF.

Esse módulo é usado para análise detalhada das coletas e conferência operacional das respostas enviadas.

## 9. Google Sheets e sincronização

A integração com Google Sheets conecta formulários a planilhas corporativas.

Funcionalidades:

- Conectar e desconectar conta Google.
- Habilitar Google Sheets por formulário.
- Criar planilha automaticamente ao salvar.
- Criar planilha manualmente.
- Abrir planilha vinculada.
- Gerar cabeçalhos automaticamente.
- Sincronizar respostas como novas linhas.
- Reenfileirar sincronização.
- Reprocessar respostas.
- Controlar jobs em fila, processamento, concluídos e falhos.
- Registrar último erro e último sync.

O fluxo é assíncrono: uma resposta enviada gera um job, e o worker de sincronização envia os dados para a planilha.

## 10. Solicitações e ciclo de vida operacional

O módulo de Solicitações transforma respostas e demandas em itens operacionais acompanháveis.

Ele organiza:

- Solicitações por status.
- Histórico de movimentações.
- SLA.
- Responsáveis.
- Anexos.
- Eventos de integração.
- Acompanhamento por token público.

Esse módulo é a ponte entre a coleta de dados via formulário e a execução real do processo interno.

## 11. Kanban

O Kanban oferece uma visão visual das solicitações.

Principais usos:

- Acompanhar solicitações por etapa.
- Mover cards entre colunas permitidas.
- Ver gargalos operacionais.
- Identificar itens próximos ou fora do SLA.
- Apoiar times que trabalham por fila.

O Kanban complementa a lista tradicional de solicitações, oferecendo uma leitura mais rápida do estado do processo.

## 12. Aprovações

O módulo de Aprovações permite decisões humanas dentro dos processos.

Funcionalidades:

- Criação de aprovação vinculada a uma solicitação.
- Etapas sequenciais.
- Responsável por etapa.
- Aprovar ou rejeitar com comentário.
- Cancelamento de aprovação.
- Consulta de aprovações pendentes do usuário.
- Histórico auditável de decisões.

Esse módulo é usado quando o fluxo exige validação humana antes de avançar.

## 13. Fluxos e automações

O módulo de Fluxos é o motor visual de automação do FormHub.

Ele permite criar fluxos com:

- Gatilhos.
- Condições.
- Ações.
- Nós conectados visualmente.
- Histórico de execução.
- Teste de fluxo.

Exemplos de uso:

- Ao submeter um formulário, criar uma solicitação.
- Se o campo "valor" for maior que determinado limite, criar aprovação.
- Enviar notificação.
- Acionar webhook.
- Registrar evento ou integrar com sistemas externos.

O backend executa os fluxos e pode usar fila RabbitMQ. Quando a fila não está disponível, há fallback inline para reduzir perda de processamento.

## 14. Integrações externas

O FormHub possui um conjunto de integrações para conectar processos internos a ferramentas externas.

### Webhooks

Permitem receber ou enviar eventos HTTP.

Recursos:

- Endpoints configuráveis.
- Entregas com status.
- Consulta de eventos.
- Retry em falhas.
- Registro de payloads para auditoria.

### GLPI

Integra solicitações e eventos com ambiente ITSM.

Uso típico:

- Criar ticket a partir de solicitação.
- Sincronizar status.
- Registrar retorno da ferramenta externa.

### WhatsApp

Permite envio de mensagens via provider configurável.

Providers previstos:

- Mock local.
- Evolution API.

Uso típico:

- Notificar solicitante.
- Alertar aprovadores.
- Comunicar mudanças de status.

### ERP

O módulo de ERP permite administrar conectores para sistemas internos.

Recursos:

- Cadastro de conectores.
- Teste de conexão.
- Tipos de autenticação.
- Refresh de token.
- Logs de integração.
- Fila de retry.
- Alertas quando autenticação falha.

Esse módulo é voltado para integração com sistemas corporativos protegidos e operações internas.

## 15. Administração

O módulo de Administração reúne capacidades de governança.

Submódulos:

- **Visão geral administrativa**: cartões de recursos e estado geral.
- **Usuários**: criação, edição, desativação e perfis.
- **Áreas**: organização por departamento ou unidade.
- **Permissões**: visualização e alteração de papéis.
- **Auditoria**: histórico de eventos críticos.
- **Configurações**: parâmetros gerais da plataforma.
- **Observabilidade**: métricas e sinais operacionais.
- **Ferramentas**: rotinas administrativas restritas.
- **ERP**: administração de conectores ERP.

Esse módulo é direcionado principalmente a administradores e gestores.

## 16. Áreas organizacionais

Áreas representam unidades internas como RH, TI, Financeiro, Compras ou Logística.

Elas ajudam a:

- Segmentar formulários.
- Filtrar visibilidade.
- Organizar solicitações.
- Distribuir responsabilidades.
- Facilitar governança por departamento.

O uso de áreas reduz necessidade de permissões por item individual e simplifica a operação para empresas de médio porte.

## 17. Auditoria

A auditoria registra eventos relevantes do sistema.

Eventos auditáveis incluem:

- Login.
- Conexão Google.
- Criação e alteração de formulários.
- Mudança de status.
- Submissão de respostas.
- Exportações.
- Criação e atualização de usuários.
- Decisões de aprovação.
- Eventos de integração.

O objetivo é permitir rastreabilidade, segurança e investigação operacional.

## 18. Observabilidade e saúde

O sistema possui suporte a observabilidade em múltiplas camadas.

Recursos:

- Health checks da API.
- Métricas Prometheus.
- Dashboard Grafana provisionado.
- Métricas de banco via TypeORM logger.
- Métricas de fila e integrações.
- Indicação de admin seed em ambiente local.
- Painel administrativo de observabilidade.

Essa camada ajuda a acompanhar disponibilidade, performance e falhas em integrações.

## 19. Relatórios e analytics

Os módulos de relatórios e analytics apoiam leitura consolidada dos dados.

Eles podem ser usados para:

- Agregar respostas.
- Criar indicadores por formulário.
- Apoiar exportações.
- Alimentar dashboards.
- Gerar relatórios operacionais.

Junto com Dashboard e Respostas, esses módulos formam a camada analítica da plataforma.

## 20. Arquitetura funcional

O FormHub é composto por:

- **Frontend React + Vite**: interface do usuário, rotas, formulários, dashboards e editores visuais.
- **Backend NestJS**: API REST, autenticação, regras de negócio, integrações e processamento.
- **PostgreSQL**: persistência relacional de usuários, formulários, respostas, solicitações e auditoria.
- **RabbitMQ**: fila para processamento assíncrono de fluxos e integrações.
- **Google APIs**: OAuth, Sheets e Drive.
- **Prometheus/Grafana**: métricas e observabilidade.

O fluxo técnico central é:

1. Usuário cria formulário no frontend.
2. Backend salva formulário, versões, seções e campos.
3. Formulário é publicado.
4. Respondente envia dados pela rota pública.
5. Backend valida a resposta contra a versão publicada.
6. A resposta gera eventos.
7. Eventos podem disparar sync Google Sheets, fluxo, solicitação, aprovação, webhook ou integração.
8. Auditoria e métricas registram a operação.

## 21. Fluxos principais de uso

### Criação de formulário

1. Usuário acessa **Formulários** ou **Novo Formulário**.
2. Abre o **Criador**.
3. Configura dados básicos.
4. Adiciona seções e campos.
5. Revisa no preview.
6. Salva.
7. Publica.

### Captação de dados

1. Respondente acessa link público.
2. Preenche o formulário.
3. Envia resposta.
4. Sistema persiste submissão.
5. Resposta aparece em **Respostas** e nos indicadores.

### Automação de processo

1. Resposta gera evento.
2. Fluxo configurado recebe o gatilho.
3. Condições são avaliadas.
4. Ações são executadas.
5. Solicitações, aprovações, notificações ou integrações são criadas.

### Acompanhamento operacional

1. Gestor acessa Dashboard.
2. Analisa KPIs e tendência.
3. Acompanha Solicitações ou Kanban.
4. Verifica aprovações pendentes.
5. Consulta auditoria e logs em caso de falha.

## 22. Benefícios para a operação

- Centraliza formulários e processos.
- Reduz planilhas manuais e retrabalho.
- Aumenta rastreabilidade de solicitações.
- Permite automação sem depender sempre de código.
- Integra dados com Google Sheets e sistemas externos.
- Facilita auditoria e governança.
- Dá visibilidade para gestores via Dashboard e Kanban.
- Apoia expansão futura por módulos.

## 23. Situação geral dos módulos

| Grupo | Módulos | Papel principal |
|---|---|---|
| Acesso e governança | Auth, Users, Roles, Areas, Audit, Admin | Segurança, permissões e rastreabilidade. |
| Formulários | Forms, Builder, Public Form, Responses | Criação, publicação, captação e análise de respostas. |
| Processos | Solicitations, Kanban, Approvals, Automations, Flows | Execução e automação do trabalho. |
| Integrações | Google Workspace, Webhooks, GLPI, WhatsApp, ERP, Connectors | Comunicação com sistemas externos. |
| Dados e gestão | Dashboard, Analytics, Reports | Indicadores, exportações e leitura executiva. |
| Plataforma | Health, Observability, Queue, Storage, Attachments, Settings | Infraestrutura operacional e suporte técnico. |

## 24. Mensagem de apresentação

O FormHub não é apenas um criador de formulários. Ele funciona como uma plataforma de processos corporativos: coleta informações, estrutura dados, cria solicitações, executa automações, integra sistemas, registra auditoria e oferece visão operacional para tomada de decisão.

Essa arquitetura permite começar com casos simples, como pesquisas e formulários internos, e evoluir para processos completos, como solicitações de compra, chamados de TI, aprovações financeiras, onboarding, checklists operacionais e integrações com ERPs.

