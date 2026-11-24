# Guia de Uso do Sistema FormHub

Este documento descreve o uso operacional do FormHub: acesso, navegação, criação de formulários, publicação, integração com Google Sheets, captação de respostas, consulta de dados, dashboards e administração.

## 1. Visão geral

O FormHub é uma plataforma para criar, publicar e acompanhar formulários corporativos. O fluxo principal é:

1. Entrar no sistema com Google Workspace ou login local.
2. Criar ou editar um formulário no Criador.
3. Configurar campos, seções e integrações.
4. Salvar o formulário como rascunho.
5. Publicar o formulário.
6. Compartilhar o link público com os respondentes.
7. Acompanhar respostas no módulo de Respostas, Dashboard e, quando habilitado, Google Sheets.

O sistema possui os módulos principais:

- **Dashboard**: visão executiva com KPIs, tendência de respostas e submissões recentes.
- **Formulários**: listagem, busca, edição, duplicação, publicação e arquivamento.
- **Criador**: construção do formulário em etapas.
- **Respostas**: consulta e exportação de respostas.
- **Administração**: usuários, permissões, auditoria e configurações.

## 2. Acesso ao sistema

### 2.1 Login com Google Workspace

O acesso principal é feito pelo botão **Entrar com Google Workspace** na tela de login.

Passo a passo:

1. Acesse a tela inicial do FormHub.
2. Clique em **Entrar com Google Workspace**.
3. Escolha sua conta corporativa Google.
4. Autorize os escopos solicitados.
5. Após o retorno do Google, o sistema cria ou atualiza sua sessão.
6. O usuário é redirecionado para o Dashboard.

Regras importantes:

- O domínio autorizado é **tijucaalimentos.com**.
- Contas fora desse domínio devem ser bloqueadas.
- No primeiro login Google, o usuário corporativo pode ser provisionado automaticamente.
- O Google Workspace também é usado para conectar a conta que criará e atualizará planilhas.

### 2.2 Login local

O login local existe como fallback.

Use os campos:

- **E-mail**
- **Senha**

Credencial seed de desenvolvimento:

- **E-mail**: `admin@formhub.local`
- **Senha**: `FormHub@123`

Essa credencial é indicada para ambiente local ou homologação técnica. Em produção, use usuários reais e políticas de senha da organização.

### 2.3 Sessão e logout

Depois do login, o usuário fica autenticado com token de acesso e refresh token. O menu lateral mostra nome/e-mail do usuário e o botão **Logout**.

Ao sair:

1. Clique em **Logout** no menu lateral.
2. A sessão local é encerrada.
3. Para acessar novamente, use Google Workspace ou login local.

## 3. Perfis e permissões

O sistema trabalha com os seguintes perfis:

- **Administrador**: acesso total, usuários, auditoria, configurações, formulários, respostas e exportações.
- **Gerente**: gerencia formulários, publica, duplica e visualiza/exporta respostas.
- **Editor**: cria e edita seus próprios formulários, publica seus formulários e visualiza respostas relacionadas.
- **Visualizador**: acesso de leitura a formulários e respostas, sem exportação.

Algumas regras são aplicadas pelo backend. Isso significa que um usuário pode até visualizar algum item no menu, mas ações sem permissão retornam erro de acesso restrito.

## 4. Navegação principal

Após login, o menu lateral apresenta:

- **Dashboard**
- **Formulários**
- **Criador**
- **Respostas**
- **Módulo de Administração**
- **Novo Formulário**
- **Logout**

O botão **Novo Formulário** leva ao Criador em modo de novo rascunho.

## 5. Dashboard

O Dashboard apresenta uma visão operacional dos formulários e respostas.

Indicadores exibidos:

- **Formulários Totais**
- **Publicados**
- **Respostas (Total)**
- **Respostas (30 dias)**
- **Tendência de respostas**
- **Submissões recentes**

Como usar:

1. Acesse **Dashboard** no menu lateral.
2. Consulte os KPIs principais.
3. Use o seletor de período do gráfico para alternar entre visão de 7 ou 30 dias, quando disponível.
4. Clique em **Atualizar dados** para recarregar as informações.

Quando houver filtro global por busca, o Dashboard pode exibir um aviso de filtro ativo.

## 6. Gestão de formulários

O módulo **Formulários** centraliza os formulários criados ou atribuídos ao usuário.

Na tabela são exibidos:

- Nome
- Status
- Categoria
- Área
- Responsável
- Data de criação
- Ações

Status possíveis:

- **Rascunho**: formulário ainda em edição.
- **Publicado**: formulário disponível para respostas.
- **Pausado**: formulário temporariamente indisponível.
- **Expirado**: formulário encerrado.
- **Arquivado**: formulário retirado do uso operacional.

### 6.1 Buscar formulários

1. Acesse **Formulários**.
2. Use o campo de busca para localizar por nome, categoria, área ou status.
3. Ajuste filtros de status quando disponíveis.

### 6.2 Editar formulário

1. Na tabela, encontre o formulário.
2. Clique em **Editar**.
3. O sistema abre o Criador com o formulário selecionado.
4. Faça as alterações necessárias.
5. Clique em **Salvar**.

Salvar um formulário existente gera uma nova versão em rascunho quando aplicável.

### 6.3 Duplicar formulário

1. Abra o menu de ações do formulário.
2. Clique em **Duplicar**.
3. O sistema cria uma cópia para ser ajustada sem alterar o formulário original.

### 6.4 Visualizar formulário publicado

1. Apenas formulários publicados podem ser visualizados pelo link público.
2. Na tabela, clique em **Visualizar**.
3. O sistema abre a página pública do formulário.

### 6.5 Publicar formulário

1. Abra o formulário no Criador ou use a ação de publicação na lista.
2. Verifique se nome, seções e campos estão preenchidos corretamente.
3. Clique em **Publicar**.
4. O status muda para **Publicado**.
5. O formulário passa a aceitar respostas na página pública.

### 6.6 Pausar, reativar, expirar ou arquivar

As transições de status disponíveis dependem do status atual e da permissão do usuário.

Exemplos:

- Rascunho pode ser publicado ou arquivado.
- Publicado pode ser pausado, expirado ou arquivado.
- Pausado pode voltar a publicado.
- Arquivado pode voltar para rascunho, quando permitido.

Arquivar torna o formulário indisponível para novos respondentes.

## 7. Criador de formulário

O **Criador** é a tela usada para construir e manter formulários.

Ele é dividido em quatro etapas:

1. **Configurações**
2. **Campos**
3. **Integrações**
4. **Preview**

### 7.1 Configurações

Nesta etapa são configuradas as informações básicas:

- Formulário salvo ou novo formulário.
- Modo do formulário: página única ou multi-etapas.
- Nome.
- Categoria.
- Área.
- Responsável.
- Descrição.

Passo a passo:

1. Acesse **Criador**.
2. Escolha **Criando novo formulário** ou selecione um formulário existente.
3. Defina o modo:
   - **Página única**: todas as seções aparecem na mesma página.
   - **Multi-etapas**: cada seção funciona como uma etapa.
4. Preencha nome, categoria, área e descrição.
5. Se necessário, atribua um responsável.
6. Clique em **Próximo: Campos**.

### 7.2 Campos e seções

Nesta etapa são criadas as perguntas.

O formulário é organizado por:

- **Seções**: grupos de perguntas.
- **Campos**: perguntas ou elementos visuais dentro da seção.

Tipos de campo disponíveis:

- Texto curto.
- Texto longo.
- Número.
- Data.
- Hora.
- E-mail.
- Telefone.
- CPF.
- CNPJ.
- Seleção única.
- Múltipla seleção.
- Checkbox.
- Upload de arquivo.
- Escala.
- Avaliação.
- Título.
- Descrição.
- Divisor.

Para adicionar uma seção:

1. Acesse a aba **Fluxo**. O canvas ocupa a tela inteira e mostra cada seção como um cartão, com os primeiros campos e as ramificações.
2. Clique em **Adicionar seção**, no canto superior esquerdo do canvas. A seção nova abre na mesma hora.
3. Informe título e descrição no topo da janela da seção, se necessário.

Para adicionar um campo:

1. Clique no cartão da seção, no canvas, para abrir a janela dela.
2. Na aba **Campos**, clique em **Adicionar campo** e escolha o tipo na grade. A busca do seletor encontra o tipo pelo nome.
3. O campo novo já abre expandido. Configure rótulo, obrigatoriedade e opções, quando aplicável. O código é gerado a partir do rótulo.
4. Clique em uma linha para abrir ou fechar o campo; só um fica aberto por vez. Para reordenar, arraste pelo ícone de pontos à esquerda da linha.

Com muitos campos, use **Buscar campo nesta seção** para filtrar pelo rótulo e **Recolher** para fechar a linha aberta. As setas no topo da janela levam à seção anterior e à próxima sem fechar.

Campos de seleção devem possuir opções. Campos obrigatórios precisam ser respondidos antes do envio público.

### 7.3 Integrações

A aba **Integrações** concentra o Google Workspace e Google Sheets.

Ela mostra:

- Status da conta Google.
- Domínio permitido.
- Conta vinculada.
- Status da planilha do formulário.
- Último sync.
- Último erro.
- Quantidade de jobs em fila, processamento, concluídos e falhos.

Controles disponíveis:

- **Conectar Google**
- **Desconectar**
- **Habilitar Google Sheets neste formulário**
- **Criar planilha automaticamente ao salvar**
- **Criar planilha**
- **Abrir planilha**
- **Reenfileirar sync**
- **Reprocessar formulário**

### 7.4 Preview

A aba **Preview** permite revisar como o formulário será apresentado ao respondente.

Use o preview antes de publicar para validar:

- Ordem das seções.
- Rótulos dos campos.
- Campos obrigatórios.
- Campos de seleção.
- Modo página única ou multi-etapas.
- Textos de descrição.

### 7.5 Salvar formulário

Para salvar:

1. Clique em **Salvar** no topo da tela.
2. O sistema valida campos obrigatórios da configuração.
3. Se houver erro, será exibido um aviso.
4. Se tudo estiver correto, o rascunho é salvo.

Se a opção **Criar planilha automaticamente ao salvar** estiver habilitada, o sistema tentará criar a planilha vinculada no Google Sheets ao salvar.

### 7.6 Descartar alterações

O botão **Descartar** reinicia o rascunho atual. Use com cuidado, pois alterações não salvas podem ser perdidas.

## 8. Google Workspace e Google Sheets

### 8.1 Conectar conta Google

Para usar planilhas:

1. Acesse o Criador.
2. Abra a aba **Integrações**.
3. Clique em **Conectar Google**.
4. Autorize com uma conta do domínio **tijucaalimentos.com**.
5. Ao retornar ao FormHub, confirme se a conta aparece como conectada.

### 8.2 Desconectar conta Google

1. Acesse **Integrações**.
2. Clique em **Desconectar**.
3. A conta deixa de ser usada para novas operações de planilha.

Formulários já configurados podem continuar exibindo metadados da planilha, mas novas sincronizações dependem de uma conta válida.

### 8.3 Habilitar Google Sheets no formulário

1. Acesse o formulário no Criador.
2. Abra **Integrações**.
3. Ative **Habilitar Google Sheets neste formulário**.
4. Salve o formulário.

Quando habilitado, respostas enviadas ao formulário passam a gerar jobs de sincronização.

### 8.4 Criar planilha automaticamente

1. Ative **Habilitar Google Sheets neste formulário**.
2. Ative **Criar planilha automaticamente ao salvar**.
3. Clique em **Salvar**.
4. O sistema cria uma planilha na conta Google conectada.
5. A planilha recebe cabeçalho compatível com os campos do formulário.

### 8.5 Criar planilha manualmente

1. Salve ou selecione um formulário existente.
2. Abra **Integrações**.
3. Clique em **Criar planilha**.
4. Aguarde a confirmação.
5. Use **Abrir planilha** para acessar o arquivo no Google Sheets.

### 8.6 Abrir planilha

O botão **Abrir planilha** fica disponível quando o formulário possui `spreadsheetUrl`.

1. Acesse **Integrações**.
2. Clique em **Abrir planilha**.
3. A planilha é aberta em uma nova aba do navegador.

### 8.7 Sincronização de respostas

Quando um respondente envia uma resposta:

1. A resposta é salva no FormHub.
2. Se Google Sheets estiver habilitado, o sistema cria um job de sincronização.
3. Um processo assíncrono lê os jobs pendentes.
4. A resposta é enviada como nova linha na planilha.
5. O formulário atualiza `lastSyncedAt` quando sincroniza com sucesso.
6. Em falha, o sistema registra `lastError` e mantém contadores de jobs.

O sistema controla jobs em estados como fila, processamento, concluído e falha.

### 8.8 Reenfileirar sync

Use **Reenfileirar sync** quando existirem respostas pendentes ou jobs presos.

O sistema pode:

- Recuperar jobs parados em processamento.
- Recolocar jobs pendentes na fila.
- Atualizar o resumo de jobs do formulário.

### 8.9 Reprocessar formulário

Use **Reprocessar formulário** quando quiser tentar sincronizar novamente respostas do formulário.

O sistema evita recriar jobs já concluídos, então a ação busca reprocessar o que ainda precisa de sincronização.

## 9. Publicação e link público

Um formulário só recebe respostas quando está **Publicado**.

URLs públicas suportadas:

- `/f/:formId`
- `/public/formulario/:formId`

Fluxo recomendado:

1. Crie o formulário.
2. Revise no Preview.
3. Salve.
4. Publique.
5. Abra a visualização pública.
6. Copie o link da página pública.
7. Compartilhe com os respondentes.

Se o formulário estiver em rascunho, pausado, expirado ou arquivado, a página pública pode exibir indisponibilidade.

## 10. Captação de dados pelo formulário público

Na página pública, o respondente encontra:

- Logo e identidade visual da empresa.
- Nome e descrição do formulário.
- Categoria e área.
- Identificação opcional do respondente: nome e e-mail.
- Seções e campos do formulário.
- Navegação por etapa, quando o formulário estiver em modo multi-etapas.
- Verificação anti-bot, quando configurada.
- Botão para limpar respostas.
- Botão para enviar resposta.

Passo a passo para o respondente:

1. Acessar o link público.
2. Preencher identificação, se desejar.
3. Responder os campos obrigatórios.
4. Avançar etapas, se o formulário for multi-etapas.
5. Concluir verificação anti-bot, quando exibida.
6. Clicar em **Enviar resposta**.

Após o envio:

1. A resposta fica registrada no FormHub.
2. O contador da sessão aumenta.
3. O respondente pode limpar respostas e enviar novamente, se necessário.
4. A sincronização com Google Sheets ocorre de forma assíncrona quando habilitada.

## 11. Respostas

O módulo **Respostas** permite consultar submissões recebidas.

Funcionalidades:

- Selecionar formulário.
- Filtrar por busca.
- Listar respostas paginadas.
- Visualizar dados do respondente.
- Visualizar respostas por campo.
- Recarregar dados.
- Exportar CSV.

Passo a passo:

1. Acesse **Respostas**.
2. Selecione o formulário.
3. Use a busca para filtrar por e-mail, status ou conteúdo visível na página atual.
4. Navegue entre páginas quando houver muitas respostas.
5. Clique em **Exportar CSV** para baixar os dados.

Observação: o backend também possui suporte a exportação XLSX e PDF, mas a tela atual expõe diretamente a exportação CSV.

## 12. Administração

O módulo **Administração** reúne funções administrativas.

### 12.1 Visão Geral

Mostra cards informativos do estado dos recursos administrativos.

### 12.2 Usuários

Permite:

- Listar usuários.
- Buscar por nome ou e-mail.
- Criar usuário.
- Editar usuário.
- Alterar perfil.
- Alterar senha.
- Ativar ou desativar acesso.

Ao alterar senha, perfil ou desativar usuário, sessões antigas são invalidadas.

### 12.3 Permissões

Exibe papéis e permissões. O sistema trabalha com perfis como Administrador, Gerente, Editor e Visualizador.

### 12.4 Auditoria

Mostra eventos críticos do sistema, com filtros por:

- Módulo.
- Ação.
- Página.

Eventos auditáveis incluem ações de autenticação, formulários, respostas e usuários.

### 12.5 Configurações

Mostra parâmetros gerais do ambiente. Parte das configurações pode estar em modo somente leitura, dependendo do estágio da implementação.

## 13. Boas práticas de uso

- Use Google Workspace como login principal.
- Mantenha formulários em rascunho até revisar o preview.
- Nomeie campos com rótulos claros e objetivos.
- Use categoria e área para melhorar organização e busca.
- Publique apenas formulários revisados.
- Arquive formulários encerrados para evitar novas respostas.
- Habilite Google Sheets somente quando a planilha for necessária.
- Confira `lastError` e contadores de jobs quando uma planilha não receber dados.
- Use exportação CSV para análises externas.
- Use o Dashboard para acompanhamento executivo e o módulo Respostas para investigação detalhada.

## 14. Fluxo operacional recomendado

1. Entrar com Google Workspace.
2. Acessar **Criador**.
3. Criar novo formulário.
4. Preencher configurações básicas.
5. Criar seções e campos.
6. Configurar integração Google Sheets, se necessário.
7. Salvar rascunho.
8. Revisar no Preview.
9. Publicar.
10. Abrir o link público.
11. Compartilhar com respondentes.
12. Acompanhar respostas no módulo **Respostas**.
13. Conferir indicadores no **Dashboard**.
14. Acompanhar planilha no Google Sheets, se habilitada.
15. Arquivar, pausar ou reprocessar integrações quando necessário.

## 15. Solução de problemas comuns

### Não consigo entrar com Google

Verifique:

- Se está usando conta do domínio `tijucaalimentos.com`.
- Se autorizou os escopos solicitados.
- Se o backend está rodando.
- Se a URL de callback Google está configurada corretamente.

### O login local não conecta

Verifique:

- Se a API está ativa em `http://localhost:3000/api/v1`.
- Se o banco PostgreSQL está rodando.
- Se as migrations foram aplicadas.
- Se está usando credenciais válidas.

### O formulário não aparece para o respondente

Verifique:

- Se o formulário está publicado.
- Se o link usa o ID correto.
- Se o formulário não está pausado, expirado ou arquivado.

### A planilha não foi criada

Verifique:

- Se a conta Google está conectada.
- Se o Google Sheets está habilitado no formulário.
- Se o formulário foi salvo.
- Se há mensagem em **Último erro**.

### As respostas não chegaram na planilha

Verifique:

- Se a planilha existe.
- Se há jobs em fila ou falha.
- Use **Reenfileirar sync**.
- Use **Reprocessar formulário** se necessário.

### O usuário não consegue publicar ou arquivar

Verifique:

- Perfil do usuário.
- Se ele criou o formulário ou foi atribuído ao formulário.
- Se o backend retornou erro de permissão.

