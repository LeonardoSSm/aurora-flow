import type { DiagramRegistry } from '../../docs-kit';

/**
 * Diagramas do manual do usuário. Diferente dos da documentação técnica, aqui não
 * aparece nome de tabela, evento nem serviço — só o que a pessoa vive na tela.
 */
export const HELP_DIAGRAMS: DiagramRegistry = {
  'caminho-do-pedido': {
    title: 'O caminho de um pedido',
    description:
      'O trajeto que todo pedido percorre no sistema, do preenchimento até a conclusão.',
    height: 380,
    nodes: [
      {
        id: 'pedido',
        kind: 'pessoa',
        title: 'Alguém faz um pedido',
        subtitle: 'preenche um formulário',
        x: 0,
        y: 110,
      },
      {
        id: 'solicitacao',
        kind: 'servico',
        title: 'Vira uma solicitação',
        subtitle: 'entra na fila da equipe responsável',
        x: 300,
        y: 110,
      },
      {
        id: 'acompanha',
        kind: 'pessoa',
        title: 'Quem pediu acompanha',
        subtitle: 'por um link, sem precisar de login',
        x: 300,
        y: 250,
      },
      {
        id: 'aprovacao',
        kind: 'decisao',
        title: 'Passa por aprovação',
        subtitle: 'quando o processo exige',
        x: 600,
        y: 30,
      },
      {
        id: 'atende',
        kind: 'servico',
        title: 'A equipe atende',
        subtitle: 'move o card e registra o andamento',
        x: 600,
        y: 170,
      },
      {
        id: 'fim',
        kind: 'servico',
        title: 'Concluída',
        subtitle: 'quem pediu é avisado',
        x: 900,
        y: 100,
      },
    ],
    edges: [
      { id: 'h1', source: 'pedido', target: 'solicitacao' },
      { id: 'h2', source: 'solicitacao', target: 'acompanha', label: 'link' },
      { id: 'h3', source: 'solicitacao', target: 'aprovacao' },
      { id: 'h4', source: 'solicitacao', target: 'atende', label: 'sem aprovação' },
      { id: 'h5', source: 'aprovacao', target: 'atende', label: 'aprovado' },
      { id: 'h6', source: 'atende', target: 'fim' },
    ],
  },
};
