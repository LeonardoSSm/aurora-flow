import { Download, FilePlus2, Inbox, ListChecks, Send, Sheet } from 'lucide-react';
import type { DocArticle } from '../../docs-kit';

export const FORMULARIOS_ARTICLES: DocArticle[] = [
  {
    slug: 'criar-um-formulario',
    title: 'Criar um formulário',
    group: 'formularios',
    icon: FilePlus2,
    summary: 'Do botão "Novo Formulário" até um rascunho pronto para receber perguntas.',
    tags: ['criar', 'novo formulário', 'rascunho', 'construtor', 'builder'],
    requiresPermission: { code: 'forms.create', label: 'criar formulários' },
    primary: [
      {
        id: 'criar',
        title: 'Criando',
        blocks: [
          {
            kind: 'steps',
            steps: [
              {
                title: 'Comece pelo botão',
                text: 'Use **Novo Formulário**, no rodapé do menu lateral. Ele está disponível de qualquer tela.',
              },
              {
                title: 'Dê nome e contexto',
                text: 'O nome é o que as pessoas verão. A área classifica o processo; quem vai enxergar e atender os pedidos é quem você der acesso em "Pessoas com acesso" — você, que criou, já é gestor dele.',
              },
              {
                title: 'Monte as perguntas',
                text: 'O construtor abre em seguida. Adicione seções e campos conforme o artigo sobre campos e seções.',
              },
              {
                title: 'Salve como rascunho',
                text: 'Enquanto o formulário for rascunho, ninguém de fora consegue abrir o link. Você pode salvar e voltar quantas vezes quiser.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'success',
            title: 'Duplicar poupa tempo',
            text: 'Se já existe um formulário parecido, duplique-o em vez de começar do zero. A cópia nasce como rascunho e não interfere no original nem nas respostas dele.',
          },
        ],
      },
      {
        id: 'estados',
        title: 'Os estados de um formulário',
        blocks: [
          {
            kind: 'table',
            columns: ['Estado', 'O que significa'],
            rows: [
              ['Rascunho', 'Em construção. O link público não funciona.'],
              ['Publicado', 'No ar, aceitando respostas.'],
              ['Pausado', 'Continua existindo, mas não aceita respostas no momento.'],
              ['Expirado', 'Encerrado por prazo.'],
              ['Arquivado', 'Fora de uso. As respostas já recebidas continuam guardadas.'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Excluir não apaga respostas',
            text: 'Formulário excluído sai da sua lista, mas o histórico de quem respondeu é preservado. É proposital: relatório antigo não pode ficar sem base.',
          },
        ],
      },
    ],
  },

  {
    slug: 'campos-e-secoes',
    title: 'Campos, seções e perguntas condicionais',
    group: 'formularios',
    icon: ListChecks,
    summary: 'Como montar as perguntas e fazer o formulário mudar conforme a resposta.',
    tags: ['campo', 'pergunta', 'seção', 'condicional', 'obrigatório', 'tipos'],
    requiresPermission: { code: 'forms.edit', label: 'editar formulários' },
    primary: [
      {
        id: 'organizacao',
        title: 'Seções organizam, campos perguntam',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Uma **seção** é um bloco de perguntas — pense em "Dados do solicitante", "Detalhes do pedido". Quem responde avança de seção em seção, o que deixa formulários longos bem mais leves.',
          },
          {
            kind: 'paragraph',
            text: 'Dentro da seção ficam os **campos**. Cada campo tem um tipo, que muda o que a pessoa vê e o que o sistema aceita.',
          },
          {
            kind: 'table',
            columns: ['Quando você quer…', 'Use o tipo'],
            rows: [
              ['Uma frase curta ou um texto longo', 'Texto curto · Texto longo'],
              ['Um número ou um valor em dinheiro', 'Número · Moeda'],
              ['Uma data, hora ou os dois', 'Data · Hora · Data e hora'],
              ['Um dado com formato conhecido', 'E-mail · Telefone · CPF · CNPJ · CEP'],
              ['Escolher uma ou várias opções', 'Seleção única · Seleção múltipla · Caixa de marcação'],
              ['Receber um arquivo', 'Envio de arquivo'],
              ['Entregar um arquivo para a pessoa baixar (ex.: um termo para assinar e devolver)', 'Arquivo para baixar'],
              ['Uma nota ou avaliação', 'Escala · Avaliação'],
              ['Calcular algo automaticamente a partir de outros campos', 'Cálculo (fórmula)'],
              ['Uma lista fixa de produtos, com quantidade ou outros dados por item', 'Tabela de produtos'],
              ['Só explicar algo, sem perguntar', 'Título · Descrição · Divisor'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Cálculo e tabela de produtos andam juntos',
            text: 'Na "Tabela de produtos" você fixa os produtos e escolhe quais colunas quem responde preenche (ex.: quantidade). Um campo de "Cálculo" pode somar essas colunas automaticamente — por exemplo, multiplicar quantidade por valor unitário linha a linha e mostrar o total, sem a pessoa precisar calcular nada.',
          },
          {
            kind: 'callout',
            tone: 'success',
            title: 'Marque como obrigatório só o que for mesmo',
            text: 'Cada campo obrigatório a mais é um motivo a mais para a pessoa desistir no meio. Se dá para descobrir depois, deixe opcional.',
          },
        ],
      },
      {
        id: 'condicionais',
        title: 'Perguntas que dependem da resposta',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Você pode fazer o formulário se adaptar: uma seção só aparece se a pessoa respondeu de determinado jeito na anterior. É o que evita mostrar dez perguntas irrelevantes para quem escolheu a opção mais simples.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Monte as seções primeiro',
                text: 'Crie todas as seções, inclusive as que só aparecem em alguns casos.',
              },
              {
                title: 'Defina para onde cada resposta leva',
                text: 'Na seção que decide o caminho, configure a ramificação: para cada resposta, qual a próxima seção.',
              },
              {
                title: 'Teste antes de publicar',
                text: 'Use a pré-visualização e percorra cada caminho possível. Ramificação errada só aparece quando alguém já respondeu.',
              },
            ],
          },
        ],
      },
      {
        id: 'editar-publicado',
        title: 'Editar um formulário que já está no ar',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Pode editar. As respostas antigas continuam exatamente como foram dadas — elas guardam a versão do formulário que existia na hora do preenchimento.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Cuidado ao mexer em perguntas já respondidas',
            text: 'Renomear ou remover um campo que já tem respostas não apaga nada, mas a exportação passa a misturar perguntas diferentes na mesma coluna. Para mudanças grandes, é mais seguro duplicar e publicar um formulário novo.',
          },
        ],
      },
    ],
  },

  {
    slug: 'publicar-e-compartilhar',
    title: 'Publicar e compartilhar o link',
    group: 'formularios',
    icon: Send,
    summary: 'Como colocar o formulário no ar e o que acontece depois que alguém responde.',
    tags: ['publicar', 'link', 'compartilhar', 'público', 'divulgar', 'pausar'],
    requiresPermission: { code: 'forms.publish', label: 'publicar formulários' },
    primary: [
      {
        id: 'publicar',
        title: 'Colocando no ar',
        blocks: [
          {
            kind: 'steps',
            steps: [
              {
                title: 'Revise a pré-visualização',
                text: 'Responda seu próprio formulário do começo ao fim. É o momento de perceber pergunta confusa e campo obrigatório demais.',
              },
              {
                title: 'Publique',
                text: 'Na lista de formulários ou dentro do construtor, mude o estado para publicado.',
              },
              {
                title: 'Copie o link e divulgue',
                text: 'O link público é aberto: qualquer pessoa com ele consegue responder, sem login. Divulgue por e-mail, intranet ou QR code.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'Link público é público mesmo',
            text: 'Quem tiver o endereço consegue responder, mesmo de fora da empresa. Não use formulário público para coletar algo que só pode circular internamente.',
          },
        ],
      },
      {
        id: 'depois',
        title: 'O que acontece quando alguém responde',
        blocks: [
          {
            kind: 'list',
            items: [
              'A resposta aparece em **Respostas**.',
              'Dependendo da configuração, uma **solicitação** é aberta automaticamente para a equipe atender.',
              'Se o formulário está ligado a uma planilha do Google, a linha é acrescentada lá em poucos segundos.',
              'Quem respondeu recebe um link de acompanhamento, para consultar o andamento sem precisar de login.',
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Precisou parar de receber?',
            text: 'Pause o formulário em vez de arquivar. Pausado, ele volta ao ar com um clique e mantém tudo configurado.',
          },
        ],
      },
    ],
  },

  {
    slug: 'planilha-do-google',
    title: 'Ligar o formulário a uma planilha do Google',
    group: 'formularios',
    icon: Sheet,
    summary: 'Como fazer cada resposta virar uma linha numa planilha, e o que fazer quando parar de sincronizar.',
    tags: ['google', 'planilha', 'sheets', 'sincronizar', 'exportação automática'],
    primary: [
      {
        id: 'conectar',
        title: 'Antes de tudo, conecte sua conta Google',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O sistema cria e atualiza a planilha **em seu nome**. Por isso, o primeiro passo é conectar sua conta Google nas configurações da sua conta. Sem isso, a opção de planilha não funciona.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'A planilha fica vinculada a quem conectou',
            text: 'Se essa pessoa sair da empresa ou desconectar a conta, a sincronização daquele formulário para. Para formulários importantes, prefira uma conta que não dependa de uma pessoa só.',
          },
        ],
      },
      {
        id: 'ativar',
        title: 'Ativando no formulário',
        blocks: [
          {
            kind: 'steps',
            steps: [
              {
                title: 'Ative a integração',
                text: 'Nas configurações do formulário, ligue a opção de Google Sheets.',
              },
              {
                title: 'Deixe o sistema criar a planilha',
                text: 'Ele cria a planilha com uma coluna por pergunta e guarda o link. Você pode abrir a planilha direto pela tela do formulário.',
              },
              {
                title: 'Confira o primeiro envio',
                text: 'Responda uma vez e veja a linha aparecer. Se aparecer, está tudo certo daqui em diante.',
              },
            ],
          },
        ],
      },
      {
        id: 'nao-sincronizou',
        title: 'A resposta não chegou na planilha',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A gravação não é instantânea: as respostas entram numa fila e são escritas em poucos segundos. Se passou disso, a tela do formulário mostra a situação da sincronização e oferece duas ações.',
          },
          {
            kind: 'table',
            columns: ['Ação', 'Quando usar'],
            rows: [
              [
                'Reenfileirar',
                'Quando a sincronização parece travada. Recoloca na fila o que ficou pendente.',
              ],
              [
                'Reprocessar',
                'Quando respostas antigas nunca chegaram à planilha. Recria os envios que faltaram, sem duplicar os que já foram.',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Nenhuma resposta se perde',
            text: 'Mesmo que a planilha falhe, a resposta está guardada no sistema. A planilha é uma cópia de conveniência, nunca a fonte da verdade.',
          },
        ],
      },
    ],
  },

  {
    slug: 'ver-respostas',
    title: 'Consultar os registros',
    group: 'formularios',
    icon: Inbox,
    summary: 'Onde ficam os pedidos de cada processo e como filtrar pelas respostas, por período ou buscar um específico.',
    tags: ['registros', 'respostas', 'consultar', 'ver', 'buscar', 'filtrar', 'período', 'preenchimento'],
    requiresPermission: { code: 'responses.view', label: 'visualizar respostas' },
    primary: [
      {
        id: 'onde',
        title: 'Onde ficam',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Em **Processos**, clique em **Registros** na linha do processo (fica ao lado do **Kanban**; dentro do Kanban há o mesmo botão no topo). A tela lista cada pedido com a fase, o status, o responsável e as respostas do formulário. Clique numa linha para abrir o preenchimento por inteiro.',
          },
          {
            kind: 'paragraph',
            text: 'Para encontrar o que precisa: a **busca** procura no título, no solicitante, no responsável e nas respostas; o **período** filtra pela data de abertura ou da última atualização; em **Filtros**, escolha uma pergunta do formulário (ou a fase, o status, o responsável) e marque as respostas que quer ver. Os filtros se somam. Em **Colunas**, escolha o que a tabela mostra.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Você vê o que o seu acesso permite',
            text: 'A lista mostra só os processos a que você tem acesso. Se um número não bate com o de um colega, geralmente é isso: cada um vê os processos dele.',
          },
          {
            kind: 'paragraph',
            text: 'Alguns campos podem ser marcados como sensíveis. Sem a permissão específica, eles aparecem ocultos — inclusive nas exportações.',
          },
        ],
      },
    ],
  },

  {
    slug: 'exportar-respostas',
    title: 'Exportar respostas',
    group: 'formularios',
    icon: Download,
    summary: 'Montar um relatório em PDF do seu jeito (ou baixar em CSV) a partir dos Registros.',
    tags: ['exportar', 'baixar', 'csv', 'excel', 'pdf', 'relatório', 'modelo', 'registros'],
    requiresPermission: { code: 'responses.export', label: 'exportar respostas' },
    primary: [
      {
        id: 'formatos',
        title: 'Qual formato escolher',
        blocks: [
          {
            kind: 'table',
            columns: ['Formato', 'Melhor para'],
            rows: [
              ['PDF', 'Guardar ou enviar como relatório, com título, grupos e totais'],
              ['CSV', 'Abrir no Excel ou importar em outro sistema'],
            ],
          },
          {
            kind: 'paragraph',
            text: 'Nos **Registros** do processo, aplique os filtros e clique em **Exportar relatório**. No montador, escolha e arraste as colunas (dá para trocar o título de cada uma só no PDF), agrupe (por fase, por uma resposta…), ordene, escolha tabela ou ficha por registro e retrato ou paisagem. Entram no arquivo todos os registros filtrados, não só os da página. Gostou da montagem? **Salve como modelo**: ele fica no processo para todos que exportam nele.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Toda exportação fica registrada',
            text: 'O sistema guarda quem exportou, de qual formulário, em que formato e quantos registros. É auditoria: use com a mesma responsabilidade de quem leva dado da empresa para fora.',
          },
        ],
      },
    ],
  },
];
