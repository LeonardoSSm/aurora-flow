# Documento de Requisitos Funcionais Detalhados — Plataforma de Criação e Gestão de Formulários

## 1. Objetivo do documento
Este documento detalha os requisitos funcionais da plataforma de criação e gestão de formulários, com foco em transformar a visão do produto em funcionalidades concretas, operacionais e implementáveis.

O objetivo aqui não é discutir tecnologia ou interface em profundidade, mas definir **o que o sistema deve fazer**, **quem pode fazer**, **em quais condições**, e **quais comportamentos são esperados**.

---

## 2. Objetivo do sistema
A plataforma deve permitir que usuários autorizados criem, editem, versionem, publiquem e acompanhem formulários digitais com alto nível de personalização, controle de acesso, governança e rastreabilidade, possibilitando coleta estruturada de dados para uso interno ou externo.

---

## 3. Escopo funcional deste documento
Este documento cobre os requisitos relacionados a:
- autenticação e controle de acesso;
- gestão de usuários e perfis;
- gestão de formulários;
- construção de formulários;
- publicação;
- coleta de respostas;
- consulta de respostas;
- relatórios e exportação;
- templates;
- auditoria e governança;
- configurações administrativas.

---

## 4. Perfis funcionais do sistema

### 4.1. Administrador da plataforma
Usuário com acesso total às configurações globais, permissões, templates corporativos, auditoria e administração geral.

### 4.2. Gestor de área
Usuário responsável por formulários de uma área, setor, unidade ou domínio específico.

### 4.3. Editor de formulário
Usuário autorizado a criar e editar formulários, mas com escopo restrito de governança.

### 4.4. Respondente autenticado
Usuário interno autenticado que responde formulários privados ou vinculados a regras organizacionais.

### 4.5. Respondente externo
Usuário sem acesso administrativo à plataforma, que responde formulários públicos por link, QR Code ou convite.

### 4.6. Auditor/Analista
Usuário com permissão de leitura de logs, versões, alterações e dados analíticos, sem necessariamente editar formulários.

---

## 5. Premissas funcionais
1. Um formulário possui ciclo de vida controlado.
2. Um formulário pode existir em múltiplas versões.
3. Cada resposta deve ser associada à versão exata do formulário respondido.
4. O sistema deve suportar formulários públicos e privados.
5. O sistema deve suportar regras de validação e lógica condicional.
6. O sistema deve permitir rastreabilidade das principais ações.
7. Nem todo usuário poderá criar, publicar ou exportar dados.

---

## 6. Requisitos funcionais detalhados

# RF-01 — Autenticação de usuários
O sistema deve permitir autenticação de usuários cadastrados por meio de credenciais válidas.

### Regras
- O usuário deve informar identificador e senha.
- O sistema deve validar as credenciais.
- Em caso de sucesso, deve conceder acesso conforme perfil e permissões.
- Em caso de falha, deve informar erro sem expor detalhes sensíveis.

### Critérios de aceitação
- Usuário válido consegue entrar no sistema.
- Usuário inválido não consegue acessar.
- Usuário inativo não consegue autenticar.

---

# RF-02 — Recuperação de senha
O sistema deve permitir que o usuário solicite recuperação de senha.

### Regras
- O sistema deve receber a solicitação de recuperação.
- Deve gerar mecanismo seguro de redefinição.
- Deve permitir cadastro de nova senha dentro de janela válida.

### Critérios de aceitação
- Usuário consegue solicitar recuperação.
- Link/token expirado não pode ser reutilizado.
- Nova senha substitui a anterior.

---

# RF-03 — Cadastro e manutenção de usuários
O sistema deve permitir criação, edição, ativação e inativação de usuários autorizados.

### Regras
- Apenas perfis autorizados podem cadastrar usuários.
- O cadastro deve conter informações mínimas obrigatórias.
- O sistema deve permitir vincular usuários a perfis, áreas e unidades.

### Critérios de aceitação
- Administrador consegue criar usuário.
- Usuário inativo não acessa o sistema.
- Alterações cadastrais ficam disponíveis para uso imediato ou após regra configurada.

---

# RF-04 — Gestão de perfis e permissões
O sistema deve permitir controlar o que cada tipo de usuário pode visualizar e executar.

### Regras
- Permissões devem ser associadas a perfis.
- O sistema deve impedir ações sem permissão.
- Deve ser possível restringir acesso por módulo, formulário, área ou operação.

### Critérios de aceitação
- Usuário sem permissão não acessa função restrita.
- Perfil alterado impacta permissões do usuário.
- Ações administrativas só ficam visíveis para perfis autorizados.

---

# RF-05 — Criação de formulário
O sistema deve permitir criação de um novo formulário em modo rascunho.

### Regras
- O formulário deve possuir nome obrigatório.
- O formulário pode possuir descrição, categoria, tags, área responsável e finalidade.
- Todo formulário novo deve iniciar como rascunho.

### Critérios de aceitação
- Usuário autorizado consegue criar formulário vazio.
- Formulário criado fica disponível para edição posterior.
- Formulário sem nome não pode ser salvo como válido.

---

# RF-06 — Edição de metadados do formulário
O sistema deve permitir editar os dados gerais do formulário.

### Regras
- Nome, descrição, categoria, tags, responsável e instruções devem ser editáveis conforme permissão.
- Alterações devem respeitar o estado do formulário e regra de versionamento.

### Critérios de aceitação
- Metadados podem ser alterados em rascunho.
- Alterações relevantes em formulário publicado devem seguir política de nova versão quando aplicável.

---

# RF-07 — Organização por seções
O sistema deve permitir dividir o formulário em seções ou blocos lógicos.

### Regras
- O usuário deve poder criar, editar, reordenar e remover seções.
- Cada seção pode possuir título e descrição.
- Uma seção pode conter múltiplos campos.

### Critérios de aceitação
- Usuário consegue inserir mais de uma seção.
- Reordenação de seções altera a apresentação do formulário.

---

# RF-08 — Criação de campos
O sistema deve permitir inserir campos em um formulário.

### Tipos mínimos suportados
- texto curto;
- texto longo;
- número;
- data;
- hora;
- e-mail;
- telefone;
- CPF/CNPJ;
- seleção única;
- múltipla seleção;
- checkbox;
- upload de arquivo;
- escala;
- nota/avaliação;
- título informativo;
- descrição;
- separador visual.

### Regras
- Cada campo deve possuir identificador interno único.
- Cada campo deve possuir rótulo visível.
- O sistema deve permitir definir ajuda/instrução do campo.
- O sistema deve permitir reordenar campos.

### Critérios de aceitação
- Usuário consegue adicionar campo de qualquer tipo suportado.
- Campo aparece na pré-visualização conforme configuração.

---

# RF-09 — Configuração de campos
O sistema deve permitir configurar propriedades específicas de cada campo.

### Configurações mínimas
- obrigatório ou opcional;
- valor padrão;
- placeholder;
- tamanho mínimo e máximo;
- máscara;
- validação de formato;
- limite de caracteres;
- número mínimo e máximo;
- múltiplas opções;
- ordem das opções;
- ajuda contextual.

### Critérios de aceitação
- Propriedades do campo impactam a coleta da resposta.
- Campo obrigatório impede envio incompleto.

---

# RF-10 — Gerenciamento de opções de resposta
O sistema deve permitir criar e manter listas de opções para campos selecionáveis.

### Regras
- O usuário pode adicionar, remover e reordenar opções.
- Deve ser possível definir valor interno e rótulo visível.
- O sistema deve permitir marcar opção padrão quando aplicável.

### Critérios de aceitação
- Campo de seleção exibe todas as opções cadastradas.
- Reordenação impacta apresentação final.

---

# RF-11 — Validação de preenchimento
O sistema deve validar os dados informados antes da submissão.

### Regras
- O sistema deve validar obrigatoriedade.
- Deve validar formato quando aplicável.
- Deve validar limites de texto, número, data ou quantidade.
- Deve impedir envio de resposta inválida.

### Critérios de aceitação
- Resposta inválida exibe erro claro.
- Resposta válida pode ser enviada.

---

# RF-12 — Lógica condicional
O sistema deve permitir regras que alterem o comportamento do formulário com base nas respostas.

### Exemplos de comportamento
- exibir campo se condição for verdadeira;
- ocultar campo;
- tornar obrigatório sob condição;
- pular para outra seção;
- encerrar formulário com mensagem específica.

### Regras
- Condições devem usar campos compatíveis.
- O sistema deve processar a lógica em tempo de preenchimento.
- Regras inválidas ou quebradas devem ser bloqueadas na configuração.

### Critérios de aceitação
- Campo aparece ou desaparece corretamente conforme resposta.
- Fluxo do formulário muda conforme condição configurada.

---

# RF-13 — Pré-visualização do formulário
O sistema deve permitir visualizar o formulário antes da publicação.

### Regras
- A pré-visualização deve refletir estrutura, ordem, validações e lógica configuradas.
- Deve ser possível testar o preenchimento sem gravar resposta oficial, salvo regra específica.

### Critérios de aceitação
- Usuário consegue validar experiência do formulário antes da publicação.

---

# RF-14 — Salvamento em rascunho
O sistema deve permitir salvar alterações sem publicar o formulário.

### Regras
- O salvamento deve preservar estrutura, campos, regras e metadados.
- Apenas formulários publicados devem ficar disponíveis para respondentes.

### Critérios de aceitação
- Formulário em rascunho não pode ser respondido externamente.
- Usuário pode continuar edição posteriormente.

---

# RF-15 — Versionamento do formulário
O sistema deve permitir versionar formulários quando houver alterações relevantes.

### Regras
- Toda versão deve possuir identificação única.
- Respostas devem ficar vinculadas à versão respondida.
- Alterações estruturais em formulário publicado devem gerar nova versão conforme política definida.
- O sistema deve preservar histórico de versões anteriores.

### Critérios de aceitação
- Nova versão não corrompe respostas antigas.
- Histórico de versões fica consultável para usuários autorizados.

---

# RF-16 — Duplicação de formulário
O sistema deve permitir duplicar um formulário existente.

### Regras
- A duplicação deve copiar estrutura, seções, campos e configurações compatíveis.
- O novo formulário deve nascer como rascunho.
- Respostas do formulário original não devem ser copiadas.

### Critérios de aceitação
- Usuário consegue usar um formulário como base para outro.

---

# RF-17 — Publicação de formulário
O sistema deve permitir publicar formulários prontos para coleta.

### Regras
- Apenas usuários autorizados podem publicar.
- O formulário deve passar por validação mínima antes da publicação.
- A publicação deve gerar instância ativa de disponibilização.

### Critérios de aceitação
- Formulário publicado pode ser respondido conforme regras de acesso.
- Formulário com erro estrutural não deve ser publicado.

---

# RF-18 — Configuração de disponibilidade
O sistema deve permitir configurar quando e como o formulário ficará disponível.

### Regras
- Deve ser possível definir início e fim de vigência.
- Deve ser possível pausar publicação.
- Deve ser possível limitar quantidade de respostas.
- Deve ser possível definir mensagem de expiração ou indisponibilidade.

### Critérios de aceitação
- Formulário fora da vigência não aceita novas respostas.
- Formulário pausado não fica disponível para preenchimento.

---

# RF-19 — Acesso público e privado
O sistema deve permitir diferentes formas de acesso ao formulário.

### Modalidades mínimas
- público por link;
- público por QR Code;
- privado mediante autenticação;
- restrito por domínio, área, perfil ou lista de usuários.

### Critérios de aceitação
- Formulário público pode ser acessado sem login quando configurado assim.
- Formulário privado exige autenticação válida.
- Usuário sem autorização não responde formulário restrito.

---

# RF-20 — Personalização visual do formulário
O sistema deve permitir customização visual do formulário dentro de padrões definidos.

### Configurações mínimas
- logo;
- título visível;
- paleta de cores;
- imagem de capa opcional;
- tema básico;
- mensagem de abertura e encerramento.

### Critérios de aceitação
- Formulário publicado reflete identidade visual configurada.
- Personalização respeita restrições corporativas quando existirem.

---

# RF-21 — Submissão de respostas
O sistema deve permitir que respondentes enviem suas respostas ao formulário.

### Regras
- O sistema deve validar os dados antes do envio.
- A resposta deve ser persistida integralmente.
- A submissão deve registrar data, hora, versão e contexto mínimo aplicável.

### Critérios de aceitação
- Resposta válida é gravada com sucesso.
- Resposta inválida é rejeitada com mensagem adequada.

---

# RF-22 — Edição de resposta
O sistema deve permitir edição de resposta somente quando essa capacidade estiver habilitada.

### Regras
- A edição pode ser permitida ao respondente, ao administrador ou a ambos, conforme configuração.
- O sistema deve registrar histórico ou sobrescrita conforme política definida.

### Critérios de aceitação
- Resposta não editável não pode ser alterada.
- Resposta editável segue regras configuradas.

---

# RF-23 — Upload de arquivos
O sistema deve permitir envio de arquivos em campos apropriados.

### Regras
- Devem existir limites de tamanho e tipos permitidos.
- O arquivo deve ficar associado à resposta e ao campo correspondente.
- O acesso ao arquivo deve respeitar permissões.

### Critérios de aceitação
- Arquivo válido é aceito.
- Arquivo fora da política é rejeitado.

---

# RF-24 — Controle antifraude básico
O sistema deve permitir mecanismos mínimos de proteção para formulários públicos.

### Regras
- Deve suportar captcha quando configurado.
- Deve permitir limitação por sessão, IP ou outro mecanismo básico.
- Deve registrar tentativas suspeitas quando aplicável.

### Critérios de aceitação
- Proteções configuradas impactam o acesso público.

---

# RF-25 — Consulta de respostas por formulário
O sistema deve permitir consultar respostas recebidas por formulário.

### Regras
- A listagem deve permitir paginação.
- Deve permitir filtros por período, status, respondente e demais atributos relevantes.
- Deve ser possível acessar o detalhe de uma resposta.

### Critérios de aceitação
- Usuário autorizado consegue localizar respostas específicas.

---

# RF-26 — Visualização detalhada de resposta
O sistema deve permitir consultar uma resposta individualmente.

### Regras
- O detalhe deve mostrar respostas por campo, metadados e anexos permitidos.
- O sistema deve indicar versão do formulário respondida.

### Critérios de aceitação
- Usuário autorizado consegue ver claramente o conteúdo de uma submissão.

---

# RF-27 — Exportação de respostas
O sistema deve permitir exportar dados coletados.

### Formatos mínimos
- CSV;
- Excel;
- PDF resumido ou detalhado, quando aplicável.

### Regras
- Exportação deve respeitar permissões.
- Campos sensíveis podem ser mascarados conforme política.
- Exportações devem ser auditadas.

### Critérios de aceitação
- Usuário autorizado exporta dados dentro do escopo permitido.
- Usuário sem permissão não exporta.

---

# RF-28 — Dashboard operacional
O sistema deve permitir visualização resumida do desempenho dos formulários.

### Indicadores mínimos
- total de respostas;
- status do formulário;
- taxa de conclusão;
- período de atividade;
- principais distribuições por campo selecionável.

### Critérios de aceitação
- Usuário autorizado visualiza dados consolidados do formulário.

---

# RF-29 — Templates de formulário
O sistema deve permitir criação e uso de templates.

### Regras
- Um template pode servir como base para novos formulários.
- O template pode conter estrutura, campos, identidade visual e regras padronizadas.
- Pode haver templates corporativos e templates por área.

### Critérios de aceitação
- Usuário consegue iniciar formulário a partir de template.
- Template bloqueado parcialmente mantém elementos obrigatórios.

---

# RF-30 — Arquivamento e desativação de formulário
O sistema deve permitir retirar formulários de uso sem destruir histórico.

### Regras
- Um formulário pode ser pausado, expirado, arquivado ou despublicado conforme estado.
- Respostas antigas devem permanecer preservadas.

### Critérios de aceitação
- Formulário arquivado não aceita novas respostas.
- Histórico continua consultável conforme permissão.

---

# RF-31 — Auditoria de ações administrativas
O sistema deve registrar eventos relevantes de operação.

### Eventos mínimos auditáveis
- criação de formulário;
- edição estrutural;
- publicação;
- despublicação;
- arquivamento;
- exportação;
- alteração de permissões;
- login administrativo;
- edição de resposta, quando aplicável.

### Critérios de aceitação
- Usuário autorizado consegue consultar trilha mínima de auditoria.

---

# RF-32 — Histórico de versões e alterações
O sistema deve permitir consulta do histórico de versões do formulário.

### Regras
- Deve ser possível identificar o que mudou entre versões em nível funcional mínimo.
- O sistema deve exibir data, responsável e contexto da alteração.

### Critérios de aceitação
- Usuário autorizado consegue rastrear evolução do formulário.

---

# RF-33 — Administração de categorias, tags e áreas
O sistema deve permitir gerenciar estruturas organizacionais usadas nos formulários.

### Regras
- Administradores devem poder cadastrar e manter categorias, áreas e classificações.
- Formulários podem ser vinculados a essas estruturas.

### Critérios de aceitação
- Usuário consegue organizar formulários por domínio funcional.

---

# RF-34 — Mensagens de sistema para respondentes
O sistema deve permitir configurar mensagens exibidas ao respondente.

### Exemplos
- mensagem inicial;
- instruções adicionais;
- mensagem de sucesso;
- mensagem de erro;
- mensagem de expiração;
- mensagem de formulário encerrado.

### Critérios de aceitação
- Respondente visualiza mensagens coerentes com o estado do formulário.

---

# RF-35 — Busca e filtragem de formulários
O sistema deve permitir buscar e filtrar formulários cadastrados.

### Filtros mínimos
- nome;
- status;
- área;
- categoria;
- responsável;
- período;
- tag.

### Critérios de aceitação
- Usuário encontra formulário sem depender de navegação manual extensa.

---

# RF-36 — Controle de visibilidade por escopo organizacional
O sistema deve permitir limitar visualização e gestão de formulários por unidade, área ou domínio.

### Regras
- Usuários devem visualizar apenas formulários compatíveis com seu escopo, salvo permissões superiores.

### Critérios de aceitação
- Usuário de uma área não enxerga indevidamente formulários restritos de outra, salvo autorização explícita.

---

# RF-37 — Notificações operacionais básicas
O sistema deve permitir notificações básicas relacionadas ao ciclo do formulário.

### Eventos mínimos
- publicação realizada;
- formulário expirando;
- limite de respostas atingido;
- nova resposta recebida, quando configurado;
- falha operacional relevante.

### Critérios de aceitação
- Usuário autorizado recebe aviso conforme regra configurada.

---

# RF-38 — Administração de parâmetros globais
O sistema deve permitir administrar configurações globais da plataforma.

### Exemplos
- limites de upload;
- políticas de senha;
- domínios permitidos;
- branding institucional;
- retenção de dados;
- parâmetros de auditoria.

### Critérios de aceitação
- Configurações globais impactam comportamento do sistema de forma consistente.

---

## 7. Regras funcionais transversais

### 7.1. Estados do formulário
Todo formulário deve operar com estados controlados, no mínimo:
- rascunho;
- publicado;
- pausado;
- expirado;
- arquivado.

### 7.2. Integridade histórica
O sistema nunca deve perder a referência entre resposta e versão respondida.

### 7.3. Permissão antes da ação
Toda operação crítica deve verificar autenticação, autorização e contexto.

### 7.4. Exclusão lógica
Sempre que aplicável, exclusões administrativas devem preservar histórico.

### 7.5. Auditabilidade
Ações críticas devem deixar rastro mínimo consultável.

---

## 8. Priorização funcional para MVP
Nem tudo aqui deve entrar na primeira entrega. O MVP precisa ser duro, não fofo.

### Funcionalidades prioritárias para MVP
- autenticação;
- perfis básicos;
- criação de formulário;
- criação de seções e campos;
- validações básicas;
- preview;
- publicação simples por link;
- recebimento de respostas;
- consulta de respostas;
- exportação CSV;
- auditoria básica.

### Funcionalidades pós-MVP
- lógica condicional avançada;
- templates robustos;
- dashboards mais sofisticados;
- edição de respostas;
- notificações mais elaboradas;
- políticas avançadas de escopo;
- personalização visual expandida.

---

## 9. Dependências funcionais críticas
Alguns requisitos dependem diretamente de outros.

### Dependências principais
- publicação depende de criação e validação do formulário;
- resposta depende de publicação ativa;
- consulta de resposta depende de persistência correta;
- auditoria depende de eventos registrados;
- templates dependem de estrutura de formulário estável;
- versionamento depende de política clara de alteração.

---

## 10. Riscos funcionais que precisam ser evitados
1. Permitir alterar formulário publicado sem política de versão.
2. Misturar respostas de versões diferentes como se fossem iguais.
3. Não controlar permissões de exportação.
4. Criar lógica condicional sem validação estrutural.
5. Tratar campo dinâmico como gambiarra de front-end.
6. Esquecer auditoria e tentar colocar depois.

---

## 11. Critério de prontidão deste artefato
Este documento estará suficientemente maduro quando:
- os fluxos principais estiverem cobertos;
- as responsabilidades por perfil estiverem claras;
- as regras críticas estiverem explícitas;
- o MVP estiver separado do que é evolução futura;
- a modelagem de dados puder nascer diretamente a partir dele.

---

## 12. Próximo passo recomendado
A partir deste documento, o próximo artefato mais importante é a **modelagem de banco de dados**, porque ela precisa refletir com fidelidade:
- versionamento;
- estrutura dinâmica dos campos;
- respostas por versão;
- publicação;
- permissões;
- auditoria.

Se essa modelagem for feita de forma burra, o projeto já nasce comprometido.

