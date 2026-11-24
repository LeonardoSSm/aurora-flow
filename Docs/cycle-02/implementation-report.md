# Ciclo 02 — Relatório de implementação

## Resumo executivo

O Aurora Flow deixa de ser uma extração superficial do Tijuca Flow e passa a ser um **motor de automações operacionalmente independente**. O núcleo cria, persiste e executa grafos de webhook/agendamento/HTTP/e-mail/notificação sem módulos de formulário no `AppModule`. Nós descontinuados são recusados na API e no engine. Infraestrutura local usa nomes e portas que não colidem com Tijuca Flow ou Aurora Forms. A entrega é **completa para o motor e a segurança da superfície**; o schema TypeORM ainda contém tabelas herdadas (dívida documentada).

## Arquitetura anterior (ciclo 01)

- Superfície HTTP de formulários desligada; módulos e entidades ainda acoplados ao engine.
- Compose/portas parcialmente rebatizados; resíduos `formhub` em Evolution, Grafana, pgAdmin, exporter.
- Paleta visual reduzida; API ainda podia receber tipos de nó legados se o cliente ignorasse o editor.
- Seed admin com senha de desenvolvimento também em produção se a env não estivesse setada de forma estrita.

## Arquitetura posterior (ciclo 02)

```
Cliente → JWT / cookie aurora_flow_refresh
       → Flows API (allowlist de nós)
       → Fila aurora.flow.execution (RabbitMQ) ou execução inline
       → FlowExecutionEngine (nós genéricos; legado lança erro)
       → HTTP/e-mail/WhatsApp/Sheets/ERP HTTP
Inbound: POST /webhooks/in/:token → webhooks.received → mesmo pipeline
Schedule: poller next_run_at → mesmo pipeline
```

## Dependências eliminadas

- Módulos de formulário/processo fora do bootstrap Nest.
- Listeners de solicitação/aprovação no `FlowsModule`.
- Cabeçalho `x-formhub-signature`.
- Nomes operacionais `formhub` / `tijucaflow` no Compose ativo.
- Senha de admin padrão em produção.
- Paleta e validação frontend para nós descontinuados.

## Dependências remanescentes

Ver `Docs/cycle-02/remaining-technical-debt.md` e `dependency-map.md`.

## Funcionalidades preservadas

Editor de fluxos, webhook, agendamento, HTTP check, webhook de saída, e-mail, notificação, WhatsApp, Google Sheets, subfluxo, conector ERP HTTP, histórico, fila, credenciais, auth, auditoria, papéis, health, observabilidade.

## Funcionalidades removidas da superfície

Form builder, submissões, solicitações, kanban, aprovações de processo, gatilhos de formulário/SLA/fase, LOPS IA como nó, ERP lookup de campo (profile `legacy`), mobile.

## Segurança

Ver `Docs/cycle-02/security-audit.md`. Correções: SSRF, JWT mínimo, seed de produção, cookie/fila/métricas, assinatura de webhook, guard de processo opcional.

## Evidências

Ver `Docs/cycle-02/validation-report.md`.

## Impedimentos

- Sem autorização para reescrever histórico Git remoto.
- Sem acesso a produção (proposital).
- Integração Aurora Forms não implementada: produto vizinho sem contrato publicado.

## Riscos remanescentes

Schema legado; código morto no engine; artigos de ajuda antigos; Grafana dashboards podem ainda citar métricas antigas.

## Recomendações para o ciclo 03

1. Baseline de schema só com tabelas do motor (plano de squash + janela).
2. Extrair ramos de processo do `FlowExecutionEngine` para um módulo opcional ou apagá-los.
3. Remover `mobile/` e `erp-lookup` do repositório ou mover para outro produto.
4. Reescrever ajuda interna (`Docs/` e artigos no app) para o vocabulário de automações.
5. Secret scanning além da heurística (gitleaks) no CI.
