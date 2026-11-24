import { PROCESS_BLUEPRINT_SCHEMA } from './blueprint/process-blueprint.schema';

/**
 * OpenAPI 3.1 só das rotas /ai, para importar na LOPS IA como ferramentas. Os `operationId` são os
 * nomes de ferramenta do prompt do sistema (Docs/ia_construtor_de_processos_prompt_sistema.md) —
 * mudar um aqui é mudar lá.
 */
export function buildAiOpenApi(serverUrl: string): Record<string, unknown> {
  const { definitions, $schema: _schema, ...processSchema } = JSON.parse(
    JSON.stringify(PROCESS_BLUEPRINT_SCHEMA).split('#/definitions/').join('#/components/schemas/'),
  ) as Record<string, unknown> & { definitions: Record<string, unknown> };

  const json = (schema: Record<string, unknown>): Record<string, unknown> => ({ content: { 'application/json': { schema } } });
  const ok = (description: string, schema: Record<string, unknown> = { type: 'object' }): Record<string, unknown> => ({
    200: { description, ...json(schema) },
  });
  const session = [{ lopsApiKey: [], lopsSession: [] }];
  const get = (
    operationId: string,
    summary: string,
    description: string,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    get: { operationId, summary, description, security: session, responses: ok(summary), ...extra },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Tijuca Flow — Assistente de Processos',
      version: '1.0.0',
      description:
        'Rotas para a LOPS IA criar processos no Tijuca Flow. Toda chamada leva X-API-Key; depois de abrir_sessao, também Authorization: Bearer <token da sessão>. A IA age com as permissões da pessoa da sessão.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        lopsApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        lopsSession: { type: 'http', scheme: 'bearer', description: 'Token devolvido por abrir_sessao (tf-XXXX-XXXX-XXXX-XXXX). Repita exatamente; cada uso renova a validade.' },
      },
      schemas: { ProcessBlueprint: processSchema, ...definitions },
    },
    paths: {
      '/ai/session': {
        post: {
          operationId: 'abrir_sessao',
          summary: 'Abrir a sessão da pessoa',
          description:
            'Chame primeiro, com o e-mail do Google Workspace com que a pessoa entrou na LOPS IA. Devolve o token da sessão e o que a pessoa pode fazer.',
          security: [{ lopsApiKey: [] }],
          requestBody: {
            required: true,
            ...json({ type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } }),
          },
          responses: ok('Sessão aberta'),
        },
      },
      '/ai/me': get('quem_sou_eu', 'Quem está na sessão', 'Nome, perfil, área e permissões da pessoa.'),
      '/ai/guide': get(
        'obter_manual',
        'Manual de montagem',
        'Tipos de campo e configurações, nós de fluxo, padrões de regra, limites e um processo de exemplo completo.',
      ),
      '/ai/schema/process': get('obter_schema_processo', 'Formato do processo', 'JSON Schema do corpo de criar_processo.'),
      '/ai/catalog/roles': get('listar_perfis', 'Perfis', 'Código, nome, descrição e quantas pessoas ativas têm o perfil.'),
      '/ai/catalog/areas': get('listar_areas', 'Áreas', 'Id e nome das áreas ativas.'),
      '/ai/catalog/users': get('buscar_usuarios', 'Buscar pessoas', 'Até 10 pessoas ativas pelo nome ou e-mail (mínimo 2 letras).', {
        parameters: [{ name: 'search', in: 'query', required: true, schema: { type: 'string', minLength: 2 } }],
      }),
      '/ai/catalog/item-lists': get('listar_listas_de_itens', 'Listas de itens', 'Listas reutilizáveis (id para settings.itemListId) com amostra dos itens.'),
      '/ai/catalog/erp': get('listar_erp', 'Listas do ERP', 'Conectores e listas ("fonte") para o campo "Lista do ERP".'),
      '/ai/catalog/integrations': get('listar_integracoes', 'Integrações', 'O que existe para a pessoa ligar no editor de fluxos.'),
      '/ai/processes': {
        get: {
          operationId: 'listar_processos',
          summary: 'Processos existentes',
          description: 'Processos que a pessoa enxerga, para usar de exemplo ou evitar duplicar.',
          security: session,
          parameters: [{ name: 'search', in: 'query', required: false, schema: { type: 'string' } }],
          responses: ok('Lista de processos'),
        },
        post: {
          operationId: 'criar_processo',
          summary: 'Criar o processo inteiro',
          description:
            'Cria formulário, fases, formulários das fases e fluxos numa transação só, como rascunho. Só depois do "sim" da pessoa. Com problema, devolve 422 com errors e não grava nada. dryRun=true confere tudo sem gravar.',
          security: session,
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
              schema: { type: 'string', minLength: 8, maxLength: 120 },
              description: 'O mesmo valor nas tentativas da mesma criação: nunca duplica o processo.',
            },
            { name: 'dryRun', in: 'query', required: false, schema: { type: 'boolean' } },
          ],
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/ProcessBlueprint' }) },
          responses: {
            ...ok('Processo criado (rascunho), com builderUrl, contagens, avisos e pendências'),
            422: { description: 'Processo com problemas: errors[] com path e message; nada foi gravado.' },
          },
        },
      },
      '/ai/processes/validate': {
        post: {
          operationId: 'validar_processo',
          summary: 'Conferir o processo sem gravar',
          description: 'Devolve valid, errors[] e warnings[], cada um com o caminho (ex.: phases[2].approval.approvers.roles[0]), e adjusted[] com o que o servidor converteu de apelidos para o formato do schema.',
          security: session,
          requestBody: { required: true, ...json({ $ref: '#/components/schemas/ProcessBlueprint' }) },
          responses: ok('Resultado da conferência'),
        },
      },
      '/ai/processes/{id}': get(
        'obter_processo',
        'Um processo no formato de criação',
        'Processo existente com formulário, fases e fluxos, no mesmo formato de criar_processo.',
        { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] },
      ),
    },
  };
}
