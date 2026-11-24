import { KeyRound, LifeBuoy, UserCog } from 'lucide-react';
import type { DocArticle } from '../../docs-kit';

export const CONTA_ARTICLES: DocArticle[] = [
  {
    slug: 'sua-conta',
    title: 'Sua conta e suas notificações',
    group: 'conta',
    icon: UserCog,
    summary: 'Dados de perfil, sua senha de acesso, conta Google conectada e por onde chegam os avisos.',
    tags: [
      'perfil',
      'conta',
      'senha',
      'trocar senha',
      'criar senha',
      'google',
      'notificação',
      'aviso',
      'celular',
    ],
    primary: [
      {
        id: 'perfil',
        title: 'Seus dados',
        blocks: [
          {
            kind: 'list',
            items: [
              'Seu nome e e-mail vêm do cadastro feito por um administrador. Para corrigir, peça a ele.',
              'O que você enxerga depende dos **processos a que você tem acesso**, e não da sua área. Se um processo não aparece, peça a quem cuida dele para te dar acesso.',
              'Trocar de senha ou de perfil de acesso encerra suas sessões abertas — é só entrar de novo.',
            ],
          },
        ],
      },
      {
        id: 'senha',
        title: 'Sua senha de acesso',
        blocks: [
          {
            kind: 'list',
            items: [
              'A senha vale para entrar por **e-mail e senha**. Ela não substitui nem interfere no acesso pelo Google: as duas portas convivem.',
              'Regra mínima: **8 caracteres, com uma letra maiúscula, uma minúscula e um número**.',
              'Quem entrou pela primeira vez pelo Google recebe a tela de cadastro logo depois do acesso. Pulou? Ela reaparece no próximo login pelo Google.',
              'Para **trocar** uma senha que você já tem, é preciso informar a senha atual. Se você não lembra dela, quem redefine é um administrador, pela tela de Usuários.',
              'Cadastrar ou trocar a senha derruba suas outras sessões — celular e demais computadores precisam entrar de novo.',
            ],
          },
        ],
      },
      {
        id: 'google',
        title: 'Conta Google conectada',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Conectar sua conta Google serve para duas coisas: entrar no sistema sem senha e permitir que o sistema crie e atualize planilhas em seu nome.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Entrar pelo Google não cria senha sozinho',
            text: 'Se a sua conta nasceu de um login pelo Google, o sistema pede que você cadastre uma senha logo depois do primeiro acesso — é o que libera a entrada por e-mail e senha. O passo a passo está no artigo "Entrar no sistema".',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Desconectar tem efeito colateral',
            text: 'Se algum formulário usa a sua conta para escrever numa planilha, desconectar interrompe essa sincronização. Verifique antes se algum formulário depende de você.',
          },
        ],
      },
      {
        id: 'notificacoes',
        title: 'Por onde chegam os avisos',
        blocks: [
          {
            kind: 'table',
            columns: ['Canal', 'O que costuma chegar'],
            rows: [
              ['Dentro do sistema', 'No sino, no topo da tela, com a quantidade de não lidas: aprovação esperando você e o resultado da que você pediu, solicitação atribuída a você, comentário novo, prazo perto de vencer ou vencido e o andamento das solicitações que você abriu (mudou de status ou de fase). Clique no aviso para abrir a solicitação ou a aprovação'],
              ['Celular (aplicativo)', 'Os mesmos avisos do sino, quando o app está instalado e autorizado'],
              ['E-mail e WhatsApp', 'Somente quando o processo tiver sido configurado para isso'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Não recebeu um aviso que esperava?',
            text: 'Você não recebe aviso do que você mesmo fez (mover o card, comentar, decidir). Avisos por e-mail ou WhatsApp, e avisos para quem está fora do sistema, dependem de o fluxo daquele processo ter sido configurado para enviá-los.',
          },
        ],
      },
    ],
  },

  {
    slug: 'por-que-nao-consigo',
    title: 'Por que não consigo ver ou fazer algo',
    group: 'conta',
    icon: KeyRound,
    summary: 'Como funciona o acesso aos processos, em português claro, e o que pedir.',
    tags: ['permissão', 'acesso negado', 'não aparece', 'não consigo', 'bloqueado', 'perfil', 'processo', 'acesso'],
    primary: [
      {
        id: 'duas-perguntas',
        title: 'O sistema faz duas perguntas sobre você',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Quando você abre uma tela, o sistema decide o que mostrar respondendo duas coisas — e entender essa diferença resolve quase toda dúvida de acesso.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Você tem acesso a este processo?',
                text: 'Cada processo tem a sua lista de pessoas com acesso. Sem estar nela, o processo nem aparece para você — salvo os pedidos que você mesmo abriu e as aprovações para as quais for chamado.',
              },
              {
                title: 'O que você pode fazer nele?',
                text: 'Em cada processo, o que você pode é marcado só para você: ver, abrir pedidos, atuar nos cards, aprovar, exportar, editar o formulário… Você pode operar um processo e só consultar outro.',
              },
            ],
          },
          {
            kind: 'table',
            columns: ['Num processo, você pode ter…', 'Na prática'],
            rows: [
              ['Operador', 'Vê os cards, abre pedidos, atua nas fases, comenta e anexa'],
              ['Consulta', 'Só acompanha: vê os cards, as respostas e o painel'],
              ['Gestor do processo', 'Tudo no processo, inclusive o formulário, as fases, os fluxos e quem tem acesso'],
              ['Ver só os seus cards', 'Apenas os pedidos que você abriu ou dos quais é responsável'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Quem cria o processo é dono dele',
            text: 'Ao criar um processo, você vira gestor dele e decide quem mais tem acesso e o que cada pessoa pode. Seu perfil continua valendo para o que é do sistema, como cadastrar usuários.',
          },
        ],
      },
      {
        id: 'o-que-pedir',
        title: 'O que pedir ao administrador',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Pedir "me dá acesso" costuma render várias idas e vindas. Diga em vez disso **o que você precisa fazer e sobre o quê**:',
          },
          {
            kind: 'list',
            items: [
              '"Preciso atuar no processo de Compras, não só ver os meus pedidos."',
              '"Preciso exportar as respostas do formulário de reembolso."',
              '"Preciso aprovar os pedidos que hoje vão para o Fulano."',
            ],
          },
          {
            kind: 'callout',
            tone: 'success',
            title: 'Mudança de acesso vale em seguida',
            text: 'Quando alguém muda o seu acesso a um processo, o sistema confere na hora; menus e botões se ajustam ao entrar de novo ou quando a sessão se renova. Peça a quem cuida do processo — ou a um administrador.',
          },
        ],
      },
    ],
  },

  {
    slug: 'problemas-comuns',
    title: 'Problemas comuns',
    group: 'conta',
    icon: LifeBuoy,
    summary: 'As dúvidas que mais aparecem, com a explicação e a saída de cada uma.',
    tags: ['problema', 'erro', 'não funciona', 'ajuda', 'suporte', 'dúvida'],
    primary: [
      {
        id: 'lista',
        title: 'O que costuma acontecer',
        blocks: [
          {
            kind: 'table',
            columns: ['Situação', 'O que está acontecendo', 'O que fazer'],
            rows: [
              [
                'O link do formulário não abre para quem vai responder',
                'O formulário está em rascunho, pausado ou arquivado',
                'Publique o formulário e teste o link numa janela anônima',
              ],
              [
                'Respondi e não apareceu nada em Registros',
                'Costuma ser filtro: busca, período ou filtro ainda aplicado, ou seu alcance não cobre aquele pedido',
                'Clique em Limpar tudo nos filtros; se persistir, peça a um administrador para verificar seu acesso',
              ],
              [
                'A resposta não chegou na planilha do Google',
                'A gravação é feita em fila e pode ter falhado, ou a conta Google foi desconectada',
                'Veja a situação na tela do formulário e use reenfileirar ou reprocessar',
              ],
              [
                'A solicitação está parada há dias',
                'Provavelmente está sem responsável definido',
                'Abra a solicitação e defina um responsável',
              ],
              [
                'Aprovei e nada aconteceu',
                'O passo seguinte roda logo depois, não junto; ou o processo exige mais de uma aprovação',
                'Aguarde alguns instantes e recarregue; confira se o pedido ainda espera outro aprovador',
              ],
              [
                'Um colega vê uma tela que eu não vejo',
                'Diferença de permissão ou de alcance entre os perfis',
                'Veja o artigo sobre permissões e peça o acesso descrevendo a tarefa',
              ],
              [
                'Fui deslogado do nada',
                'Alguém alterou seu perfil ou seus dados de acesso',
                'Entre novamente; as novas permissões já valem',
              ],
              [
                'O e-mail automático não chegou',
                'Nem todo processo envia e-mail — depende de o fluxo estar configurado',
                'Confirme com quem administra o processo se esse aviso existe',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Ao pedir ajuda, mande o link',
            text: 'O endereço da página em que o problema aconteceu, o horário aproximado e o que você esperava que acontecesse resolvem mais rápido que qualquer descrição longa.',
          },
        ],
      },
    ],
  },
];
