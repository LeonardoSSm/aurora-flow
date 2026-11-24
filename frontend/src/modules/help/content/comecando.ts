import { Compass, LayoutGrid, LogIn } from 'lucide-react';
import type { DocArticle } from '../../docs-kit';

export const COMECANDO_ARTICLES: DocArticle[] = [
  {
    slug: 'entrar-no-sistema',
    title: 'Entrar no sistema',
    group: 'comecando',
    icon: LogIn,
    summary:
      'As duas formas de acesso, como criar sua senha no primeiro acesso pelo Google e o que fazer quando a entrada não funciona.',
    tags: [
      'login',
      'entrar',
      'acesso',
      'senha',
      'criar senha',
      'cadastrar senha',
      'primeiro acesso',
      'google',
      'sair',
      'logout',
    ],
    primary: [
      {
        id: 'formas-de-entrar',
        title: 'Duas formas de entrar',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A tela de acesso oferece dois caminhos. O primeiro é o recomendado no dia a dia.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Entrar com Google Workspace',
                text: 'Clique no botão **Entrar com Google Workspace** e escolha sua conta corporativa. É o acesso principal: você não precisa memorizar mais uma senha, e o sistema já sabe quem você é.',
              },
              {
                title: 'Entrar com e-mail e senha',
                text: 'Abaixo, no bloco de acesso local, informe seu e-mail e sua senha. Serve para quem ainda não tem conta corporativa ou quando o login pelo Google está indisponível.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Os dois caminhos levam à mesma conta',
            text: 'É o mesmo usuário, com as mesmas permissões e o mesmo histórico — muda só a porta de entrada. Seu e-mail para o acesso local é o mesmo da conta corporativa.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Só contas da empresa',
            text: 'O acesso pelo Google aceita apenas contas do domínio corporativo. Uma conta pessoal (gmail.com, por exemplo) é recusada mesmo que você consiga escolhê-la na tela do Google.',
          },
        ],
      },
      {
        id: 'criar-senha',
        title: 'Criar sua senha no primeiro acesso pelo Google',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Quando a sua conta nasce do próprio login com o Google, ela ainda não tem senha no sistema — só a porta do Google está aberta. Por isso, logo depois desse primeiro acesso, aparece uma tela pedindo que você crie uma.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Entre com o Google Workspace',
                text: 'Escolha sua conta corporativa normalmente. Em vez de cair direto na tela inicial, você vai parar na tela **Crie sua senha de acesso**.',
              },
              {
                title: 'Crie a senha',
                text: 'O seu e-mail já vem preenchido e não muda. Escolha uma senha com **no mínimo 8 caracteres, incluindo uma letra maiúscula, uma minúscula e um número**, repita na confirmação e salve. A barrinha embaixo do campo indica a força da senha.',
              },
              {
                title: 'Pronto — agora você tem as duas portas',
                text: 'Nas próximas vezes você escolhe: o botão do Google ou seu e-mail com a senha que acabou de criar. Nada muda no que você enxerga dentro do sistema.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Dá para deixar para depois',
            text: 'O link **Agora não, continuar sem senha** leva direto para o sistema. A tela volta a aparecer no próximo acesso pelo Google, até você cadastrar — e enquanto isso o acesso pelo Google continua funcionando normalmente.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Salvar a senha encerra suas outras sessões',
            text: 'Se você estiver logado no celular ou em outro computador, esses acessos caem e será preciso entrar de novo. A sessão em que você criou a senha continua aberta.',
          },
        ],
      },
      {
        id: 'problemas-de-acesso',
        title: 'Quando o acesso não funciona',
        blocks: [
          {
            kind: 'list',
            items: [
              'Errou a senha várias vezes seguidas? O sistema bloqueia novas tentativas daquele e-mail por alguns minutos. Espere um pouco antes de tentar de novo — insistir só renova o bloqueio.',
              'Esqueceu a senha, mas tem conta corporativa? Entre pelo Google: esse caminho independe da senha e você continua com o acesso normal.',
              'Não existe recuperação de senha automática. Quem redefine sua senha é um administrador, pela tela de Usuários.',
              'Se seu acesso foi desativado, a entrada é recusada mesmo com a senha certa. Nesse caso, fale com um administrador.',
              'Se um administrador mudou seu perfil de acesso, sua sessão é encerrada na hora. Basta entrar de novo para as novas permissões valerem.',
            ],
          },
        ],
      },
      {
        id: 'sair',
        title: 'Sair',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O botão **Logout** fica no rodapé do menu lateral, logo abaixo do seu nome. Em computador compartilhado, use sempre — fechar a aba não encerra a sessão.',
          },
        ],
      },
    ],
  },

  {
    slug: 'como-o-sistema-funciona',
    title: 'Como o sistema se organiza',
    group: 'comecando',
    icon: Compass,
    summary:
      'O modelo mental do Aurora Flow em cinco minutos: gatilhos, ações e execuções de automações.',
    tags: ['visão geral', 'entender', 'conceito', 'fluxo', 'começar', 'solicitação'],
    primary: [
      {
        id: 'ideia-central',
        title: 'A ideia central',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Quase tudo no sistema segue o mesmo caminho: **alguém pede alguma coisa, o pedido entra numa fila de trabalho, alguém atende, e quem pediu acompanha até o fim**. Entendido isso, as telas fazem sentido sozinhas.',
          },
          { kind: 'diagram', id: 'caminho-do-pedido' },
        ],
      },
      {
        id: 'palavras',
        title: 'As quatro palavras que aparecem o tempo todo',
        blocks: [
          {
            kind: 'table',
            columns: ['Palavra', 'O que significa na prática'],
            rows: [
              [
                'Formulário',
                'O que a pessoa preenche. Você monta as perguntas e publica um link.',
              ],
              [
                'Resposta',
                'Um preenchimento daquele formulário. Fica guardada exatamente como foi respondida.',
              ],
              [
                'Solicitação',
                'O pedido virado trabalho: tem responsável, prazo, andamento e histórico. É o que a equipe acompanha no quadro.',
              ],
              [
                'Aprovação',
                'Uma parada no meio do caminho em que alguém precisa dizer sim ou não antes de seguir.',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Nem todo pedido começa num formulário',
            text: 'Uma solicitação também pode ser criada à mão pela equipe, ou chegar automaticamente de outro sistema da empresa. O caminho depois é o mesmo.',
          },
        ],
      },
      {
        id: 'seu-papel',
        title: 'Onde você entra nisso',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Você não vai usar tudo. O que aparece no seu menu depende do seu perfil de acesso — e é normal que um colega veja telas que você não vê.',
          },
          {
            kind: 'table',
            columns: ['Se o seu papel é…', 'Comece por'],
            rows: [
              ['Pedir coisas e acompanhar', 'Solicitações e o link de acompanhamento'],
              ['Atender pedidos da sua área', 'Kanban e Solicitações'],
              ['Aprovar', 'Aprovações'],
              ['Criar os formulários que as pessoas preenchem', 'Formulários e Registros'],
              ['Administrar o sistema', 'Administração'],
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'navegando-pelo-sistema',
    title: 'Se achando na tela',
    group: 'comecando',
    icon: LayoutGrid,
    summary: 'O que é cada item do menu lateral e o que a tela inicial mostra.',
    tags: ['menu', 'navegação', 'tela inicial', 'início', 'onde fica'],
    primary: [
      {
        id: 'menu',
        title: 'O menu lateral',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O menu fica à esquerda e se expande quando você passa o mouse. Ele é dividido em **Operação** (o trabalho do dia a dia) e **Administração**.',
          },
          {
            kind: 'table',
            columns: ['Item', 'Para que serve'],
            rows: [
              ['Início', 'Sua página de entrada: atalhos, o que está com você agora e respostas recentes'],
              ['Resumo', 'O que depende de você agora e como está cada processo'],
              ['Formulários', 'Criar, editar e publicar formulários'],
              ['Registros', 'Consultar, filtrar e montar relatórios do que as pessoas responderam'],
              ['Kanban', 'O quadro visual das solicitações, organizado por etapa'],
              ['Solicitações', 'A mesma coisa em forma de lista, com filtros'],
              ['Aprovações', 'O que está esperando a sua decisão'],
              ['Fluxos', 'As automações configuradas'],
              ['Administração', 'Usuários, permissões, configurações, webhooks e WhatsApp, e a documentação técnica'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Item que você não vê não existe para você',
            text: 'O menu esconde o que seu perfil não pode acessar. Se um colega cita uma tela que você não encontra, provavelmente é permissão — veja o artigo sobre isso.',
          },
        ],
      },
      {
        id: 'inicio',
        title: 'A tela inicial',
        blocks: [
          {
            kind: 'list',
            items: [
              'Os cards do meio são atalhos para os módulos que você usa.',
              '**Aprovações pendentes** mostra o que está travado esperando você. Se aparece algo aqui, alguém está aguardando.',
              '**Últimas respostas** mostra os preenchimentos mais recentes dos formulários que você acompanha; clicar abre o Kanban do processo, onde a resposta virou card.',
            ],
          },
          {
            kind: 'paragraph',
            text: 'No rodapé do menu você alterna entre **modo claro** e **modo escuro** e encontra o botão de sair.',
          },
        ],
      },
    ],
  },
];
