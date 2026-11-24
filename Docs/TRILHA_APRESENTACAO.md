# Tijuca Flow — Trilha de Apresentação
> **Data:** 28/05/2026 &nbsp;|&nbsp; **Apresentador:** Leonardo Sousa  
> **Tempo estimado:** 25–30 minutos &nbsp;|&nbsp; **Público:** Gerente de TI

---

## Índice

1. [Antes de Começar](#antes-de-começar)
2. [Cena 1 — O Problema](#cena-1--o-problema-2-min)
3. [Cena 2 — Dashboard](#cena-2--dashboard-2-min)
4. [Cena 3 — Formulário ao Vivo](#cena-3--formulário-ao-vivo-3-min)
5. [Cena 4 — Kanban Operacional](#cena-4--kanban-operacional-2-min)
6. [Cena 5 — Aprovação pelo Sistema](#cena-5--aprovação-pelo-sistema-3-min)
7. [Cena 6 — Portal do Solicitante](#cena-6--portal-do-solicitante-2-min)
8. [Cena 7 — Editor de Fluxos](#cena-7--editor-de-fluxos-4-min)
9. [Cena 8 — Integrações](#cena-8--integrações-2-min)
10. [Cena 9 — Grafana — Métricas](#cena-9--grafana--métricas-2-min)
11. [Cena 10 — Celular](#cena-10--celular-2-min)
12. [Perguntas Esperadas](#perguntas-esperadas)
13. [Pós-Apresentação](#pós-apresentação)

---

## ANTES DE COMEÇAR

> Fazer isso **5 minutos antes** de entrar na sala. Se algo não responder, iniciar o serviço antes de chamar o gerente.

### Checklist de serviços

```
□ Backend    →  curl http://localhost:3000/api/v1/health
              esperado: {"status":"ok"}

□ Mock ERP   →  http://localhost:8080
              esperado: painel "Mock ERP — Tijuca Flow" carregando

□ Mock GLPI  →  http://localhost:8081
              esperado: {"status":"ok","service":"Mock GLPI"}

□ WhatsApp   →  http://localhost:8082
              (Evolution API — pode estar offline sem impactar demo principal)

□ Grafana    →  http://localhost:3001
              esperado: tela de login ou dashboard

□ Frontend   →  http://localhost:5173
              esperado: tela de login do sistema
```

### Abas abertas no browser (na ordem)

```
Aba 1  →  http://localhost:5173
           Logado como: admin@formhub.local
           (dashboard principal — primeira coisa que o gerente vê)

Aba 2  →  http://localhost:8080
           Mock ERP ao vivo
           (deixar visível o contador de pedidos)

Aba 3  →  http://localhost:8081
           Mock GLPI ao vivo

Aba 4  →  http://localhost:3001
           Grafana — dashboard de métricas

Aba 5  →  http://localhost:5173/acompanhar/59a3f9b5-8e83-4b14-8e5b-118d34d0a216
           Portal do solicitante — solicitação dos Notebooks Dell (status: in_progress)
```

### Credenciais rápidas (deixar anotadas, não memorizar)

| Perfil | E-mail | Senha |
|---|---|---|
| Admin | `admin@formhub.local` | `FormHub@Demo123` |
| Gerente TI | `gerente.ti@formhub.local` | `FormHub@Demo123` |
| Gerente RH | `gerente.rh@formhub.local` | `FormHub@Demo123` |

### URLs de referência rápida

```
Form público (Compra):   http://localhost:5173/f/8352d801-1ac2-4f56-a6ba-b291d5ddb3b0
Kanban solicitações:     http://localhost:5173/solicitacoes
Aprovações:              http://localhost:5173/aprovacoes
Fluxo automático:        http://localhost:5173/flows/be148bb4-01f6-4770-80c4-aaa83b341c44
DEMO COMPLETA (fluxo):   http://localhost:5173/flows/a1c1299e-4dbb-49f1-ab6d-a7580fe13836
Integrações admin:       http://localhost:5173/administracao/integracoes
Observabilidade:         http://localhost:5173/administracao/observabilidade
Portal solicitante:      http://localhost:5173/acompanhar/59a3f9b5-8e83-4b14-8e5b-118d34d0a216
```

---

## CENA 1 — O PROBLEMA (2 min)

> Falar. Não abrir o sistema ainda. Estabelecer o contexto antes de mostrar qualquer tela.

### Perguntas de abertura

Fazer uma por vez, esperando a resposta antes de continuar:

> **"Quantas aprovações vocês processam por e-mail por semana?"**

> **"Se eu perguntar agora o status de uma requisição aberta há três dias, alguém sabe me responder sem precisar pesquisar?"**

> **"Quando um processo atrasa — uma compra, um chamado, uma contratação — vocês conseguem identificar onde travou e por quê?"**

### O que falar depois das respostas

*Adaptar conforme o que o gerente responder, mas a ideia central é:*

> "O que vocês estão descrevendo é o problema de todo processo que vive no e-mail e na planilha: ninguém tem visibilidade, cada aprovação depende de alguém lembrar de olhar a caixa de entrada, e quando algo atrasa a culpa fica difusa. O Tijuca Flow resolve exatamente isso — não substituindo as pessoas, mas dando a elas um lugar único onde os processos acontecem de forma rastreável e automática."

### Transição para o sistema

`[ABRIR ABA 1 — DASHBOARD]`

> "Deixa eu mostrar como isso fica na prática."

---

## CENA 2 — DASHBOARD (2 min)

**URL:** `http://localhost:5173` (logado como admin)

`[MOSTRAR TELA: dashboard principal]`

### O que mostrar

1. **KPIs do topo** — apontar para cada card:
   - Total de solicitações ativas
   - Aprovações pendentes (deve mostrar ~25)
   - SLA em risco / violado
   - Execuções de fluxo hoje (deve mostrar ~59)

2. **Gráfico de tendência** — mostrar os últimos 7 dias de volume

3. **Atividade recente** — rolar a lista de eventos mais recentes

### O que falar

> "Essa é a tela que qualquer gestor vê ao abrir o sistema. Em três segundos dá pra saber: quantas solicitações estão abertas, quais aprovações estão travando alguém, e se algum SLA foi ultrapassado. Esse número aqui — as execuções automáticas de fluxo — é o mais importante: significa que em cada uma dessas vezes o sistema tomou uma ação por conta própria, sem ninguém precisar fazer nada. E-mail para o aprovador, pedido criado no ERP, notificação no WhatsApp — tudo automático."

### Ponto de impacto

`[APONTAR PARA O CONTADOR DE EXECUÇÕES DE FLUXO]`

> "Cada execução aqui substituiu pelo menos um e-mail manual ou uma mensagem no WhatsApp. Se o volume de vocês for maior, esse número escala junto."

---

## CENA 3 — FORMULÁRIO AO VIVO (3 min)

**URL:** `http://localhost:5173/f/8352d801-1ac2-4f56-a6ba-b291d5ddb3b0`

> Este link é público — não precisa de login. Qualquer colaborador acessa pelo celular ou computador.

`[ABRIR O LINK PÚBLICO EM NOVA ABA — pode ser no modo anônimo para reforçar que é sem login]`

### O que falar ao abrir o formulário

> "Esse é o formulário de solicitação de compra. Qualquer colaborador acessa esse link — pode mandar por e-mail, WhatsApp, QR code, pode estar embutido na intranet. Não precisa ter cadastro no sistema."

### Preencher ao vivo — dados para copiar e colar

```
Item / Descrição:   Notebooks Dell para equipe de TI
Valor total:        18.500,00
Fornecedor:         Dell Brasil Ltda
Justificativa:      Renovação do parque de máquinas do setor de TI
Urgente:            Sim (marcar o checkbox)
Categoria:          TI
```

`[PREENCHER CAMPO A CAMPO — devagar, sem pressa]`

### O que falar enquanto preenche

> "O formulário pode ter campos condicionais — mostrar ou esconder perguntas dependendo do que foi respondido antes. Pode ter validação de CPF, CNPJ, valor mínimo e máximo, seleção de opções, upload de arquivo. O próprio time configura sem precisar de desenvolvimento."

### Ao clicar em Enviar

`[CLICAR EM ENVIAR E MOSTRAR A TELA DE CONFIRMAÇÃO]`

> "Pronto. Nesse exato momento, nos bastidores, três coisas aconteceram ao mesmo tempo: uma solicitação foi criada no banco de dados, o fluxo de aprovação foi disparado automaticamente, e o aprovador responsável já recebeu a notificação. O colaborador recebe esse link de acompanhamento e não precisa mais perguntar para ninguém o status."

`[MOSTRAR O LINK/TOKEN DE TRACKING NA TELA DE CONFIRMAÇÃO]`

---

## CENA 4 — KANBAN OPERACIONAL (2 min)

**URL:** `http://localhost:5173/solicitacoes`

`[NAVEGAR PARA A TELA DE SOLICITAÇÕES]`

### O que mostrar

1. **Visão kanban** — colunas por status (Aberta, Em análise, Aguardando aprovação, Em andamento, Concluída)
2. **Card da solicitação recém-criada** — apontar para o card dos Notebooks Dell que acabou de aparecer
3. **Badge de SLA** — mostrar o indicador de prazo no card
4. **Filtros** — clicar rapidamente em "Urgente" e "Área: TI" para demonstrar filtragem
5. **Arrastar um card** — mover um card entre colunas ao vivo para mostrar que é interativo

### O que falar

> "Essa é a visão operacional. Em vez de uma planilha que alguém precisa atualizar manualmente, os cards se movem automaticamente conforme as ações acontecem. Quando o aprovador aprova, o card avança. Quando o ERP processa, o card avança de novo. O gestor sabe em tempo real onde cada processo está, e o badge aqui indica se está dentro ou fora do SLA configurado."

`[APONTAR PARA O BADGE DE SLA]`

> "SLA violado fica vermelho automaticamente. Sem alguém precisar calcular prazo em planilha."

---

## CENA 5 — APROVAÇÃO PELO SISTEMA (3 min)

> Trocar para o perfil do Gerente RH.

### Passo a passo

1. `[CLICAR NO AVATAR NO CANTO SUPERIOR DIREITO → SAIR]`

2. `[FAZER LOGIN COM:]`
   ```
   E-mail: gerente.rh@formhub.local
   Senha:  FormHub@Demo123
   ```

3. `[NAVEGAR PARA: http://localhost:5173/aprovacoes]`

4. `[MOSTRAR A LISTA DE PENDENTES]` — apontar para a solicitação dos Notebooks Dell

5. `[ABRIR A SOLICITAÇÃO]` — mostrar o detalhamento completo, campos preenchidos, histórico

6. `[DIGITAR O COMENTÁRIO DE APROVAÇÃO:]`
   ```
   Aprovado. Equipamentos necessários para a equipe.
   ```

7. `[CLICAR EM APROVAR]`

### O que falar antes de aprovar

> "Esse é o Gerente de RH. Ele recebeu uma notificação — poderia ser por e-mail ou WhatsApp — e acessa a aprovação direto pelo sistema. Vê exatamente o que foi pedido, os valores, a justificativa, e pode aprovar ou rejeitar com um comentário. Tudo fica registrado: quem aprovou, quando, e o que escreveu."

### Após clicar em Aprovar

`[TROCAR IMEDIATAMENTE PARA A ABA DO MOCK ERP — ABA 2]`

> "Olha o Mock ERP aqui."

`[AGUARDAR 2–3 SEGUNDOS E MOSTRAR O CONTADOR DE PEDIDOS AUMENTAR]`

> "O pedido acabou de chegar no ERP automaticamente. Sem alguém precisar abrir o sistema do ERP, copiar o número do pedido, mandar e-mail para o fornecedor. O fluxo fez isso."

### O que falar sobre rastreabilidade

> "Toda essa cadeia fica auditável. Daqui a seis meses, se o auditor perguntar quem aprovou essa compra, quando, e com qual justificativa, está tudo aqui em três cliques."

---

## CENA 6 — PORTAL DO SOLICITANTE (2 min)

**URL:** `http://localhost:5173/acompanhar/59a3f9b5-8e83-4b14-8e5b-118d34d0a216`

`[ABRIR ABA 5 — PORTAL DO SOLICITANTE]`

> Este link não requer login. Qualquer pessoa com o token pode acompanhar.

### O que mostrar

1. **Timeline da solicitação** — cada etapa com data/hora e responsável
2. **Status atual** — "Em andamento" com o número do pedido ERP visível
3. **Histórico de aprovações** — quem aprovou, quando, o comentário

### O que falar

> "Esse é o link que o colaborador recebe quando submete o formulário. Ele abre no celular, sem precisar de login, e vê exatamente onde a solicitação dele está. Se está aguardando aprovação, quem é o aprovador. Se foi aprovada, quando e por quem. Se gerou um pedido no ERP, qual o número."

> "Isso elimina aquele ciclo de mensagens — 'Como está minha solicitação?', 'Calma que eu verifico', 'Ainda aguardando aprovação'. O colaborador tem a resposta antes de precisar perguntar."

---

## CENA 7 — EDITOR DE FLUXOS (4 min)

**URL:** `http://localhost:5173/flows/be148bb4-01f6-4770-80c4-aaa83b341c44`

`[NAVEGAR PARA O FLUXO "Aprovação automática de compras"]`

> Voltar para o login do admin antes, se necessário.

### O que mostrar

1. **Canvas do fluxo** — mostrar o diagrama completo com todos os nós visíveis

2. `[APONTAR PARA CADA TIPO DE NÓ E EXPLICAR EM UMA FRASE:]`

   - **Gatilho** *(nó roxo/verde no início):* "É o que dispara o fluxo — nesse caso, quando uma solicitação é criada."
   - **Condição** *(nó losango):* "Faz uma pergunta — 'o valor é maior que R$ 5.000?' — e manda para caminhos diferentes dependendo da resposta."
   - **Ação** *(nós retangulares):* "Executa algo: cria aprovação, manda WhatsApp, registra no ERP, move o status."

3. `[CLICAR NA ABA "Histórico de Execuções"]`
   - Mostrar as últimas execuções com **status: success**
   - Abrir a execução mais recente e mostrar cada nó com ✓

4. `[MOSTRAR O OUTPUT DO NÓ DE ERP]` — mostrar que o número PC-xxxx foi registrado

### O que falar

> "Tudo que acabamos de ver acontecer — o formulário criando a solicitação, o aprovador recebendo a notificação, o pedido indo para o ERP — foi configurado nessa tela, visualmente, sem escrever uma linha de código. O time de TI configura uma vez. Se o processo mudar — por exemplo, valores acima de R$ 20 mil passam por dois níveis de aprovação — é só arrastar um nó e reconectar."

`[ABRIR O FLUXO DEMO COMPLETA COMO BONUS:]`

**URL:** `http://localhost:5173/flows/a1c1299e-4dbb-49f1-ab6d-a7580fe13836`

> "Aqui tem um fluxo mais completo: compra → aprovação sequencial → ERP → WhatsApp para o solicitante. Esse é o nível de automação que dá pra montar."

---

## CENA 8 — INTEGRAÇÕES (2 min)

**URL:** `http://localhost:5173/administracao/integracoes`

`[NAVEGAR PARA ADMINISTRAÇÃO → INTEGRAÇÕES]`

### O que mostrar

1. **GLPI** — mostrar status "conectado" → `[TROCAR PARA ABA 3 — MOCK GLPI]` → mostrar chamados sincronizados

2. **ERP Interno** — mostrar template "Criar pedido de compra" → `[TROCAR PARA ABA 2 — MOCK ERP]` → mostrar os pedidos que chegaram durante a demo

3. **WhatsApp (Evolution API)** — mostrar status da conexão e, se disponível, o log de mensagens enviadas

4. **Google Workspace** — mostrar a opção de conectar conta Google para envio automático para Sheets

### O que falar

> "O sistema se conecta com as ferramentas que vocês já usam. GLPI para chamados de TI, ERP para pedidos de compra, WhatsApp para notificações, Google Sheets para relatórios automáticos. A integração é configurada uma vez aqui, e depois qualquer fluxo pode usá-la sem precisar reconectar."

### Se perguntarem sobre integração com sistema específico da empresa

> "Qualquer sistema que tenha uma API — que é o padrão atual — consegue se conectar. Se não tiver API, a gente usa webhook de entrada, que é um endereço que o sistema externo envia os dados. Para sistemas legados que não têm nenhum dos dois, desenvolvemos um conector específico, que normalmente leva menos de uma semana."

---

## CENA 9 — GRAFANA — MÉTRICAS (2 min)

**URL:** `http://localhost:3001`

`[ABRIR ABA 4 — GRAFANA]`

### O que mostrar

1. **Dashboard de solicitações** — volume por período, distribuição por área e status
2. **Execuções de fluxo** — throughput, taxa de sucesso, latência por fluxo
3. **Uptime da API** — disponibilidade do sistema nos últimos dias

### O que falar

> "Tudo que acontece no sistema gera métrica. Volume de solicitações por área, tempo médio de aprovação, fluxos que mais executam, horário de pico. Qualquer processo que passar pelo sistema vira dado. Daqui a três meses, com dados reais de vocês, dá pra fazer análise de gargalo — onde o processo demora mais, qual aprovador está represando mais solicitações, qual formulário tem mais rejeição."

`[APONTAR PARA O GRÁFICO DE EXECUÇÕES DE FLUXO]`

> "Esse gráfico aqui mostra que hoje tivemos 59 execuções automáticas de fluxo, zero falhadas. Cada uma dessas execuções substituiu um processo manual."

---

## CENA 10 — CELULAR (2 min)

> Executar esta cena apenas se houver dispositivo móvel disponível com o sistema acessível.

### Passo a passo

1. `[ABRIR O SISTEMA NO CELULAR:]` `http://localhost:5173`
2. `[FAZER LOGIN COMO GERENTE TI]`
3. `[NAVEGAR PARA APROVAÇÕES → PENDENTES]`
4. `[MOSTRAR UMA APROVAÇÃO PENDENTE]`
5. `[APROVAR EM 3 TOQUES:` abrir → verificar → aprovar`]`

### O que falar

> "O gestor não precisa estar na frente do computador para não travar um processo. Chega uma notificação, ele abre no celular, vê o detalhamento completo, aprova. Três toques. O processo continua sem o colaborador precisar ligar ou mandar mensagem perguntando."

### Se não tiver celular disponível

> *(pular esta cena e usar o tempo extra para aprofundar alguma pergunta que surgiu)*

---

## PERGUNTAS ESPERADAS

### 1. "Quanto tempo leva para implementar um novo processo?"

> "Um processo simples — formulário com uma aprovação — leva menos de uma hora para configurar e publicar. Um processo mais complexo, com múltiplos níveis de aprovação, condições e integrações, leva de um a três dias. Não tem desenvolvimento de código: é configuração."

---

### 2. "Como integra com nosso ERP atual?"

> "Se o ERP de vocês tiver API REST — que é o padrão de qualquer sistema moderno — a integração é configurada aqui em minutos. Precisamos do endpoint, as credenciais, e o formato dos dados. Se for um ERP legado sem API, o caminho é um conector via banco de dados ou arquivo, que leva alguns dias a mais."

---

### 3. "Quem vai manter isso?"

> "O sistema é projetado para ser mantido pelo próprio time de TI, sem precisar de desenvolvimento para criar ou alterar processos. Novos formulários, novos fluxos, novas integrações — tudo pela interface. Para atualizações de código da plataforma em si, é uma entrega única com a equipe que desenvolveu."

---

### 4. "É seguro? Onde ficam os dados?"

> "Os dados ficam no servidor da empresa, não em nuvem de terceiros. O sistema usa autenticação por JWT com expiração configurável, controle de perfil por área, e toda ação fica registrada em log de auditoria. Criptografia em trânsito por HTTPS e em repouso para campos sensíveis."

---

### 5. "Quanto custa?"

> "O sistema é desenvolvido sob medida para a empresa, então o investimento depende do escopo de implantação. O que posso garantir é que o modelo é de licença própria — vocês são donos do código, sem mensalidade para fornecedor externo. O custo de infraestrutura é o servidor que já existe ou uma VPS de entrada."

---

### 6. "Pode ter aprovação em dois níveis?"

> "Sim, e já está funcionando na demo — o fluxo 'Aprovação sequencial' faz exatamente isso: aprovação do gerente de área e depois do financeiro, em sequência. Dá pra configurar paralelo também: dois aprovadores ao mesmo tempo, e basta um aprovar, ou exige que ambos aprovem. É uma configuração no fluxo, não desenvolvimento."

---

### 7. "E se o sistema cair?"

> "O sistema roda no servidor da empresa com banco de dados PostgreSQL. Para redundância, o recomendado é uma instância de standby com failover automático, que qualquer infraestrutura de cloud ou on-premise suporta. As submissões de formulário têm chave de idempotência — se alguém submeter duas vezes por instabilidade, não cria duplicata. E o histórico de aprovações fica no banco, não na memória."

---

### 8. "Outros setores podem usar?"

> "Sim, esse é um dos pontos do sistema. Cada área tem seus próprios formulários, seus próprios fluxos, e visibilidade isolada das solicitações. O time de RH não vê as solicitações de TI, e vice-versa, a não ser que o fluxo envolva aprovação cruzada. Um único sistema atende Compras, TI, RH, Jurídico — cada um com seus processos, sem interferência."

---

## PÓS-APRESENTAÇÃO

### O que deixar com o gerente

```
□ Acesso de demonstração ao sistema
    URL:   http://localhost:5173
    Login: gerente.ti@formhub.local
    Senha: FormHub@Demo123

□ Link do documento executivo
    docs/relatorio_entrega.md

□ Link do roadmap de evolução
    docs/roadmap_evolutivo.md

□ Link da arquitetura técnica
    docs/arquitetura_processos.md
```

### Frase para fechar a reunião

Usar no final, antes de sair:

> "Qual seria o próximo passo natural para vocês? Posso mapear um processo específico da área de TI — talvez o fluxo de abertura de chamado ou de compra de equipamento — e mostrar ele funcionando com os dados reais de vocês. Quanto tempo você tem disponível essa semana para a gente fazer isso?"

---

*Tijuca Flow — FormHub &nbsp;·&nbsp; Versão da trilha: 2026-05-28*
