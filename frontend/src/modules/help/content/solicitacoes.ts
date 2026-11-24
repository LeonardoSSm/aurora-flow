import { CheckSquare, ClipboardCheck, Link2, Timer, Workflow } from 'lucide-react';
import type { DocArticle } from '../../docs-kit';

export const SOLICITACOES_ARTICLES: DocArticle[] = [
  {
    slug: 'acompanhar-solicitacoes',
    title: 'Acompanhar as solicitações',
    group: 'solicitacoes',
    icon: ClipboardCheck,
    summary: 'O quadro Kanban, a lista com filtros, e como saber o que é seu.',
    tags: ['kanban', 'quadro', 'lista', 'solicitações', 'chamados', 'fila', 'card'],
    requiresPermission: { code: 'solicitations.view', label: 'visualizar solicitações' },
    primary: [
      {
        id: 'duas-visoes',
        title: 'Duas visões da mesma coisa',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O menu tem **Kanban** e **Solicitações**. Não são coisas diferentes: são duas formas de olhar a mesma fila.',
          },
          {
            kind: 'table',
            columns: ['Use', 'Quando'],
            rows: [
              [
                'Kanban',
                'Para enxergar o andamento de tudo de relance e mover pedidos de uma etapa para a outra',
              ],
              [
                'Solicitações',
                'Para procurar algo específico, filtrar por situação ou responsável, ou trabalhar em volume',
              ],
            ],
          },
          {
            kind: 'paragraph',
            text: 'No Kanban, cada formulário tem seu próprio quadro, com as colunas que fazem sentido para aquele processo. Você escolhe o quadro ao entrar.',
          },
        ],
      },
      {
        id: 'o-que-e-meu',
        title: 'Como saber o que é seu',
        blocks: [
          {
            kind: 'list',
            items: [
              'Toda solicitação tem um **responsável**. Enquanto ninguém for definido, ela está sem dono — e é aí que pedido costuma ficar parado.',
              'O que você enxerga depende do seu acesso a cada processo: todos os cards dele, ou só os que você abriu ou dos quais é responsável. Os pedidos que você mesmo abriu aparecem sempre.',
              'A **prioridade** (baixa, média, alta, urgente) serve para ordenar a fila; ela não muda prazo sozinha.',
            ],
          },
          {
            kind: 'callout',
            tone: 'success',
            title: 'Assuma antes de trabalhar',
            text: 'Defina-se como responsável assim que começar a atender. É o que evita duas pessoas resolvendo o mesmo pedido e some com a sensação de fila abandonada.',
          },
        ],
      },
      {
        id: 'personalizar-card',
        title: 'Escolher o que aparece no card',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada coluna do Kanban tem o botão **Personalizar card** (ao lado do contador). Nele você escolhe, só para aquela fase, o que o card mostra: indicadores como prioridade, prazos, responsável, solicitante, data de abertura, tempo na fase e número, e até 8 campos do processo (por exemplo "Filial" ou "Valor total"), na ordem e com o rótulo que preferir.',
          },
          {
            kind: 'list',
            items: [
              '**Só para mim**: o ajuste vale só para você; os colegas continuam vendo o card como estava. "Voltar ao padrão da fase" desfaz.',
              '**Padrão da fase (todos)**: quem configura as fases do processo define o card de quem não fez ajuste próprio.',
              'Campo sem resposta não aparece no card; arquivos ficam de fora (veja-os ao abrir a solicitação).',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'atender-uma-solicitacao',
    title: 'Atender uma solicitação',
    group: 'solicitacoes',
    icon: Workflow,
    summary: 'Mover de etapa, registrar andamento, anexar arquivos e conversar com quem pediu.',
    tags: ['atender', 'mover', 'etapa', 'fase', 'comentário', 'anexo', 'responsável', 'histórico'],
    requiresPermission: { code: 'solicitations.manage', label: 'gerenciar solicitações' },
    primary: [
      {
        id: 'ciclo',
        title: 'O ciclo de atendimento',
        blocks: [
          {
            kind: 'steps',
            steps: [
              {
                title: 'Assuma',
                text: 'Defina-se como responsável. A partir daí, o pedido aparece como seu para o resto da equipe.',
              },
              {
                title: 'Mova para a etapa certa',
                text: 'No Kanban, arraste o card. Algumas etapas pedem informações ao entrar — preencha, é o registro do que foi feito.',
              },
              {
                title: 'Registre o que aconteceu',
                text: 'Use os comentários. Tudo que você escrever fica no histórico, com autor e horário.',
              },
              {
                title: 'Anexe o que comprova',
                text: 'Orçamento, print, documento assinado. O anexo fica preso à solicitação, não perdido num e-mail.',
              },
              {
                title: 'Conclua',
                text: 'Mova para a etapa final. Quem pediu vê a conclusão pelo link de acompanhamento.',
              },
            ],
          },
        ],
      },
      {
        id: 'comentarios',
        title: 'Comentário interno x comentário para quem pediu',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Esta é a distinção mais importante da tela, e a que mais causa constrangimento quando ignorada.',
          },
          {
            kind: 'table',
            columns: ['Tipo', 'Quem enxerga'],
            rows: [
              [
                'Comentário normal',
                'Aparece para quem abriu o pedido, na tela de acompanhamento dele',
              ],
              [
                'Comentário interno',
                'Só a equipe com permissão para ver comentários internos. Nunca aparece para o solicitante.',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'Na dúvida, escreva como se o solicitante fosse ler',
            text: 'Discussão interna, negociação de prazo e avaliação de terceiros vão no comentário interno. Se marcar errado, o texto já foi — não há como despublicar.',
          },
        ],
      },
      {
        id: 'historico',
        title: 'O histórico conta a história',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada mudança de situação, de responsável, de prioridade ou de etapa entra automaticamente no histórico da solicitação, com quem fez e quando. Você não precisa anotar isso nos comentários — só o que o histórico não captura: o porquê.',
          },
        ],
      },
    ],
  },

  {
    slug: 'prazos-e-sla',
    title: 'Prazos e SLA',
    group: 'solicitacoes',
    icon: Timer,
    summary: 'Como o prazo é contado, o que significa cada alerta e o que fazer quando estoura.',
    tags: ['sla', 'prazo', 'atraso', 'alerta', 'vencido', 'tempo'],
    primary: [
      {
        id: 'como-conta',
        title: 'Como o prazo funciona',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Quando a solicitação nasce, o sistema calcula a data limite a partir do prazo definido para aquele processo. A contagem é corrida, e o sistema confere a situação de todas as solicitações a cada meia hora.',
          },
          {
            kind: 'table',
            columns: ['Situação', 'O que significa'],
            rows: [
              ['No prazo', 'Ainda dentro do tempo esperado'],
              [
                'Em alerta',
                'Já consumiu a maior parte do prazo (por padrão, 80%). É o aviso para agir antes de estourar',
              ],
              ['Estourado', 'Passou da data limite'],
              ['Pausado', 'A contagem está suspensa'],
              ['Encerrado', 'A solicitação foi concluída, cancelada ou rejeitada — o prazo para de contar'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'O alerta pode virar aviso automático',
            text: 'Dependendo da configuração do processo, entrar em alerta ou estourar o prazo dispara notificação para a equipe. Se sua área quer esse aviso e ele não chega, é configuração de fluxo — fale com quem administra.',
          },
        ],
      },
      {
        id: 'estourou',
        title: 'Estourou o prazo, e agora',
        blocks: [
          {
            kind: 'list',
            items: [
              'O prazo estourado não trava nada: a solicitação continua podendo ser atendida normalmente.',
              'Explique no comentário o que houve. O histórico registra o atraso; só você registra o motivo.',
              'Se o atraso foi por espera de terceiro, diga isso — é o que separa gargalo interno de dependência externa quando alguém analisar os números depois.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'link-de-acompanhamento',
    title: 'O link de acompanhamento',
    group: 'solicitacoes',
    icon: Link2,
    summary: 'Como quem pediu acompanha sem ter login, e os cuidados com esse link.',
    tags: ['acompanhar', 'link', 'token', 'solicitante', 'sem login', 'rastreamento'],
    primary: [
      {
        id: 'o-que-e',
        title: 'O que é',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Toda solicitação ganha um endereço próprio de acompanhamento. Com ele, quem abriu o pedido consulta a situação, lê os comentários da equipe, baixa anexos e responde — **sem precisar de conta no sistema**.',
          },
          {
            kind: 'paragraph',
            text: 'É o que evita a pergunta "e aí, saiu?" por e-mail. Em vez de responder, mande o link.',
          },
        ],
      },
      {
        id: 'cuidados',
        title: 'Cuidados',
        blocks: [
          {
            kind: 'callout',
            tone: 'danger',
            title: 'O link é a credencial',
            text: 'Quem tiver o endereço vê a solicitação inteira — inclusive os comentários não internos e os anexos. Trate como informação restrita e não publique em grupo aberto.',
          },
          {
            kind: 'paragraph',
            text: 'Se o link vazar, um usuário com a permissão adequada pode gerar um novo endereço para aquela solicitação. O antigo para de funcionar na hora, e você precisa reenviar o novo a quem realmente deve acompanhar.',
          },
        ],
      },
    ],
  },

  {
    slug: 'aprovar-ou-reprovar',
    title: 'Aprovar ou reprovar um pedido',
    group: 'solicitacoes',
    icon: CheckSquare,
    summary: 'Onde ficam suas aprovações pendentes e o que acontece depois da sua decisão.',
    tags: ['aprovar', 'reprovar', 'aprovação', 'decisão', 'alçada', 'pendente'],
    requiresPermission: { code: 'approvals.decide', label: 'decidir aprovações' },
    primary: [
      {
        id: 'onde',
        title: 'Onde estão suas aprovações',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Em **Aprovações**, no menu, ficam apenas as que esperam **você**. A tela inicial também mostra as pendentes em destaque — se aparece algo lá, alguém está parado esperando.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Abra o pedido',
                text: 'Antes de decidir, veja a solicitação de origem: o que foi pedido, por quem, com quais anexos.',
              },
              {
                title: 'Decida',
                text: 'Aprove ou reprove.',
              },
              {
                title: 'Escreva o motivo',
                text: 'Principalmente ao reprovar. Sua justificativa fica no histórico e é o que permite a quem pediu corrigir e voltar.',
              },
            ],
          },
        ],
      },
      {
        id: 'como-funciona',
        title: 'Como a aprovação se comporta',
        blocks: [
          {
            kind: 'list',
            items: [
              'Uma aprovação pode ter **vários aprovadores**. Em alguns processos qualquer um decide; em outros, a ordem importa e você só é chamado depois que o anterior decidir.',
              'Alguns processos exigem mais de um "sim" para seguir. Sua aprovação pode não ser a última.',
              '**Um "não" encerra o pedido na hora**, sem esperar os demais aprovadores.',
              'Depois de decidida, a solicitação segue sozinha para a próxima etapa — inclusive avisando outro sistema, quando o processo for integrado.',
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Decisão não se desfaz',
            text: 'Não existe botão de desfazer. Se decidiu errado, fale com quem administra o processo: dependendo do caso, a saída é cancelar a aprovação e abrir outra.',
          },
        ],
      },
      {
        id: 'aprovador-por-link',
        title: 'Quando o aprovador não tem usuário (link por e-mail)',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Quem aprova mas **não tem usuário no sistema** recebe um **e-mail com um link pessoal**. Ao abrir, vê o pedido e decide ali mesmo, sem login. Quem **tem** usuário ativo continua decidindo dentro do sistema.',
          },
          {
            kind: 'list',
            items: [
              'O link é **pessoal e de uso único**: depois da decisão ele só mostra que a aprovação já foi decidida. **Não o encaminhe** — quem tiver o link consegue decidir em seu nome.',
              'Para decidir, a pessoa **confirma o e-mail** em que recebeu o link. Com 5 erros o link é bloqueado.',
              'O link vale por **7 dias**. Se expirou, foi bloqueado ou o e-mail se perdeu, quem gerencia a aprovação clica em **Reenviar link** na solicitação — o link antigo deixa de valer.',
              'Na solicitação, a etapa aparece com o e-mail e a marca **(externo)**, e mostra se o link já foi enviado. **“Link ainda não enviado”** significa que o e-mail não saiu: use **Reenviar link**.',
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'fluxos-automaticos',
    title: 'O que são os fluxos automáticos',
    group: 'solicitacoes',
    icon: Workflow,
    summary: 'Por que algumas coisas acontecem sozinhas, e como pedir uma automação nova.',
    tags: ['fluxo', 'automação', 'automático', 'e-mail automático', 'regra'],
    primary: [
      {
        id: 'o-que-sao',
        title: 'Por que algumas coisas acontecem sozinhas',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Um **fluxo** é uma regra montada uma vez e executada sempre: "quando acontecer isto, faça aquilo". É o que explica um e-mail que chegou sem ninguém enviar, um card que mudou de coluna sozinho ou uma aprovação que apareceu do nada.',
          },
          {
            kind: 'table',
            columns: ['O que costuma disparar um fluxo', 'Exemplo do que ele faz'],
            rows: [
              ['Alguém responde um formulário', 'Abre a solicitação e avisa a equipe'],
              ['Uma solicitação muda de etapa', 'Notifica quem pediu'],
              ['Uma aprovação é decidida', 'Devolve a resposta ao sistema de origem'],
              ['O prazo entra em alerta', 'Avisa o responsável'],
              ['Chega um pedido de outro sistema', 'Cria a solicitação já com os dados preenchidos'],
              ['Chega a hora marcada', 'Executa uma rotina periódica'],
            ],
          },
        ],
      },
      {
        id: 'pedir',
        title: 'Como pedir uma automação',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Você não precisa montar o fluxo para pedir um. Descreva o que quer na forma "quando **isto** acontecer, o sistema deve **fazer aquilo**" — quanto mais concreto o gatilho, mais rápido sai.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Automação não é instantânea',
            text: 'Fluxos rodam logo depois da ação, não junto com ela. Se o e-mail não chegou no mesmo segundo, espere um pouco antes de concluir que falhou.',
          },
        ],
      },
    ],
  },
];
