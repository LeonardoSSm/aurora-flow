# Resumo Geral e Visao Futura do FormHub

Este documento consolida a visao geral do FormHub, suas capacidades atuais e a direcao futura para evoluir a plataforma para um ambiente completo de formularios, automacoes, aprovacoes, kanban operacional, integracoes e observabilidade.

## 1. Visao Geral

O FormHub e uma plataforma para criacao, publicacao, gestao e acompanhamento de formularios digitais, com foco em processos internos, solicitacoes operacionais, governanca, rastreabilidade e integracao com outros sistemas.

A plataforma nasceu como um sistema de formularios, mas sua evolucao natural e se tornar um hub de processos: formularios capturam dados, fluxos automatizam decisoes e acoes, aprovacoes organizam o trabalho humano, integracoes conectam sistemas externos e dashboards permitem acompanhar a operacao.

## 2. Capacidades Atuais

### Formularios

O sistema permite criar e gerenciar formularios estruturados.

Recursos existentes:

- Criacao de formularios com nome, descricao, categoria e area.
- Organizacao por secoes.
- Campos configuraveis por tipo.
- Versionamento de formularios.
- Publicacao de formularios para preenchimento publico.
- Controle de status do formulario.
- Duplicacao e arquivamento de formularios.
- Visualizacao e preenchimento por link publico.
- Validacao de campos no envio da resposta.
- Suporte a regras de visibilidade de campos.

Tipos de campos suportados ou previstos na modelagem:

- Texto curto.
- Texto longo.
- Numero.
- Data.
- Hora.
- Email.
- Telefone.
- CPF.
- CNPJ.
- Selecao unica.
- Multipla selecao.
- Checkbox.
- Upload de arquivo.
- Escala.
- Avaliacao.
- Titulo.
- Descricao.
- Divisor.

### Respostas e Submissoes

O sistema recebe e armazena respostas enviadas por formularios publicados.

Recursos existentes:

- Submissao publica de respostas.
- Validacao contra a versao publicada do formulario.
- Armazenamento dos valores por campo.
- Registro de dados do respondente.
- Consulta de respostas por formulario.
- Exportacao de respostas.
- Suporte a chave de idempotencia para evitar duplicidade de envios.
- Eventos internos disparados apos submissao.

### Usuarios, Perfis e Permissoes

O FormHub possui controle de acesso por usuario autenticado e perfil.

Perfis principais:

- `admin`: administracao geral da plataforma.
- `manager`: gestao operacional, formularios e respostas.
- `editor`: criacao e edicao de formularios.
- `viewer`: consulta de informacoes permitidas.

Recursos existentes:

- Login com JWT.
- Refresh token.
- Guards de autenticacao.
- Guards por perfil.
- Administracao de usuarios.
- Controle de permissoes por modulo/rota.

### Administracao

A area administrativa concentra recursos de governanca.

Recursos existentes:

- Visao geral administrativa.
- Gestao de usuarios.
- Gestao de permissoes.
- Configuracoes da plataforma.
- Auditoria.
- Parametros do sistema.

### Auditoria

O sistema registra eventos relevantes para rastreabilidade.

Recursos existentes:

- Registro de ator.
- Modulo afetado.
- Entidade afetada.
- Acao executada.
- Payload contextual.
- Consulta paginada e filtravel.

### Dashboard e Analytics

O FormHub possui visoes de indicadores operacionais.

Recursos existentes:

- Dashboard com KPIs.
- Indicadores de formularios.
- Indicadores de respostas.
- Tendencias.
- Submissoes recentes.
- Tela de analytics por formulario.

### Google Workspace

O sistema possui base de integracao com Google Workspace.

Recursos existentes ou em desenvolvimento:

- Conexao OAuth com Google.
- Criptografia de tokens.
- Sincronizacao com Google Sheets.
- Jobs de sincronizacao.
- Administracao de sincronizacoes.
- Limpeza de jobs antigos.

### Conectores e Integracoes

O sistema possui estrutura para conectores.

Recursos existentes ou em desenvolvimento:

- Conectores por formulario.
- Conector REST API.
- Conector Webhook.
- DTOs para configuracao de conectores.
- Listagem e gestao de conectores.
- Execucao associada a eventos de resposta.

### Automacoes

O sistema possui um modulo de automacoes baseado em regras.

Recursos existentes:

- Regras por formulario.
- Condicoes por campos.
- Acoes de automacao.
- Historico de execucoes.
- Envio de email.
- Webhook.
- Notificacao interna de usuarios.

### Fluxos Visuais

O sistema possui um editor visual de fluxos.

Recursos existentes:

- Tela de listagem de fluxos.
- Editor visual baseado em nos e conexoes.
- Gatilho de formulario submetido.
- Condicao por valor de campo.
- Condicao sempre verdadeira.
- Acao de envio de email.
- Acao de webhook.
- Acao de notificacao de usuarios.
- Acao de Google Sheets exposta na interface.
- Salvamento de canvas, posicao dos nos e viewport.
- Historico de execucoes.
- Execucao por evento de resposta submetida.
- Execucao via RabbitMQ com fallback inline.

Observacao importante:

- Algumas acoes de fluxo ainda precisam de consolidacao para ficarem totalmente produtivas, especialmente Google Sheets e notificacoes reais dentro do fluxo visual.

### Filas e Processamento Assincrono

O projeto possui base de fila com RabbitMQ.

Recursos existentes:

- RabbitMQ via Docker Compose.
- Publicacao de jobs para processamento de fluxos.
- Consumer para execucao de fluxos.
- Fila duravel.
- Dead letter queue.
- Prefetch configuravel.
- Fallback de execucao inline quando RabbitMQ estiver indisponivel.

### Observabilidade

O sistema possui uma camada inicial de observabilidade.

Recursos existentes:

- Endpoint Prometheus da API.
- Metricas HTTP.
- Metricas de requisicoes em andamento.
- Metricas de RabbitMQ na API.
- Metricas de queries e queries lentas na API.
- Postgres exporter.
- RabbitMQ Prometheus plugin.
- Prometheus.
- Grafana.
- Dashboard inicial do FormHub.

## 3. Arquitetura Atual

### Backend

Stack principal:

- NestJS.
- TypeScript.
- TypeORM.
- PostgreSQL.
- EventEmitter.
- RabbitMQ.
- Prometheus metrics.
- Swagger/OpenAPI.
- JWT.
- Pino/NestJS logger.

Principais modulos:

- Auth.
- Users.
- Forms.
- Responses.
- Dashboard.
- Analytics.
- Audit.
- Roles.
- Settings.
- Google Workspace.
- Connectors.
- Automations.
- Flows.
- Queue.
- Observability.
- Health.

### Frontend

Stack principal:

- React.
- TypeScript.
- Vite.
- React Router.
- TanStack Query.
- Axios.
- Tailwind CSS.
- React Flow.
- Vitest.

Principais areas:

- Login.
- Dashboard.
- Formularios.
- Builder.
- Respostas.
- Automacoes.
- Conectores.
- Fluxos.
- Administracao.
- Formulario publico.

### Infraestrutura Local

Servicos previstos no Docker Compose:

- PostgreSQL.
- RabbitMQ.
- Postgres exporter.
- Prometheus.
- Grafana.

## 4. Visao de Produto

A visao futura do FormHub e evoluir de uma plataforma de formularios para uma plataforma de processos digitais.

Nessa visao:

- Formularios capturam dados.
- Fluxos decidem o que fazer com esses dados.
- Aprovacoes organizam decisoes humanas.
- Kanban mostra o estado operacional das solicitacoes.
- Integracoes enviam e recebem dados de outros sistemas.
- Notificacoes mantem usuarios e equipes informados.
- Observabilidade mostra saude, performance e gargalos.

## 5. Visao Futura de Fluxos de Automacao

O editor de fluxos deve se tornar o centro de orquestracao do FormHub.

### Gatilhos Futuros

Hoje o principal gatilho e o envio de formulario. A visao futura inclui variados gatilhos:

- Formulario submetido.
- Formulario aprovado.
- Formulario reprovado.
- Solicitacao criada.
- Solicitacao movida no kanban.
- Solicitacao aprovada em uma etapa.
- Solicitacao reprovada em uma etapa.
- Campo alterado.
- Prazo vencido.
- Agendamento por data/hora.
- Webhook recebido de sistema externo.
- Evento vindo de GLPI.
- Evento vindo de ERP.
- Evento vindo de Google Sheets.
- Evento manual disparado por usuario.
- Evento de integracao concluida.
- Evento de erro de integracao.

### Condicoes Futuras

As condicoes devem permitir que fluxos tomem decisoes com base nos dados do processo.

Condicoes previstas:

- Valor de campo igual/diferente.
- Campo vazio/nao vazio.
- Campo contem texto.
- Comparacao numerica.
- Comparacao de datas.
- Status da solicitacao.
- Etapa atual no kanban.
- Perfil do solicitante.
- Area ou unidade do solicitante.
- Resultado de aprovacao.
- Retorno de webhook.
- Retorno de GLPI.
- Retorno de ERP.
- Existencia de anexo.
- Prioridade da solicitacao.
- SLA vencido ou proximo do vencimento.

### Acoes Futuras

As acoes devem cobrir comunicacao, integracao, dados, workflow e aprovacao.

Acoes previstas:

- Enviar email.
- Enviar mensagem WhatsApp.
- Enviar notificacao interna.
- Criar chamado no GLPI.
- Atualizar chamado no GLPI.
- Consultar status no GLPI.
- Chamar webhook externo.
- Enviar dados para API REST.
- Atualizar Google Sheets.
- Criar solicitacao interna.
- Atualizar status da solicitacao.
- Mover card no kanban.
- Criar etapa de aprovacao.
- Solicitar aprovacao para usuario/grupo.
- Aprovar automaticamente conforme regra.
- Reprovar automaticamente conforme regra.
- Gerar registro de auditoria.
- Criar tarefa operacional.
- Atribuir responsavel.
- Enviar mensagem para fila.
- Reexecutar integracao.
- Encerrar fluxo.

## 6. Kanban de Aprovacoes e Solicitacoes

A visao futura inclui um kanban operacional para acompanhar solicitacoes geradas por formularios, fluxos ou integracoes.

### Objetivo

O kanban deve representar o estado real das solicitacoes e aprovacoes dentro da organizacao.

Exemplos de colunas:

- Nova solicitacao.
- Em analise.
- Aguardando aprovacao.
- Aprovado.
- Reprovado.
- Em execucao.
- Aguardando integracao.
- Concluido.
- Cancelado.

### Origem dos Cards

Um card pode ser criado por:

- Envio de formulario.
- Gatilho de fluxo.
- Webhook externo.
- Integracao com GLPI.
- Integracao com ERP.
- Criacao manual por usuario.
- Agendamento recorrente.

### Informacoes do Card

Cada card deve exibir:

- Numero da solicitacao.
- Titulo.
- Formulario de origem.
- Solicitante.
- Responsavel atual.
- Status.
- Prioridade.
- SLA.
- Etapa atual.
- Aprovadores pendentes.
- Ultima atualizacao.
- Indicador de erro de integracao.

### Aprovacoes no Kanban

As aprovacoes devem aparecer dentro do fluxo operacional.

Exemplos:

- Um formulario de compra cria uma solicitacao.
- O fluxo identifica que o valor e maior que um limite.
- O fluxo cria uma etapa de aprovacao para o gestor.
- O card aparece na coluna `Aguardando aprovacao`.
- O gestor aprova ou reprova.
- O resultado dispara novas acoes no fluxo.
- Se aprovado, o fluxo pode criar chamado no GLPI, enviar email, chamar ERP ou mover o card.
- Se reprovado, o fluxo pode notificar o solicitante e encerrar a solicitacao.

## 7. Solicitacoes

A solicitacao deve ser a entidade operacional que conecta formulario, fluxo, aprovacao, kanban e integracoes.

Capacidades previstas:

- Criar solicitacao a partir de formulario.
- Criar solicitacao manual.
- Criar solicitacao por webhook.
- Vincular solicitacao a uma submissao.
- Vincular solicitacao a um fluxo.
- Vincular solicitacao a aprovacoes.
- Vincular solicitacao a chamados GLPI.
- Vincular solicitacao a registros externos.
- Registrar historico completo.
- Registrar anexos.
- Registrar comentarios.
- Registrar responsaveis.
- Registrar SLA.
- Registrar status e etapa.

## 8. Aprovacoes

O modulo de aprovacoes deve permitir decisoes humanas e automaticas dentro dos fluxos.

Capacidades previstas:

- Aprovacao simples por usuario.
- Aprovacao por grupo.
- Aprovacao sequencial.
- Aprovacao paralela.
- Aprovacao por maioria.
- Aprovacao por limite de valor.
- Aprovacao por area/unidade.
- Delegacao de aprovacao.
- Comentario obrigatorio em reprovacao.
- Anexo em aprovacao.
- Historico de decisoes.
- Auditoria de cada decisao.
- Disparo de eventos apos aprovar/reprovar.

## 9. Webhooks e Integracoes

O FormHub deve funcionar tanto como consumidor quanto como emissor de eventos.

### Webhooks de Saida

Usados para avisar sistemas externos sobre eventos internos.

Eventos possiveis:

- Formulario submetido.
- Solicitacao criada.
- Solicitacao aprovada.
- Solicitacao reprovada.
- Card movido no kanban.
- Integracao concluida.
- Integracao com erro.

Recursos desejados:

- Headers customizados.
- Assinatura HMAC.
- Retentativas.
- Dead letter.
- Historico de entregas.
- Reenvio manual.
- Mascaramento de dados sensiveis.

### Webhooks de Entrada

Usados para receber eventos de outros sistemas.

Exemplos:

- GLPI informa atualizacao de chamado.
- ERP informa pedido criado.
- Sistema externo cria solicitacao.
- Sistema externo aprova ou reprova uma etapa.

Recursos desejados:

- URL unica por conector.
- Token de autenticacao.
- Validacao de assinatura.
- Mapeamento de payload.
- Transformacao de dados.
- Criacao ou atualizacao de solicitacao.
- Disparo de fluxo a partir do evento recebido.

## 10. Comunicacoes e Notificacoes

O FormHub deve centralizar comunicacoes relacionadas aos processos.

Canais previstos:

- Email.
- WhatsApp.
- Notificacao interna.
- GLPI.
- Webhook.
- Futuramente Microsoft Teams ou Slack, se necessario.

Exemplos:

- Notificar solicitante sobre aprovacao.
- Notificar aprovador sobre pendencia.
- Enviar resumo por email.
- Enviar alerta WhatsApp para urgencias.
- Criar comentario no GLPI.
- Avisar sistema externo por webhook.
- Notificar dentro do FormHub no painel do usuario.

## 11. Integracao com GLPI

A integracao com GLPI deve permitir que solicitacoes do FormHub virem chamados ou atualizem chamados existentes.

Capacidades previstas:

- Criar chamado no GLPI a partir de formulario ou solicitacao.
- Atualizar chamado quando card mudar de etapa.
- Receber status do chamado.
- Vincular numero do chamado ao card.
- Encerrar solicitacao quando chamado for concluido.
- Notificar solicitante sobre mudancas.
- Registrar erros de integracao.
- Permitir reprocessamento manual.

## 12. Integracao com WhatsApp

A integracao com WhatsApp deve permitir comunicacao operacional com solicitantes, aprovadores e responsaveis.

Capacidades previstas:

- Enviar mensagem ao solicitante.
- Enviar mensagem para aprovador.
- Enviar alerta de SLA.
- Enviar resumo da solicitacao.
- Enviar link para aprovacao.
- Registrar status de envio.
- Registrar falhas.
- Usar templates aprovados quando necessario.

## 13. Integracao com Outros Sistemas

O FormHub deve oferecer conectores para sistemas internos e externos.

Tipos de integracao:

- REST API.
- Webhook.
- Banco de dados, quando permitido.
- Google Sheets.
- GLPI.
- ERP.
- Sistemas legados.
- Filas de mensagens.

Recursos desejados:

- Mapeamento de campos.
- Transformacao de payload.
- Autenticacao por token, basic auth, OAuth ou chave.
- Logs de execucao.
- Retentativas.
- Timeout configuravel.
- Tratamento de erro.
- Reprocessamento manual.
- Monitoramento por dashboard.

## 14. Observabilidade Futura

A observabilidade deve evoluir junto com automacoes e integracoes.

Metricas desejadas:

- Quantidade de formularios enviados.
- Tempo medio de processamento de fluxo.
- Falhas por tipo de acao.
- Falhas por conector.
- Tempo de resposta de webhooks.
- Tamanho das filas RabbitMQ.
- Tempo em cada etapa do kanban.
- SLA vencido.
- Aprovacoes pendentes.
- Taxa de erro por integracao.

Logs desejados:

- `flowId`.
- `executionId`.
- `submissionId`.
- `requestId`.
- `nodeId`.
- `nodeType`.
- `integrationId`.
- `status`.
- `durationMs`.

Dashboards desejados:

- Saude da API.
- Saude do banco.
- Saude do RabbitMQ.
- Execucoes de fluxos.
- Erros de integracao.
- SLA de solicitacoes.
- Volume de formularios.
- Volume de aprovacoes.

## 15. Roadmap Sugerido

### Fase 1 - Consolidar Fluxos Atuais

- Corrigir status de execucao quando um no falhar.
- Implementar notificacoes internas reais no fluxo visual.
- Implementar ou ocultar temporariamente Google Sheets no fluxo visual.
- Validar multiplos gatilhos.
- Criar validacao backend de `nodes` e `edges`.
- Criar testes backend do motor de fluxos.

### Fase 2 - Solicitacoes e Kanban

- Criar entidade de solicitacao.
- Criar historico de solicitacao.
- Criar kanban operacional.
- Vincular formulario enviado a uma solicitacao.
- Permitir movimentacao manual e automatica.
- Registrar auditoria de mudancas.

### Fase 3 - Aprovacoes

- Criar entidade de aprovacao.
- Criar etapas de aprovacao.
- Criar UI para aprovar/reprovar.
- Integrar aprovacao com kanban.
- Permitir fluxos aguardarem aprovacao.
- Disparar eventos apos decisao.

### Fase 4 - Novos Gatilhos

- Gatilho por solicitacao criada.
- Gatilho por card movido.
- Gatilho por aprovacao concluida.
- Gatilho por webhook recebido.
- Gatilho por SLA vencido.
- Gatilho manual.

### Fase 5 - Integracoes Avancadas

- Webhooks de entrada.
- Webhooks de saida com assinatura e retentativa.
- GLPI.
- WhatsApp.
- ERP.
- Google Sheets consolidado.
- Painel de execucoes de integracao.

### Fase 6 - Governanca e Escala

- Permissoes por area/unidade.
- Politicas de dados sensiveis.
- Mascaramento de dados.
- Retencao de dados.
- Auditoria ampliada.
- Monitoramento de SLA.
- Alertas operacionais.

## 16. Resultado Esperado

Com essa evolucao, o FormHub deixa de ser apenas um construtor de formularios e passa a operar como uma plataforma central de processos digitais.

O objetivo final e permitir que a organizacao:

- Capture solicitacoes de forma estruturada.
- Automatize decisoes repetitivas.
- Encaminhe aprovacoes para os responsaveis corretos.
- Acompanhe o trabalho em kanban.
- Integre processos com GLPI, WhatsApp, email, ERPs e APIs.
- Monitore falhas e gargalos.
- Mantenha auditoria de ponta a ponta.
- Reduza processos manuais e retrabalho.

