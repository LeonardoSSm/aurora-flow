# Roadmap Evolutivo — FormHub

Evoluções sugeridas ordenadas por impacto percebido e esforço de implementação estimado. Nenhuma quebra de compatibilidade é esperada — todas as adições são aditivas à arquitetura atual.

---

## 1. ERP genérico via REST configurável

**Por que:** a maioria das integrações corporativas exige enviar dados de submissão para um ERP (SAP, Totvs, Sankhya). O conector REST genérico já existe (`ConnectorsModule`), mas ainda não é acionado diretamente como ação de fluxo.

**O que fazer:**
- Adicionar nó `action_call_connector` no motor de fluxos, selecionando um conector cadastrado.
- Mapear campos do formulário para o corpo da requisição via template (ex.: `{{campo_valor_total}}`).
- Registrar a resposta do ERP no contexto do fluxo para uso em nós subsequentes.
- UI: painel de conectores mostrando o histórico de chamadas com status e payload.

**Esforço estimado:** médio (2–3 sprints). A infraestrutura de connectors e actions já existe.

---

## 2. Aprovação sequencial e paralela avançada

**Por que:** processos reais frequentemente exigem cadeia de aprovação (gerente → diretor → CFO) ou aprovação paralela (quórum: 2 de 3 aprovadores).

**O que fazer:**
- Modelo de `ApprovalStepEntity` já suporta `order`. Implementar lógica de progressão automática: ao aprovar o step N, criar/ativar o step N+1.
- Adicionar campo `mode` na aprovação: `sequential` (padrão atual) ou `parallel` com `quorum` (mínimo de aprovações necessárias).
- UI: visualização da cadeia de aprovação com status de cada step.
- Notificação automática ao próximo aprovador quando o step anterior é concluído.

**Esforço estimado:** médio-alto (3–4 sprints). Requer mudança no modelo de dados e na lógica do motor.

---

## 3. Portal do solicitante (acesso externo sem login)

**Por que:** solicitantes externos (fornecedores, candidatos, clientes) precisam acompanhar suas solicitações sem criar conta no sistema.

**O que fazer:**
- Gerar um token único e de curta duração (ou por hash da submissão) enviado por email ao submeter.
- Endpoint público `GET /solicitations/track/:token` retorna status, histórico resumido e próximos passos.
- Frontend: página pública `/acompanhar/:token` com timeline visual.
- Opcional: permitir que o solicitante adicione comentários ou documentos complementares via token.

**Esforço estimado:** médio (2–3 sprints). Requer cuidado com segurança do token e rate limiting.

---

## 4. Aplicativo mobile (notificações push)

**Por que:** aprovadores e gestores precisam de visibilidade e ação fora do desktop.

**O que fazer:**
- App React Native (ou PWA com push notifications) reutilizando a API REST existente.
- Notificações push via Firebase Cloud Messaging (FCM) quando uma aprovação é atribuída.
- Tela de aprovações pendentes com ação de aprovar/rejeitar diretamente.
- Tela de Kanban simplificada com filtro por área.

**Esforço estimado:** alto (4–6 sprints para app nativo; 1–2 sprints para PWA básico).

---

## 5. Multi-tenant (múltiplas organizações)

**Por que:** transformar FormHub em SaaS atendendo múltiplas empresas independentes.

**O que fazer:**
- Adicionar `tenantId` (UUID) em todas as entidades. Filtro automático via TypeORM subscriber ou middleware de request.
- Subdomínio ou header `X-Tenant-ID` para resolução do tenant na API.
- Isolamento de dados: cada tenant só enxerga seus próprios dados.
- Plano de onboarding: criar tenant, admin inicial e settings padrão via endpoint `/tenants` (superadmin).
- Billing e planos (feature flags por tenant) — escopo separado.

**Esforço estimado:** muito alto (6–10 sprints). É uma mudança transversal em toda a codebase.

---

## 6. IA para sugestão de routing e prioridade

**Por que:** à medida que o volume de solicitações cresce, triagem manual se torna gargalo.

**O que fazer:**
- Modelo de classificação de prioridade baseado em histórico: treinado offline com solicitações anteriores + decisões humanas.
- Na criação de uma solicitação, sugerir prioridade e área responsável via chamada a um microserviço Python (FastAPI) ou diretamente à API da Anthropic/OpenAI.
- Motor de fluxos: novo nó `action_ai_classify` que adiciona a sugestão ao contexto do fluxo.
- UI: badge "Sugestão IA" no detalhe da solicitação com explicação do critério.
- Feedback loop: aprovadores confirmam ou corrigem a sugestão, alimentando o modelo.

**Esforço estimado:** alto (4–6 sprints para MVP de sugestão; iteração contínua para melhoria do modelo).

---

## Melhorias incrementais (sem sprint dedicado)

| Item | Impacto | Complexidade |
|---|---|---|
| Exportação de solicitações (Excel/CSV com filtros) | Alto | Baixa |
| Notificação de SLA vencido por email | Alto | Baixa |
| Filtros avançados no Kanban (área, responsável, prazo) | Médio | Baixa |
| Comentários em solicitações por qualquer membro da área | Médio | Baixa |
| Agendamento de formulários (publicar/arquivar por data) | Médio | Média |
| Campos de upload de arquivo com armazenamento S3 | Alto | Média |
| Webhook de saída configurável por evento (não só por submissão) | Alto | Média |
| Dashboard por área (métricas filtradas por areaId) | Médio | Média |
| Testes E2E com Playwright | Alto (qualidade) | Média |
| Rate limiting por usuário autenticado (além do global por IP) | Médio (segurança) | Baixa |
