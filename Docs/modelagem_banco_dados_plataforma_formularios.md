# Documento de Modelagem de Banco de Dados — Plataforma de Criação e Gestão de Formulários

## 1. Objetivo do documento
Este documento define a modelagem conceitual e lógica inicial do banco de dados da plataforma de criação e gestão de formulários.

O foco aqui é garantir uma estrutura capaz de sustentar com consistência:
- formulários dinâmicos;
- versionamento;
- seções e campos configuráveis;
- regras condicionais;
- publicação;
- coleta de respostas;
- auditoria;
- controle de acesso;
- evolução futura do produto.

O ponto crítico é simples: esse projeto não morre na interface, ele morre na modelagem. Se a estrutura de dados nascer errada, o sistema inteiro vira remendo.

---

## 2. Princípios de modelagem
A modelagem deve obedecer aos seguintes princípios:

### 2.1. Integridade histórica
Toda resposta deve permanecer vinculada à **versão exata do formulário** respondido.

### 2.2. Separação entre definição e execução
A estrutura do formulário deve ficar separada dos dados de resposta. Em outras palavras:
- uma coisa é a definição do formulário;
- outra coisa é a execução/preenchimento dele.

### 2.3. Versionamento explícito
Mudanças estruturais relevantes não devem sobrescrever silenciosamente uma versão publicada.

### 2.4. Auditabilidade
Entidades críticas devem suportar trilha de auditoria.

### 2.5. Escalabilidade pragmática
A modelagem precisa suportar crescimento sem cair em abstração inútil ou flexibilidade burra.

### 2.6. Normalização com pragmatismo
Deve haver normalização suficiente para garantir consistência, mas sem inviabilizar performance operacional e analítica.

---

## 3. Estratégia geral de modelagem
A plataforma deve ser modelada em torno de cinco núcleos principais:

1. **Identidade e acesso**
2. **Definição estrutural do formulário**
3. **Publicação e disponibilidade**
4. **Resposta e coleta de dados**
5. **Auditoria e governança**

Esses núcleos evitam confusão conceitual e ajudam a manter o domínio limpo.

---

## 4. Visão conceitual das entidades

### Núcleo 1 — Identidade e acesso
- usuário
- perfil
- permissão
- usuário_perfil
- perfil_permissao
- área
- unidade

### Núcleo 2 — Estrutura do formulário
- formulario
- formulario_versao
- formulario_secao
- formulario_campo
- formulario_campo_opcao
- formulario_regra_condicional
- template

### Núcleo 3 — Publicação
- formulario_publicacao
- formulario_publicacao_alvo
- formulario_publicacao_parametro

### Núcleo 4 — Respostas
- resposta
- resposta_item
- resposta_anexo
- respondente_identidade

### Núcleo 5 — Governança
- auditoria_evento
- auditoria_detalhe
- configuracao_sistema
- categoria_formulario
- tag
- formulario_tag

---

## 5. Entidades principais detalhadas

# 5.1. usuario
Representa o usuário autenticável da plataforma.

### Finalidade
Controlar acesso ao sistema e relacionar autoria, edição, publicação e auditoria.

### Campos principais
- id
- nome
- email
- login
- senha_hash
- status
- ultimo_acesso_em
- criado_em
- atualizado_em
- criado_por
- atualizado_por

### Regras
- e-mail e login devem ser únicos conforme política definida.
- senha nunca deve ser armazenada em texto puro.
- usuário pode ser ativado ou inativado sem exclusão física.

---

# 5.2. perfil
Representa um agrupador de permissões.

### Campos principais
- id
- nome
- descricao
- escopo
- status
- criado_em
- atualizado_em

### Exemplos
- administrador
- gestor_area
- editor_formulario
- auditor
- respondente_interno

---

# 5.3. permissao
Representa uma ação autorizável.

### Campos principais
- id
- codigo
- nome
- descricao
- modulo
- criado_em

### Exemplos
- formulario.criar
- formulario.publicar
- formulario.exportar
- auditoria.visualizar
- usuario.gerenciar

---

# 5.4. usuario_perfil
Relaciona usuários a perfis.

### Campos principais
- id
- usuario_id
- perfil_id
- area_id
- unidade_id
- ativo
- criado_em

### Regras
- um usuário pode possuir múltiplos perfis conforme necessidade.
- o vínculo pode ser contextualizado por área ou unidade.

---

# 5.5. perfil_permissao
Relaciona perfis a permissões.

### Campos principais
- id
- perfil_id
- permissao_id
- criado_em

---

# 5.6. area
Representa uma área organizacional.

### Campos principais
- id
- nome
- descricao
- status
- criado_em

---

# 5.7. unidade
Representa unidade, filial, regional ou estrutura equivalente.

### Campos principais
- id
- nome
- codigo
- descricao
- status
- criado_em

---

# 5.8. categoria_formulario
Representa classificação funcional do formulário.

### Campos principais
- id
- nome
- descricao
- status
- criado_em

---

# 5.9. formulario
Representa a identidade persistente do formulário, independente da versão.

### Finalidade
Separar o conceito de “formulário” da sua estrutura versionada.

### Campos principais
- id
- nome
- descricao
- finalidade
- categoria_id
- area_id
- unidade_id
- template_origem_id
- status
- formulario_atual_versao_id
- criado_por
- atualizado_por
- criado_em
- atualizado_em
- arquivado_em

### Regras
- formulário é a entidade raiz.
- não deve armazenar estrutura detalhada de campos diretamente.
- o campo `formulario_atual_versao_id` aponta para a versão ativa mais recente quando aplicável.

### Status sugeridos
- rascunho
- publicado
- pausado
- expirado
- arquivado

---

# 5.10. formulario_versao
Representa uma versão específica da estrutura do formulário.

### Finalidade
Preservar histórico estrutural do formulário ao longo do tempo.

### Campos principais
- id
- formulario_id
- numero_versao
- titulo_exibicao
- descricao_exibicao
- instrucoes
- tema_json
- configuracoes_json
- status
- publicado_em
- despublicado_em
- criado_por
- criado_em
- observacao_versao

### Regras
- cada versão pertence a um único formulário.
- deve existir unicidade por `(formulario_id, numero_versao)`.
- respostas sempre apontam para esta tabela, nunca apenas para `formulario`.
- alterações estruturais relevantes devem gerar nova versão.

### Observação importante
Essa tabela é uma das mais críticas do sistema. Se ela não existir ou for mal tratada, você perde histórico e mistura respostas incompatíveis.

---

# 5.11. formulario_secao
Representa um bloco lógico da versão do formulário.

### Campos principais
- id
- formulario_versao_id
- titulo
- descricao
- ordem
- ativo
- criado_em
- atualizado_em

### Regras
- uma versão pode ter zero ou muitas seções.
- a ordenação deve ser explícita.

---

# 5.12. formulario_campo
Representa cada campo configurável do formulário.

### Campos principais
- id
- formulario_versao_id
- secao_id
- codigo_interno
- rotulo
- descricao
- tipo_campo
- ordem
- obrigatorio
- placeholder
- ajuda_texto
- valor_padrao
- mascara
- regex_validacao
- mensagem_validacao
- tamanho_minimo
- tamanho_maximo
- numero_minimo
- numero_maximo
- data_minima
- data_maxima
- multipla_selecao
- permite_anexo
- sensibilidade_dado
- ativo
- configuracoes_json
- criado_em
- atualizado_em

### Regras
- `codigo_interno` deve ser único dentro da versão.
- `tipo_campo` deve ser controlado por enum/domínio.
- configurações extras específicas podem ficar em JSON, mas o núcleo importante não deve ser empurrado inteiro para JSON por preguiça.

### Tipos sugeridos
- texto_curto
- texto_longo
- numero
- data
- hora
- email
- telefone
- cpf
- cnpj
- selecao_unica
- selecao_multipla
- checkbox
- upload_arquivo
- escala
- avaliacao
- titulo
- descricao
- separador

---

# 5.13. formulario_campo_opcao
Representa opções para campos selecionáveis.

### Campos principais
- id
- campo_id
- valor_interno
- rotulo
- ordem
- ativo
- selecionado_por_padrao
- criado_em

### Regras
- um campo selecionável pode ter muitas opções.
- a ordem deve ser explícita.

---

# 5.14. formulario_regra_condicional
Representa regras de exibição, obrigatoriedade e navegação condicional.

### Campos principais
- id
- formulario_versao_id
- campo_origem_id
- operador
- valor_comparacao
- tipo_acao
- campo_destino_id
- secao_destino_id
- mensagem_saida
- prioridade
- ativo
- criado_em
- atualizado_em

### Exemplos de ação
- exibir_campo
- ocultar_campo
- tornar_obrigatorio
- remover_obrigatoriedade
- ir_para_secao
- encerrar_formulario

### Regras
- regras devem pertencer à versão do formulário.
- precisa existir validação estrutural para evitar regra apontando para campo inexistente.

---

# 5.15. template
Representa um modelo reutilizável de formulário.

### Campos principais
- id
- nome
- descricao
- formulario_base_id
- tipo_template
- bloqueia_estrutura
- bloqueia_estilo
- bloqueia_campos_obrigatorios
- area_id
- status
- criado_por
- criado_em

### Regras
- template pode apontar para um formulário ou versão base conforme estratégia adotada.
- não deve misturar template com formulário em uso operacional sem controle.

---

# 5.16. tag
Representa classificações livres.

### Campos principais
- id
- nome
- cor
- status
- criado_em

---

# 5.17. formulario_tag
Relaciona formulários a tags.

### Campos principais
- id
- formulario_id
- tag_id

---

# 5.18. formulario_publicacao
Representa uma disponibilização concreta de uma versão do formulário.

### Finalidade
Separar a existência da versão de sua disponibilidade operacional.

### Campos principais
- id
- formulario_id
- formulario_versao_id
- tipo_acesso
- titulo_publicacao
- url_slug
- qr_code_ref
- inicio_vigencia_em
- fim_vigencia_em
- limite_respostas
- total_respostas
- permite_edicao_resposta
- captcha_habilitado
- rate_limit_habilitado
- mensagem_abertura
- mensagem_encerramento
- mensagem_expirado
- mensagem_indisponivel
- status
- publicado_por
- publicado_em
- atualizado_em

### Regras
- uma versão pode ter uma ou mais publicações dependendo da estratégia do produto.
- `tipo_acesso` define se é público, privado, restrito etc.
- disponibilidade não deve ser inferida apenas do status do formulário.

### Status sugeridos
- ativa
- pausada
- encerrada
- expirada
- removida

---

# 5.19. formulario_publicacao_alvo
Define restrições ou alvos de acesso da publicação.

### Finalidade
Permitir publicar para escopos específicos.

### Campos principais
- id
- publicacao_id
- tipo_alvo
- valor_alvo
- criado_em

### Exemplos de alvo
- domínio de e-mail
- área
- unidade
- usuário específico
- perfil

---

# 5.20. resposta
Representa uma submissão completa do formulário.

### Campos principais
- id
- formulario_id
- formulario_versao_id
- publicacao_id
- respondente_identidade_id
- protocolo
- status
- iniciado_em
- enviado_em
- editado_em
- origem_ip
- user_agent
- duracao_segundos
- score_validacao
- criado_em

### Regras
- resposta deve sempre apontar para `formulario_versao_id`.
- `protocolo` deve ser único quando usado.
- a submissão deve refletir o estado final da coleta.

### Status sugeridos
- em_andamento
- enviada
- editada
- invalidada
- cancelada

---

# 5.21. resposta_item
Representa a resposta de um campo específico dentro de uma submissão.

### Campos principais
- id
- resposta_id
- campo_id
- campo_codigo
- tipo_campo
- valor_texto
- valor_numero
- valor_decimal
- valor_data
- valor_hora
- valor_booleano
- valor_json
- ordem_captura
- criado_em

### Estratégia de modelagem
Aqui existem dois caminhos comuns:

### Caminho A — EAV puro e solto
Joga tudo em chave e valor genérico.

### Caminho B — Estrutura híbrida controlada
Mantém colunas tipadas principais e usa JSON apenas para casos especiais.

### Recomendação
Usar **estrutura híbrida controlada**.

Motivo:
- evita rigidez excessiva;
- evita bagunça total;
- melhora validação;
- melhora consultas comuns;
- mantém certa flexibilidade.

### Regras
- `campo_id` deve apontar para o campo da versão correspondente.
- `campo_codigo` ajuda em histórico e exportações.
- `valor_json` deve ser reservado para estruturas mais complexas, como múltiplas opções, metadados ou formatos específicos.

---

# 5.22. resposta_anexo
Representa arquivos enviados em resposta.

### Campos principais
- id
- resposta_id
- resposta_item_id
- campo_id
- nome_original
- nome_armazenado
- mime_type
- tamanho_bytes
- storage_path
- hash_arquivo
- criado_em

### Regras
- acesso ao anexo deve respeitar permissão.
- o banco guarda metadados; o arquivo fica em storage apropriado.

---

# 5.23. respondente_identidade
Representa a identidade do respondente quando rastreável.

### Finalidade
Separar identidade do respondente da resposta em si, com flexibilidade para cenários autenticados e públicos.

### Campos principais
- id
- usuario_id
- nome_informado
- email_informado
- documento_informado
- tipo_identidade
- criado_em

### Tipos sugeridos
- usuario_autenticado
- convidado_identificado
- anonimo

---

# 5.24. auditoria_evento
Representa eventos auditáveis do sistema.

### Campos principais
- id
- usuario_id
- modulo
- entidade
- entidade_id
- acao
- descricao
- ip_origem
- user_agent
- data_evento
- correlacao_id

### Exemplos de ação
- criar
- editar
- publicar
- exportar
- arquivar
- login
- redefinir_senha

---

# 5.25. auditoria_detalhe
Representa detalhes estruturados do evento de auditoria.

### Campos principais
- id
- auditoria_evento_id
- campo
- valor_anterior
- valor_novo

### Regras
- útil para rastrear mudanças sensíveis em nível de atributo.

---

# 5.26. configuracao_sistema
Representa parâmetros globais da plataforma.

### Campos principais
- id
- chave
- valor
- tipo_valor
- descricao
- atualizado_por
- atualizado_em

### Exemplos
- tamanho_maximo_upload
- dias_retencao_resposta
- politica_senha
- dominios_permitidos

---

## 6. Relacionamentos principais

### Relacionamentos centrais do domínio
- `formulario` 1:N `formulario_versao`
- `formulario_versao` 1:N `formulario_secao`
- `formulario_versao` 1:N `formulario_campo`
- `formulario_secao` 1:N `formulario_campo`
- `formulario_campo` 1:N `formulario_campo_opcao`
- `formulario_versao` 1:N `formulario_regra_condicional`
- `formulario_versao` 1:N `formulario_publicacao`
- `formulario_publicacao` 1:N `resposta`
- `resposta` 1:N `resposta_item`
- `resposta_item` 1:N `resposta_anexo`
- `usuario` N:N `perfil`
- `perfil` N:N `permissao`
- `formulario` N:N `tag`

### Relacionamentos de governança
- `usuario` 1:N `auditoria_evento`
- `auditoria_evento` 1:N `auditoria_detalhe`

---

## 7. Regras de integridade essenciais

### 7.1. Resposta vinculada à versão
Nenhuma resposta pode existir sem vínculo com `formulario_versao`.

### 7.2. Campo vinculado à versão
Nenhum `resposta_item` pode apontar para campo de outra versão.

### 7.3. Unicidade de versão
Não pode existir duas versões com o mesmo número dentro do mesmo formulário.

### 7.4. Ordenação explícita
Seções, campos e opções devem ter ordenação persistida.

### 7.5. Exclusão lógica em entidades críticas
Formulários, usuários, templates e publicações devem priorizar exclusão lógica ou desativação.

### 7.6. Integridade de auditoria
Eventos auditáveis não devem depender de dados transitórios do front-end para existir.

---

## 8. Estratégias para campos dinâmicos
Esse é o ponto onde muita gente faz merda.

Existem três abordagens clássicas:

### 8.1. Tabela fixa por tipo de formulário
Ruim. Engessa demais e explode a complexidade.

### 8.2. JSON puro para tudo
Rápido no início, miserável depois. Vira terra sem lei para validação, filtro e relatório.

### 8.3. Modelo híbrido controlado
Estrutura formal para definição do formulário + resposta_item com colunas tipadas principais + JSON só onde faz sentido.

### Recomendação oficial
Usar **modelo híbrido controlado**.

É o melhor equilíbrio entre:
- flexibilidade;
- consistência;
- capacidade de consulta;
- evolução futura.

---

## 9. Convenções de nomenclatura

### 9.1. Convenções gerais
- nomes de tabelas em `snake_case`;
- chave primária padrão `id`;
- chaves estrangeiras com sufixo `_id`;
- datas com sufixo `_em`;
- flags booleanas com nomes objetivos;
- status controlados por enum/domínio claro.

### 9.2. Campos de auditoria padrão
Sempre que fizer sentido, incluir:
- criado_em
- atualizado_em
- criado_por
- atualizado_por
- status

---

## 10. Índices recomendados

### Índices funcionais prioritários
- `usuario(email)` único
- `usuario(login)` único, se aplicável
- `formulario(nome)`
- `formulario(status)`
- `formulario_versao(formulario_id, numero_versao)` único
- `formulario_secao(formulario_versao_id, ordem)`
- `formulario_campo(formulario_versao_id, codigo_interno)` único
- `formulario_campo(formulario_versao_id, ordem)`
- `formulario_campo_opcao(campo_id, ordem)`
- `formulario_publicacao(url_slug)` único quando aplicável
- `resposta(formulario_id, enviado_em)`
- `resposta(formulario_versao_id, enviado_em)`
- `resposta(publicacao_id, status)`
- `resposta_item(resposta_id, campo_id)`
- `auditoria_evento(entidade, entidade_id, data_evento)`
- `auditoria_evento(usuario_id, data_evento)`

### Observação
Índice demais também é burrice. Primeiro indexa o caminho crítico. Depois mede.

---

## 11. Estratégia de versionamento de formulário

### Modelo recomendado
- `formulario` representa a identidade estável do formulário.
- `formulario_versao` representa cada fotografia estrutural válida.
- `formulario_publicacao` define disponibilização operacional.
- `resposta` aponta para a versão respondida.

### Benefícios
- preserva histórico;
- evita mistura de resposta com estrutura alterada;
- permite evolução segura;
- facilita auditoria;
- melhora reprodutibilidade de relatórios.

---

## 12. Estratégia para relatórios e analytics
A modelagem operacional deve suportar analytics básicos, mas não precisa virar data warehouse no primeiro dia.

### Recomendação
- manter modelo transacional limpo;
- criar consultas agregadas e visões específicas conforme necessidade;
- avaliar tabelas derivadas/materializadas só quando houver demanda real;
- evitar contaminar a modelagem principal com gambiarra analítica prematura.

---

## 13. Estratégia de auditoria
Auditoria deve nascer desde o início.

### O que deve ser auditado
- criação de formulário;
- edição de estrutura;
- publicação;
- despublicação;
- mudança de permissão;
- exportação;
- login administrativo;
- arquivamento;
- edição de resposta, quando permitido.

### Nível mínimo de auditoria
- quem fez;
- o que fez;
- em qual entidade;
- quando fez;
- origem da ação;
- detalhes principais da mudança.

---

## 14. Segurança e dados sensíveis

### Regras mínimas
- senha apenas com hash forte;
- anexos fora do banco, com metadados no banco;
- campos sensíveis classificados;
- exportações e acessos críticos auditados;
- possibilidade de mascaramento em leitura/exportação futura.

### Sensibilidade sugerida para campos
- publico
- interno
- sensivel
- confidencial

---

## 15. Considerações sobre exclusão e retenção

### Recomendação
- usar exclusão lógica para entidades administrativas e de definição;
- evitar exclusão física de respostas sem política formal;
- suportar retenção parametrizada para compliance.

### Entidades candidatas a soft delete
- usuario
- formulario
- template
- publicacao
- tag
- categoria

---

## 16. Riscos de modelagem que precisam ser evitados
1. Modelar formulário sem versão.
2. Salvar resposta sem apontar para versão.
3. Colocar toda a estrutura em JSON por preguiça.
4. Tratar regra condicional como detalhe de front-end.
5. Misturar publicação com formulário e perder controle operacional.
6. Não separar identidade do formulário da sua estrutura versionada.
7. Criar uma EAV totalmente genérica e depois sofrer para filtrar, exportar e validar.
8. Deixar auditoria para depois.

---

## 17. Modelo lógico resumido por blocos

### Bloco A — Acesso
- usuario
- perfil
- permissao
- usuario_perfil
- perfil_permissao
- area
- unidade

### Bloco B — Estrutura
- formulario
- formulario_versao
- formulario_secao
- formulario_campo
- formulario_campo_opcao
- formulario_regra_condicional
- template
- categoria_formulario
- tag
- formulario_tag

### Bloco C — Operação
- formulario_publicacao
- formulario_publicacao_alvo
- resposta
- resposta_item
- resposta_anexo
- respondente_identidade

### Bloco D — Governança
- auditoria_evento
- auditoria_detalhe
- configuracao_sistema

---

## 18. Critério de maturidade desta modelagem
Esta modelagem estará boa quando conseguir sustentar, sem gambiarra:
- criação de múltiplos formulários;
- múltiplas versões por formulário;
- múltiplas seções e campos;
- regras condicionais;
- publicações com regras distintas;
- respostas públicas e privadas;
- exportação e consulta;
- auditoria mínima séria.

Se não sustentar isso, está incompleta.

---

## 19. Próximo passo recomendado
Com os requisitos funcionais e a modelagem de dados definidos, o próximo artefato correto é a **arquitetura técnica inicial do sistema**.

A lógica é direta:
- agora já existe o que o sistema faz;
- agora já existe como os dados se organizam;
- então faz sentido definir como os módulos técnicos se conversam, como o backend se estrutura, como o frontend consome isso e como o sistema cresce sem virar bagunça.

---

## 20. Conclusão
A modelagem proposta foi desenhada para evitar os erros mais comuns desse tipo de produto:
- improviso estrutural;
- ausência de versionamento;
- mistura entre definição e resposta;
- dependência excessiva de JSON;
- falta de governança.

A recomendação firme é manter essa linha e não ceder à tentação de simplificar o que não pode ser simplificado.

Simplificar interface é ótimo.
Simplificar o coração do domínio de forma burra é o caminho mais rápido para foder o projeto.

