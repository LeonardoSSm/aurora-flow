import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNodeData } from '../types/flow.types';
import { NotificationActionForm } from './notification-action-form';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  api: { get: mocks.get, post: mocks.post },
}));

const USERS = [
  { id: '3f6c1e2a-0000-4000-8000-000000000001', fullName: 'Maria Souza', email: 'maria@x.com' },
  { id: '3f6c1e2a-0000-4000-8000-000000000002', fullName: 'João Lima', email: 'joao@x.com' },
];

const FORM = {
  versions: [
    {
      sections: [
        {
          fields: [
            { code: 'email_contato', label: 'E-mail de contato', fieldType: 'email' },
            { code: 'valor', label: 'Valor', fieldType: 'number' },
          ],
        },
      ],
    },
  ],
};

function previewResponse(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Pedido Compra de 10 cadeiras',
    body: 'Olá Maria Souza, pedido recebido.',
    usedVariables: ['responder_name'],
    missingVariables: [],
    malformed: false,
    truncated: false,
    limits: { titleMax: 200, bodyMax: 20000 },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/users/assignable') return { data: USERS };
    if (url.startsWith('/forms/')) return { data: FORM };
    throw new Error(`GET inesperado: ${url}`);
  });
  mocks.post.mockResolvedValue({ data: previewResponse() });
});

/** Renderiza com estado real (o `set` do painel regrava o nó), como no editor. */
function Harness({ initial, formId = null, onSet }: { initial: FlowNodeData; formId?: string | null; onSet?: (k: string, v: unknown) => void }) {
  const [data, setData] = useState<FlowNodeData>(initial);
  return (
    <NotificationActionForm
      d={data}
      formId={formId}
      set={(key, value) => {
        onSet?.(key, value);
        setData((previous) => ({ ...previous, [key]: value }));
      }}
    />
  );
}

function renderForm(initial: FlowNodeData = {}, formId: string | null = null) {
  const onSet = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} formId={formId} onSet={onSet} />
    </QueryClientProvider>,
  );
  return { onSet, ...view };
}

const fresh: FlowNodeData = {
  channel: 'email',
  recipients: [],
  title: '',
  content: '',
  priority: 'normal',
  deliveryMode: 'immediate',
  continueOnFailure: false,
};

const configured: FlowNodeData = {
  channel: 'email',
  title: 'Pedido {{solicitation_title}}',
  content: 'Olá {{responder_name}}, pedido recebido.',
  recipients: [{ type: 'users', userIds: [USERS[0].id] }, { type: 'custom', value: 'a@x.com, {{responder_email}}' }],
  priority: 'high',
  deliveryMode: 'background',
  continueOnFailure: true,
  retryPolicy: { maxAttempts: 4, backoffSeconds: 60 },
  idempotencyKeyTemplate: 'aviso-{{solicitation_number}}',
};

describe('NotificationActionForm', () => {
  describe('criação de um nó novo', () => {
    it('mostra os três canais e exige destinatário, assunto e mensagem', () => {
      renderForm(fresh);

      // Canal em cartões (radio): o título de cada cartão é o nome do canal.
      const options = within(screen.getByRole('radiogroup', { name: 'Canal' }))
        .getAllByRole('radio')
        .map((radio) => radio.querySelector('.font-semibold')?.textContent);
      expect(options).toEqual(['Notificação no sistema', 'E-mail', 'WhatsApp']);

      expect(screen.getByText('Adicione ao menos um destinatário.')).toBeInTheDocument();
      expect(screen.getByText('A mensagem não pode estar vazia.')).toBeInTheDocument();
      expect(screen.getByText(/Informe o assunto\./i)).toBeInTheDocument();
    });

    it('sem prévia até haver canal e mensagem', () => {
      renderForm(fresh);
      expect(screen.getByText(/Escolha o canal e escreva a mensagem/)).toBeInTheDocument();
      expect(mocks.post).not.toHaveBeenCalled();
    });

    it('trocar o canal grava `channel` e ajusta os rótulos (assunto → título)', () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'requester' }], content: 'oi' });
      fireEvent.click(screen.getByRole('radio', { name: /WhatsApp/ }));
      expect(onSet).toHaveBeenCalledWith('channel', 'whatsapp');
      expect(screen.getByRole('textbox', { name: 'Título (aparece em negrito)' })).toBeInTheDocument();
      expect(screen.queryByText(/Informe o assunto/i)).not.toBeInTheDocument();
    });
  });

  describe('destinatários', () => {
    it('adiciona cada tipo de destinatário com seus valores padrão', () => {
      const { onSet } = renderForm(fresh);
      const add = screen.getByRole('combobox', { name: 'Adicionar destinatário' });

      fireEvent.change(add, { target: { value: 'requester' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'requester' }]);

      fireEvent.change(add, { target: { value: 'users' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'requester' }, { type: 'users', userIds: [] }]);

      fireEvent.change(add, { target: { value: 'custom' } });
      fireEvent.change(add, { target: { value: 'field' } });
      fireEvent.change(add, { target: { value: 'payload_path' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [
        { type: 'requester' },
        { type: 'users', userIds: [] },
        { type: 'custom', value: '' },
        { type: 'field', fieldCode: '' },
        { type: 'payload_path', path: '' },
      ]);
    });

    it('remove um destinatário', () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'requester' }, { type: 'responsible' }] });
      fireEvent.click(screen.getByRole('button', { name: 'Remover destinatário 1' }));
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'responsible' }]);
    });

    it('usuários do sistema: lista da API e seleção por checkbox', async () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'users', userIds: [] }] });

      expect(screen.getByText('Selecione ao menos um usuário.')).toBeInTheDocument();
      const maria = await screen.findByRole('checkbox', { name: /Maria Souza/ });
      fireEvent.click(maria);
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'users', userIds: [USERS[0].id] }]);
      await waitFor(() => expect(screen.queryByText('Selecione ao menos um usuário.')).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole('checkbox', { name: /João Lima/ }));
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'users', userIds: [USERS[0].id, USERS[1].id] }]);

      fireEvent.click(screen.getByRole('checkbox', { name: /Maria Souza/ })); // desmarca
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'users', userIds: [USERS[1].id] }]);
    });

    it('e-mail fixo: valida o formato; valor dinâmico com {{variável}} é aceito', () => {
      renderForm({ ...fresh, content: 'oi', title: 'a', recipients: [{ type: 'custom', value: '' }] });
      const input = screen.getByRole('textbox', { name: 'Valor do destinatário 1' });

      expect(screen.getByText('Informe o valor.')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'nao-e-email' } });
      expect(screen.getAllByText('E-mail inválido.').length).toBeGreaterThan(0);

      fireEvent.change(input, { target: { value: 'a@x.com, b@x.com' } });
      expect(screen.queryByText('E-mail inválido.')).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: '{{responder_email}}' } });
      expect(screen.queryByText('E-mail inválido.')).not.toBeInTheDocument();
    });

    it('WhatsApp: valida telefone e mostra o exemplo certo', () => {
      renderForm({ channel: 'whatsapp', content: 'oi', recipients: [{ type: 'custom', value: 'abc' }] });
      expect(screen.getAllByText('Telefone ou grupo inválido.').length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(/5585999999999/)).toBeInTheDocument();
    });

    it('campo do formulário: lista os campos do formulário do fluxo', async () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'field', fieldCode: '' }] }, 'form-1');
      expect(screen.getByText('Escolha o campo.')).toBeInTheDocument();

      const select = (await screen.findByRole('combobox', { name: 'Campo do destinatário 1' })) as HTMLSelectElement;
      await waitFor(() => expect(within(select).getByRole('option', { name: 'E-mail de contato (email_contato)' })).toBeInTheDocument());
      fireEvent.change(select, { target: { value: 'email_contato' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'field', fieldCode: 'email_contato' }]);
    });

    it('campo do formulário sem formulário vinculado: aceita digitar o código', () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'field', fieldCode: '' }] }, null);
      fireEvent.change(screen.getByRole('textbox', { name: 'Código do campo do destinatário 1' }), { target: { value: 'meu_campo' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'field', fieldCode: 'meu_campo' }]);
    });

    it('caminho no payload do webhook', () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'payload_path', path: '' }] });
      expect(screen.getByText(/Informe o caminho/)).toBeInTheDocument();
      fireEvent.change(screen.getByRole('textbox', { name: 'Caminho do destinatário 1' }), { target: { value: 'header.emails' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'payload_path', path: 'header.emails' }]);
    });

    it('trocar o tipo de uma linha recomeça com os valores padrão do novo tipo', () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'custom', value: 'a@x.com' }] });
      fireEvent.change(screen.getByRole('combobox', { name: 'Tipo do destinatário 1' }), { target: { value: 'responsible' } });
      expect(onSet).toHaveBeenLastCalledWith('recipients', [{ type: 'responsible' }]);
    });

    it('explica de onde vem o contato do solicitante conforme o canal', () => {
      renderForm({ ...fresh, channel: 'whatsapp', recipients: [{ type: 'requester' }] });
      expect(screen.getByText(/telefone do solicitante/)).toBeInTheDocument();
    });
  });

  describe('conteúdo e variáveis', () => {
    it('digitar grava título e mensagem e mostra o contador', () => {
      const { onSet } = renderForm({ ...fresh, recipients: [{ type: 'requester' }] });
      fireEvent.change(screen.getByRole('textbox', { name: 'Assunto' }), { target: { value: 'Olá' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Mensagem' }), { target: { value: 'Corpo da mensagem' } });
      expect(onSet).toHaveBeenCalledWith('title', 'Olá');
      expect(onSet).toHaveBeenCalledWith('content', 'Corpo da mensagem');
      expect(screen.getByText(/17\/4000/)).toBeInTheDocument();
    });

    it('clicar numa variável insere {{nome}} na posição do cursor', () => {
      const { onSet } = renderForm({ ...fresh, content: 'Olá , bem-vindo' });
      const textarea = screen.getByRole('textbox', { name: 'Mensagem' }) as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(4, 4);

      fireEvent.click(screen.getByRole('button', { name: '{{responder_name}}' }));

      expect(onSet).toHaveBeenLastCalledWith('content', 'Olá {{responder_name}}, bem-vindo');
    });

    it('os campos do formulário também viram variáveis clicáveis', async () => {
      renderForm({ ...fresh, content: '' }, 'form-1');
      expect(await screen.findByRole('button', { name: '{{email_contato}}' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '{{valor}}' })).toBeInTheDocument();
    });

    it('avisa mensagem e título com variável mal formada', () => {
      renderForm({ ...fresh, title: 'Pedido {{x', content: 'Oi {{nome', recipients: [{ type: 'requester' }] });
      expect(screen.getByText(/A mensagem tem uma variável mal formada/)).toBeInTheDocument();
      expect(screen.getByText(/O título tem uma variável mal formada/)).toBeInTheDocument();
    });
  });

  describe('prévia', () => {
    it('renderiza no backend (debounce) e mostra título e corpo', async () => {
      renderForm({ ...fresh, channel: 'email', title: 'Pedido {{solicitation_title}}', content: 'Olá {{responder_name}}', recipients: [{ type: 'requester' }] });

      expect(await screen.findByTestId('preview-body', undefined, { timeout: 3000 })).toHaveTextContent('Olá Maria Souza, pedido recebido.');
      expect(screen.getByTestId('preview-title')).toHaveTextContent('Pedido Compra de 10 cadeiras');
      expect(mocks.post).toHaveBeenCalledTimes(1);
      expect(mocks.post).toHaveBeenCalledWith('/flows/notifications/preview', {
        channel: 'email',
        title: 'Pedido {{solicitation_title}}',
        content: 'Olá {{responder_name}}',
        fieldCodes: [],
      });
    });

    it('envia os códigos dos campos do formulário para o backend reconhecê-los', async () => {
      renderForm({ ...fresh, content: 'Valor {{valor}}', recipients: [{ type: 'requester' }], title: 'a' }, 'form-1');
      await waitFor(
        () => {
          const calls = mocks.post.mock.calls;
          expect(calls.some(([, body]) => (body as { fieldCodes: string[] }).fieldCodes.includes('valor'))).toBe(true);
        },
        { timeout: 3000 },
      );
    });

    it('não dispara uma consulta por tecla: só depois que a digitação para', async () => {
      renderForm({ ...fresh, content: 'a', title: 'a', recipients: [{ type: 'requester' }] });
      const textarea = screen.getByRole('textbox', { name: 'Mensagem' });
      for (const text of ['ab', 'abc', 'abcd', 'abcde']) fireEvent.change(textarea, { target: { value: text } });

      const contents = () => mocks.post.mock.calls.map(([, body]) => (body as { content: string }).content);
      await waitFor(() => expect(contents()).toContain('abcde'), { timeout: 3000 });
      // só o valor inicial e o valor final foram consultados — nenhum intermediário
      expect(contents()).toEqual(['a', 'abcde']);
    });

    it('aponta variáveis não reconhecidas (ficam em branco)', async () => {
      mocks.post.mockResolvedValue({ data: previewResponse({ missingVariables: ['nao_existe', 'outra'] }) });
      renderForm({ ...fresh, content: 'Oi {{nao_existe}} {{outra}}', title: 'a', recipients: [{ type: 'requester' }] });
      expect(await screen.findByRole('status', undefined, { timeout: 3000 })).toHaveTextContent('{{nao_existe}}, {{outra}}');
    });

    it('avisa quando o texto será cortado pelo limite do canal', async () => {
      mocks.post.mockResolvedValue({ data: previewResponse({ truncated: true, limits: { titleMax: 150, bodyMax: 500 } }) });
      renderForm({ ...fresh, channel: 'in_app', content: 'texto longo', recipients: [{ type: 'responsible' }] });
      expect(await screen.findByText(/cortado no envio \(limite de 500 caracteres\)/, undefined, { timeout: 3000 })).toBeInTheDocument();
    });

    it('mostra o erro do servidor quando a prévia falha', async () => {
      mocks.post.mockRejectedValue(
        new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 400, data: { message: 'Mensagem inválida.' } } as AxiosResponse),
      );
      renderForm({ ...fresh, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });
      expect(await screen.findByText('Mensagem inválida.', undefined, { timeout: 3000 })).toBeInTheDocument();
    });

    it('mensagem acima do limite do modelo não consulta o backend', () => {
      renderForm({ ...fresh, content: 'a'.repeat(4001), title: 'a', recipients: [{ type: 'requester' }] });
      expect(screen.getByText(/Escolha o canal e escreva a mensagem/)).toBeInTheDocument();
      expect(mocks.post).not.toHaveBeenCalled();
    });
  });

  describe('opções de envio', () => {
    it('modo de envio, prioridade e “continuar se falhar” gravam no nó', () => {
      const { onSet } = renderForm({ ...fresh, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });

      fireEvent.change(screen.getByRole('combobox', { name: 'Modo de envio' }), { target: { value: 'background' } });
      expect(onSet).toHaveBeenLastCalledWith('deliveryMode', 'background');
      expect(screen.getByText(/Em segundo plano, falhas de envio depois disso não interrompem o fluxo/)).toBeInTheDocument();

      fireEvent.change(screen.getByRole('combobox', { name: 'Prioridade' }), { target: { value: 'high' } });
      expect(onSet).toHaveBeenLastCalledWith('priority', 'high');

      const toggle = screen.getByRole('switch', { name: 'Continuar o fluxo se a notificação falhar' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(toggle);
      expect(onSet).toHaveBeenLastCalledWith('continueOnFailure', true);
      expect(toggle).toHaveAttribute('aria-checked', 'true');

      const ignorar = screen.getByRole('switch', { name: 'Ignorar destinatários sem contato' });
      expect(ignorar).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(ignorar);
      expect(onSet).toHaveBeenLastCalledWith('skipUnresolvedRecipients', true);
    });

    it('atraso > 0 trava o modo em segundo plano e explica quando será enviado', () => {
      const { onSet } = renderForm({ ...fresh, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Atrasar o envio (minutos)' }), { target: { value: '90' } });
      expect(onSet).toHaveBeenLastCalledWith('delayMinutes', 90);
      expect(screen.getByRole('combobox', { name: 'Modo de envio' })).toBeDisabled();
      expect(screen.getByText(/Será enviado 90 min depois/)).toBeInTheDocument();
    });

    it('atraso inválido é apontado', () => {
      renderForm({ ...fresh, delayMinutes: 999999, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });
      expect(screen.getByText(/O atraso deve ser de 0 a 10080 minutos/)).toBeInTheDocument();
    });

    it('avançado: tentativas, intervalo e chave de idempotência', () => {
      const { onSet } = renderForm({ ...fresh, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });
      expect(screen.queryByRole('spinbutton', { name: 'Tentativas' })).not.toBeInTheDocument(); // recolhido

      fireEvent.click(screen.getByRole('button', { name: /Avançado/ }));
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Tentativas' }), { target: { value: '4' } });
      expect(onSet).toHaveBeenLastCalledWith('retryPolicy', { maxAttempts: 4 });
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Intervalo base (s)' }), { target: { value: '60' } });
      expect(onSet).toHaveBeenLastCalledWith('retryPolicy', { maxAttempts: 4, backoffSeconds: 60 });

      fireEvent.change(screen.getByRole('textbox', { name: 'Chave de idempotência' }), { target: { value: 'aviso-{{solicitation_number}}' } });
      expect(onSet).toHaveBeenLastCalledWith('idempotencyKeyTemplate', 'aviso-{{solicitation_number}}');
    });

    it('limpar tentativas e intervalo remove a política (volta ao padrão)', () => {
      const { onSet } = renderForm({ ...fresh, retryPolicy: { maxAttempts: 4 }, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Tentativas' }), { target: { value: '' } });
      expect(onSet).toHaveBeenLastCalledWith('retryPolicy', undefined);
    });

    it('política inválida é apontada', () => {
      renderForm({ ...fresh, retryPolicy: { maxAttempts: 9 }, content: 'oi', title: 'a', recipients: [{ type: 'requester' }] });
      expect(screen.getByText('As tentativas devem ser de 1 a 5.')).toBeInTheDocument();
    });
  });

  describe('salvar e reabrir o fluxo', () => {
    it('um nó salvo é reaberto com TODOS os valores preenchidos', async () => {
      renderForm(configured);

      expect(screen.getByRole('radio', { name: /^E-mail/ })).toBeChecked();
      expect((screen.getByRole('textbox', { name: 'Assunto' }) as HTMLInputElement).value).toBe('Pedido {{solicitation_title}}');
      expect((screen.getByRole('textbox', { name: 'Mensagem' }) as HTMLTextAreaElement).value).toBe('Olá {{responder_name}}, pedido recebido.');
      expect((screen.getByRole('textbox', { name: 'Valor do destinatário 2' }) as HTMLInputElement).value).toBe('a@x.com, {{responder_email}}');
      expect((screen.getByRole('combobox', { name: 'Modo de envio' }) as HTMLSelectElement).value).toBe('background');
      expect((screen.getByRole('combobox', { name: 'Prioridade' }) as HTMLSelectElement).value).toBe('high');
      expect(screen.getByRole('switch', { name: 'Continuar o fluxo se a notificação falhar' })).toHaveAttribute('aria-checked', 'true');

      // opções avançadas já preenchidas abrem expandidas
      expect((screen.getByRole('spinbutton', { name: 'Tentativas' }) as HTMLInputElement).value).toBe('4');
      expect((screen.getByRole('textbox', { name: 'Chave de idempotência' }) as HTMLInputElement).value).toBe('aviso-{{solicitation_number}}');

      const maria = await screen.findByRole('checkbox', { name: /Maria Souza/ });
      expect(maria).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /João Lima/ })).not.toBeChecked();
    });

    it('um nó salvo e válido não mostra nenhum erro', async () => {
      renderForm(configured);
      await screen.findByRole('checkbox', { name: /Maria Souza/ });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('nó salvo antes de campos opcionais existirem (só o essencial) abre sem quebrar', () => {
      renderForm({ channel: 'in_app', content: 'Olá', recipients: [{ type: 'responsible' }] });
      expect((screen.getByRole('combobox', { name: 'Modo de envio' }) as HTMLSelectElement).value).toBe('immediate');
      expect((screen.getByRole('combobox', { name: 'Prioridade' }) as HTMLSelectElement).value).toBe('normal');
      expect((screen.getByRole('spinbutton', { name: 'Atrasar o envio (minutos)' }) as HTMLInputElement).value).toBe('0');
    });
  });

  describe('carregamento de dados auxiliares', () => {
    it('mostra o estado de carregamento da lista de usuários', async () => {
      let release!: () => void;
      mocks.get.mockImplementation(
        (url: string) =>
          new Promise((resolve) => {
            release = () => resolve({ data: url === '/users/assignable' ? USERS : FORM });
          }),
      );
      renderForm({ ...fresh, recipients: [{ type: 'users', userIds: [] }] });
      expect(screen.getByText('Carregando usuários...')).toBeInTheDocument();
      release();
      expect(await screen.findByRole('checkbox', { name: /Maria Souza/ })).toBeInTheDocument();
    });
  });
});
