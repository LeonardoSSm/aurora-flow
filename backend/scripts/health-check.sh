#!/bin/bash
# FormHub — verificação de saúde de todos os serviços.
# Uso: bash backend/scripts/health-check.sh
# Variáveis de ambiente opcionais:
#   API_URL        (padrão: http://localhost:3000)
#   RABBITMQ_URL   (padrão: http://localhost:15672)
#   PROMETHEUS_URL (padrão: http://localhost:9090)
#   DB_HOST        (padrão: localhost)
#   DB_PORT        (padrão: 5432)
#   DB_USER        (padrão: formhub)
#   DB_NAME        (padrão: formhub)

set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
RABBITMQ_URL="${RABBITMQ_URL:-http://localhost:15672}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-formhub}"
DB_NAME="${DB_NAME:-formhub}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"  # "ok" or anything else = fail
  local detail="${3:-}"

  if [ "$result" = "ok" ]; then
    printf "  %-30s \033[32mPASS\033[0m" "$name"
    PASS=$((PASS + 1))
  else
    printf "  %-30s \033[31mFAIL\033[0m" "$name"
    FAIL=$((FAIL + 1))
  fi

  if [ -n "$detail" ]; then
    printf "  %s" "$detail"
  fi
  printf "\n"
}

echo ""
echo "FormHub — Health Check"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo "──────────────────────────────────────────────"

# --- API ---
echo ""
echo "API (NestJS)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  check "GET /api/v1/health" "ok" "HTTP $HTTP_STATUS"
else
  check "GET /api/v1/health" "fail" "HTTP $HTTP_STATUS — backend pode estar offline"
fi

PING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/metrics" 2>/dev/null || echo "000")
if [ "$PING_STATUS" = "200" ] || [ "$PING_STATUS" = "401" ] || [ "$PING_STATUS" = "403" ]; then
  check "GET /api/v1/metrics (acessível)" "ok" "HTTP $PING_STATUS"
else
  check "GET /api/v1/metrics (acessível)" "fail" "HTTP $PING_STATUS"
fi

# --- Banco de dados ---
echo ""
echo "Banco de dados (PostgreSQL)"
if command -v pg_isready >/dev/null 2>&1; then
  PG_RESULT=$(pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" 2>&1 || true)
  if echo "$PG_RESULT" | grep -q "accepting connections"; then
    check "pg_isready" "ok" "$DB_HOST:$DB_PORT/$DB_NAME"
  else
    check "pg_isready" "fail" "$PG_RESULT"
  fi
else
  # fallback: TCP check
  if (echo > /dev/tcp/"$DB_HOST"/"$DB_PORT") 2>/dev/null; then
    check "TCP $DB_HOST:$DB_PORT" "ok" "(pg_isready não disponível)"
  else
    check "TCP $DB_HOST:$DB_PORT" "fail" "porta fechada ou host inacessível"
  fi
fi

# --- RabbitMQ ---
echo ""
echo "RabbitMQ"
RMQAPI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  -u "formhub:formhub" "${RABBITMQ_URL}/api/healthchecks/node" 2>/dev/null || echo "000")
if [ "$RMQAPI_STATUS" = "200" ]; then
  check "Management API /healthchecks/node" "ok" "HTTP $RMQAPI_STATUS"
elif [ "$RMQAPI_STATUS" = "401" ]; then
  check "Management API /healthchecks/node" "fail" "HTTP 401 — credenciais incorretas ou Management UI desabilitada"
elif [ "$RMQAPI_STATUS" = "000" ]; then
  check "Management API /healthchecks/node" "fail" "conexão recusada — porta 15672 comentada no compose (esperado em prod)"
else
  check "Management API /healthchecks/node" "fail" "HTTP $RMQAPI_STATUS"
fi

AMQP_PORT=5672
if (echo > /dev/tcp/localhost/"$AMQP_PORT") 2>/dev/null; then
  check "TCP localhost:$AMQP_PORT (AMQP)" "ok"
else
  check "TCP localhost:$AMQP_PORT (AMQP)" "fail" "porta AMQP fechada"
fi

# --- Prometheus ---
echo ""
echo "Prometheus"
PROM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${PROMETHEUS_URL}/-/healthy" 2>/dev/null || echo "000")
if [ "$PROM_STATUS" = "200" ]; then
  check "GET /-/healthy" "ok" "HTTP $PROM_STATUS"
else
  check "GET /-/healthy" "fail" "HTTP $PROM_STATUS — Prometheus pode estar offline"
fi

PROM_READY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${PROMETHEUS_URL}/-/ready" 2>/dev/null || echo "000")
if [ "$PROM_READY" = "200" ]; then
  check "GET /-/ready" "ok" "HTTP $PROM_READY"
else
  check "GET /-/ready" "fail" "HTTP $PROM_READY"
fi

# --- Grafana ---
echo ""
echo "Grafana"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
GRAFANA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${GRAFANA_URL}/api/health" 2>/dev/null || echo "000")
if [ "$GRAFANA_STATUS" = "200" ]; then
  check "GET /api/health" "ok" "HTTP $GRAFANA_STATUS"
else
  check "GET /api/health" "fail" "HTTP $GRAFANA_STATUS"
fi

# --- Resumo ---
echo ""
echo "──────────────────────────────────────────────"
TOTAL=$((PASS + FAIL))
printf "  Resultado: \033[32m%d PASS\033[0m  \033[31m%d FAIL\033[0m  (total: %d)\n" "$PASS" "$FAIL" "$TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
