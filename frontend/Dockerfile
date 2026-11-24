# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Variáveis de build do Vite (baked em tempo de compilação)
ARG VITE_API_URL=http://localhost:3000/api/v1
ARG VITE_APP_URL=http://localhost:5173
ARG VITE_TURNSTILE_SITE_KEY=
ARG VITE_GRAFANA_URL=http://localhost:3001
ARG VITE_PROMETHEUS_URL=http://localhost:9090
ARG VITE_RABBITMQ_MANAGEMENT_URL=http://localhost:15672

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV VITE_GRAFANA_URL=$VITE_GRAFANA_URL
ENV VITE_PROMETHEUS_URL=$VITE_PROMETHEUS_URL
ENV VITE_RABBITMQ_MANAGEMENT_URL=$VITE_RABBITMQ_MANAGEMENT_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve com nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
