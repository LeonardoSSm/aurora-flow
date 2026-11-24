# Observabilidade — FormHub

Stack: **Prometheus + Grafana + postgres-exporter + RabbitMQ Prometheus plugin**

---

## 1. Subindo o stack de observabilidade

O stack inteiro é gerenciado pelo `docker-compose.yml` na raiz do repositório.

```bash
# Subir todos os serviços (Postgres, RabbitMQ, exporters, Prometheus, Grafana)
docker compose up -d

# Verificar status dos containers
docker compose ps

# Ver logs de um container específico
docker compose logs -f prometheus
docker compose logs -f grafana

# Parar tudo
docker compose down
```

Os dados são persistidos em volumes nomeados (`formhub_pg_data`, `formhub_prometheus_data`, `formhub_grafana_data`, `formhub_rabbitmq_data`). Para apagar os dados completamente:

```bash
docker compose down -v
```

---

## 2. Acessando Prometheus

| Campo | Valor |
|---|---|
| URL | http://localhost:9090 |
| Autenticação | Nenhuma (acesso local apenas) |

### Targets configurados

Acesse http://localhost:9090/targets para ver o status de cada scrape job:

| Job | Target | O que coleta |
|---|---|---|
| `formhub-api` | `host.docker.internal:3000` | Métricas da aplicação NestJS (prefixo `formhub_`) |
| `postgres` | `postgres-exporter:9187` | Métricas do PostgreSQL via `postgres_exporter` |
| `rabbitmq` | `rabbitmq:15692` | Métricas do RabbitMQ via plugin `rabbitmq_prometheus` |
| `prometheus` | `localhost:9090` | Auto-métricas do Prometheus |

> **Atenção:** O scrape da API requer que o backend esteja rodando (`npm run start:dev` ou `npm run start:prod`). Se `METRICS_SECRET_TOKEN` estiver configurado no `.env`, adicione o mesmo valor em `observability/prometheus/prometheus.yml` no campo `bearer_token`.

---

## 3. Acessando Grafana

| Campo | Valor |
|---|---|
| URL | http://localhost:3001 |
| Usuário padrão | `admin` |
| Senha padrão | `formhub` (ou valor de `GRAFANA_ADMIN_PASSWORD` no `.env`) |

O datasource Prometheus e o dashboard principal são provisionados automaticamente via arquivos em `observability/grafana/provisioning/`. Não é necessário configurar nada manualmente após `docker compose up`.

### Dashboard principal

**FormHub Overview** — disponível em Dashboards → FormHub Overview

Organizado em 7 seções (linhas):

| Seção | Painéis |
|---|---|
| Saúde da API | Requisições/s, latência p50/p95/p99, erros 4xx/5xx, requisições em andamento |
| Banco de Dados | Queries/s, erros de query, queries lentas |
| RabbitMQ | Conexão, publicações, consumo, DLQ (dead-letter queue) |
| Fluxos de Automação | Execuções por status, falhas por tipo de nó, duração p50/p95 |
| Solicitações | Total criadas, abertas por status, por área, SLA vencido, tempo de conclusão |
| Aprovações | Pendentes, decisões por hora (aprovadas/rejeitadas) |
| Integrações | Webhooks outbound, eventos inbound, mensagens WhatsApp |

---

## 4. Métricas disponíveis

Todas as métricas da aplicação usam o prefixo `formhub_`. Além delas, o Prometheus coleta métricas padrão do Node.js (`formhub_process_*`, `formhub_nodejs_*`).

### HTTP

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_http_requests_total` | Counter | `method`, `route`, `status_code` | Total de requisições HTTP processadas |
| `formhub_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duração das requisições em segundos |
| `formhub_http_requests_in_flight` | Gauge | `method` | Requisições em andamento no momento |

### Banco de Dados

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_db_queries_total` | Counter | `operation` | Total de queries executadas via TypeORM |
| `formhub_db_query_errors_total` | Counter | `operation` | Total de queries com erro |
| `formhub_db_slow_query_duration_seconds` | Histogram | `operation` | Duração de queries marcadas como lentas |

### RabbitMQ

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_rabbitmq_connection_up` | Gauge | `connection` | Estado da conexão (1=up, 0=down) |
| `formhub_rabbitmq_messages_published_total` | Counter | `queue`, `result` | Total de publicações por fila e resultado |
| `formhub_rabbitmq_publish_duration_seconds` | Histogram | `queue`, `result` | Duração das publicações |
| `formhub_rabbitmq_messages_consumed_total` | Counter | `queue`, `result` | Total de mensagens consumidas |
| `formhub_rabbitmq_message_processing_duration_seconds` | Histogram | `queue`, `result` | Duração do processamento de mensagens |
| `formhub_rabbitmq_dlq_messages` | Gauge | `queue` | Mensagens atualmente na dead-letter queue |

### Fluxos de Automação

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_flow_executions_total` | Counter | `flow_id`, `status` | Total de execuções de fluxo por status final |
| `formhub_flow_execution_duration_seconds` | Histogram | `status` | Duração total de execuções de fluxo |
| `formhub_flow_node_executions_total` | Counter | `node_type`, `status` | Total de execuções de nós por tipo e status |

### Solicitações

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_solicitations_created_total` | Counter | `origin_type` | Total criadas por tipo de origem |
| `formhub_solicitations_by_status` | Gauge | `status` | Abertas agora por status |
| `formhub_solicitations_by_area` | Gauge | `area_code` | Abertas agora por área (atualizado a cada 30 min) |
| `formhub_solicitations_sla_breached_total` | Gauge | — | Total com SLA vencido |
| `formhub_solicitations_by_sla_status` | Gauge | `sla_status` | Por status de SLA |
| `formhub_solicitation_completion_hours` | Histogram | — | Tempo até conclusão em horas (buckets: 1h, 4h, 8h, 24h, 48h, 72h, 168h, 336h, 720h) |
| `formhub_kanban_moves_total` | Counter | `from_status`, `to_status` | Movimentações no kanban por par de status |

### Aprovações

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_approvals_pending_total` | Gauge | — | Aprovações pendentes agora |
| `formhub_approvals_decided_total` | Counter | `decision` | Total de decisões (`approved`, `rejected`) |

### Integrações

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `formhub_webhook_deliveries_total` | Counter | `status` | Entregas outbound (`success`, `retried`, `failed`) |
| `formhub_inbound_webhook_events_total` | Counter | `status` | Eventos recebidos (`received`, `ignored`) |
| `formhub_whatsapp_messages_total` | Counter | `status`, `provider` | Mensagens WhatsApp por status e provedor |

---

## 5. Endpoint de resumo (frontend)

Além das métricas Prometheus, há um endpoint JSON para consumo direto pelo frontend:

```
GET /api/v1/admin/metrics/summary
Authorization: Bearer <jwt>
Roles: ADMIN, MANAGER
```

Retorna um snapshot com totais de solicitações, aprovações, webhooks, fluxos e WhatsApp, calculados via queries diretas ao banco. Não requer scraping do Prometheus.

---

## 6. Como adicionar uma nova métrica

### Passo 1 — Declarar a métrica em `MetricsService`

Arquivo: `backend/src/modules/observability/metrics.service.ts`

```typescript
// Campo privado
private readonly minhaNovametrica: Counter<'label1'>;

// No constructor
this.minhaNovametrica = new Counter({
  name: 'formhub_minha_nova_metrica_total',
  help: 'Descrição clara do que esta métrica representa.',
  labelNames: ['label1'],
  registers: [this.registry],
});

// Método público
incrementMinhaNovaMetrica(label1: string): void {
  this.minhaNovametrica.inc({ label1 });
}
```

**Regras:**
- Prefixo `formhub_` obrigatório
- Não usar IDs de entidades como labels (alta cardinalidade)
- Verificar se a métrica já existe antes de criar

### Passo 2 — Chamar o método no service correspondente

`MetricsService` é `@Global()`, então está disponível para injeção em qualquer módulo sem importação explícita.

```typescript
constructor(private readonly metricsService: MetricsService) {}

async minhaOperacao(): Promise<void> {
  // ... lógica
  this.metricsService.incrementMinhaNovaMetrica('valor');
}
```

### Passo 3 — Adicionar painel no dashboard Grafana

Arquivo: `observability/grafana/dashboards/formhub-overview.json`

Adicione um objeto de painel ao array `panels`. Incremente o campo `id` (usar próximo número disponível). Exemplo mínimo para um Counter:

```json
{
  "id": 30,
  "title": "Minha Nova Métrica",
  "type": "timeseries",
  "gridPos": { "x": 0, "y": 100, "w": 12, "h": 8 },
  "datasource": { "type": "prometheus", "uid": "Prometheus" },
  "targets": [
    {
      "expr": "increase(formhub_minha_nova_metrica_total[5m])",
      "legendFormat": "{{label1}}"
    }
  ]
}
```

Após salvar o arquivo, reinicie o container Grafana para recarregar o dashboard provisionado:

```bash
docker compose restart grafana
```

### Passo 4 — Atualizar os specs de teste

Se o service que recebeu a injeção de `MetricsService` tem um spec, adicione o novo método ao mock:

```typescript
const metricsService = {
  // métodos existentes...
  incrementMinhaNovaMetrica: jest.fn(),
};
```

---

## 7. Segurança — portas expostas

| Porta | Serviço | Risco |
|---|---|---|
| `5432` | PostgreSQL | Exposto apenas para dev. Nunca abrir em produção sem firewall. |
| `5672` | RabbitMQ AMQP | Exposto apenas para dev. |
| `9090` | Prometheus | Sem autenticação. Restringir acesso em produção. |
| `3001` | Grafana | Protegido por login. Trocar a senha padrão em produção. |
| `9187` | postgres-exporter | Sem autenticação. Não expor publicamente. |

### Portas comentadas (não expostas por padrão)

```yaml
# - "15672:15672"  # RabbitMQ Management UI
# - "15692:15692"  # RabbitMQ Prometheus exporter
```

A porta `15672` (RabbitMQ Management UI) **não deve ser exposta em produção**. Ela fornece acesso administrativo completo ao broker, incluindo criação de usuários, filas e políticas. Descomente apenas em ambiente de desenvolvimento local e nunca em servidores acessíveis externamente.

A porta `15692` (Prometheus exporter do RabbitMQ) é acessada diretamente pelo container Prometheus na rede interna do Docker (`rabbitmq:15692`), não sendo necessário expô-la no host.

### Configurações recomendadas para produção

1. Definir `GRAFANA_ADMIN_PASSWORD` com valor forte no `.env`
2. Configurar `METRICS_SECRET_TOKEN` (ver seção abaixo)
3. Remover ou restringir via firewall as portas `5432`, `9090`, `9187`
4. Usar HTTPS na frente do Grafana (nginx/Caddy como reverse proxy)

---

## 8. Segurança do endpoint `/metrics`

O endpoint `GET /api/v1/metrics` expõe dados internos do sistema para o Prometheus. Em produção ele deve ser protegido com um token secreto.

### Como funciona

| Cenário | Comportamento |
|---|---|
| `METRICS_SECRET_TOKEN` não configurado | Endpoint aberto — aceito em dev local |
| `METRICS_SECRET_TOKEN` configurado | Exige `Authorization: Bearer <token>` — 401 caso ausente ou incorreto |

A comparação usa `crypto.timingSafeEqual` para evitar timing attacks.

### Configuração passo a passo

**1. Gerar o token**

```bash
openssl rand -hex 32
# ex: a3f8c2d1e9b74f6a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b
```

**2. Configurar o backend**

Em `backend/.env`:
```
METRICS_SECRET_TOKEN=a3f8c2d1e9b74f6a1c2d3e4f5a6b7c8d...
```

**3. Configurar o Prometheus**

Escreva o mesmo valor em `observability/prometheus/metrics_token` (sem quebra de linha):

```bash
printf 'a3f8c2d1e9b74f6a1c2d3e4f5a6b7c8d...' > observability/prometheus/metrics_token
```

Este arquivo está no `.gitignore` — não versione o segredo. O `docker-compose.yml` monta-o automaticamente em `/etc/prometheus/metrics_token` dentro do container, e o `prometheus.yml` usa `credentials_file` para lê-lo.

**4. Verificar**

```bash
# Sem token → 401
curl http://localhost:3000/api/v1/metrics

# Com token → 200 com métricas
curl -H "Authorization: Bearer <seu-token>" http://localhost:3000/api/v1/metrics
```

### Dev local sem Docker

Deixe `METRICS_SECRET_TOKEN` vazio (ou não o defina) no `.env`. O endpoint fica aberto, comportamento aceito para desenvolvimento.
