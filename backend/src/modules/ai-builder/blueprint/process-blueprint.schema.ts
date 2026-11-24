import { FIELD_TYPE_GUIDE, FLOW_NODE_GUIDE, PHASE_COLORS } from './blueprint-catalog';
import { BLUEPRINT_SCHEMA_VERSION } from './process-blueprint.types';

/**
 * JSON Schema do processo (GET /ai/schema/process) — o formato que a LOPS IA monta. As regras
 * que dependem do resto do processo (referências, caminhos, códigos únicos) ficam na conferência
 * (POST /ai/processes/validate); aqui vai a forma.
 */

const KEY = { type: 'string', pattern: '^[a-z][a-z0-9_]{0,59}$' };
const PEOPLE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    roles: { type: 'array', items: { type: 'string' }, description: 'Códigos de perfil (catálogo de perfis).' },
    users: { type: 'array', items: { type: 'string', format: 'email' }, description: 'E-mails de pessoas ativas.' },
  },
};

function sectionSchema(end: string, where: string): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'title', 'fields'],
    properties: {
      key: { ...KEY, description: `Chave da seção (única no ${where}).` },
      title: { type: 'string' },
      ...(where === 'formulário de abertura' ? { description: { type: 'string' } } : {}),
      fields: { type: 'array', items: { $ref: where === 'formulário de abertura' ? '#/definitions/formField' : '#/definitions/phaseField' } },
      next: {
        type: 'object',
        additionalProperties: false,
        properties: {
          default: { type: 'string', description: `Chave de outra seção ou "${end}". Ausente = a seção seguinte.` },
          branches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'goTo'],
              properties: {
                field: { type: 'string', description: 'Código de uma lista ou caixa de seleção desta seção.' },
                option: { type: 'string', description: 'Lista: valor da opção.' },
                checked: { type: 'boolean', description: 'Caixa de seleção: marcada ou não.' },
                goTo: { type: 'string', description: `Chave de outra seção ou "${end}".` },
              },
            },
          },
        },
      },
    },
  };
}

function fieldSchema(phase: boolean): Record<string, unknown> {
  const types = Object.entries(FIELD_TYPE_GUIDE)
    .filter(([, guide]) => !phase || guide?.phase)
    .map(([type]) => type);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'label', 'type'],
    properties: {
      code: { ...KEY, description: 'Único no processo inteiro. Usado em fórmulas como {code}.' },
      label: { type: 'string' },
      type: { type: 'string', enum: types },
      required: { type: 'boolean' },
      ...(phase ? {} : { sensitive: { type: 'boolean', description: 'CPF, dados bancários, salário, saúde.' } }),
      options: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'label'],
          properties: { value: { type: 'string' }, label: { type: 'string' } },
        },
      },
      settings: { type: 'object', description: 'Configurações do tipo (ver fieldTypes em GET /ai/guide).' },
      ...(phase
        ? {}
        : {
            visibility: {
              type: 'object',
              additionalProperties: false,
              required: ['action', 'conditions'],
              properties: {
                action: { enum: ['show', 'hide'] },
                operator: { enum: ['and', 'or'] },
                conditions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['field', 'op'],
                    properties: {
                      field: { type: 'string' },
                      op: { enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'] },
                      value: { type: ['string', 'number'] },
                    },
                  },
                },
              },
            },
          }),
    },
  };
}

export const PROCESS_BLUEPRINT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Processo do Tijuca Flow',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'form', 'phases'],
  properties: {
    schemaVersion: { const: BLUEPRINT_SCHEMA_VERSION },
    name: { type: 'string', maxLength: 180 },
    description: { type: 'string' },
    category: { type: 'string' },
    areaId: { type: ['string', 'null'], description: 'Id do catálogo de áreas.' },
    form: {
      type: 'object',
      additionalProperties: false,
      required: ['sections'],
      properties: {
        mode: { enum: ['single', 'stepper'] },
        showResponderIdentification: {
          type: 'boolean',
          description: 'false esconde o bloco de nome e e-mail no formulário público. Ausente = mostra.',
        },
        requireResponderIdentification: {
          type: 'boolean',
          description: 'true torna nome e e-mail obrigatórios no formulário público (o e-mail não é verificado). Ausente = opcional.',
        },
        requiresResponseApproval: {
          type: 'boolean',
          description: 'true: a resposta do atendente vira proposta que o solicitante precisa aprovar. Ausente = não.',
        },
        sections: { type: 'array', minItems: 1, items: { $ref: '#/definitions/formSection' } },
      },
    },
    phases: {
      type: 'array',
      minItems: 1,
      description: 'Em ordem. A primeira recebe as solicitações novas; ao menos uma é terminal.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'label'],
        properties: {
          key: KEY,
          label: { type: 'string' },
          description: { type: 'string' },
          color: { enum: PHASE_COLORS },
          terminal: { type: 'boolean' },
          actors: PEOPLE,
          approval: {
            type: 'object',
            additionalProperties: false,
            required: ['approvers'],
            properties: {
              approvers: PEOPLE,
              rule: { enum: ['any', 'all', 'sequential'] },
              order: { type: 'array', items: { type: 'string' }, description: '"role:<código>" ou "user:<e-mail>".' },
              request: {
                enum: ['manual', 'on_enter', 'on_complete'],
                description: 'Quando a fase pede a aprovação sozinha: ao entrar ou com o formulário da fase completo. Ausente = pelo botão do card. Prefira isto a um nó action_create_approval.',
              },
              onApproved: {
                enum: ['stay', 'next'],
                description: '"next" = aprovada, o card vai sozinho para a próxima fase. Prefira isto a um fluxo com action_move_phase.',
              },
              onRejected: {
                enum: ['stay', 'previous', 'close'],
                description: 'Reprovada: "previous" volta para a fase anterior; "close" encerra a solicitação como reprovada.',
              },
            },
          },
          visibleTo: {
            type: 'object',
            additionalProperties: false,
            properties: { ...PEOPLE.properties, areas: { type: 'array', items: { type: 'string' } } },
          },
          requireFieldsToExit: {
            type: 'boolean',
            description: 'true = o card só avança (vai para uma fase seguinte) com os campos obrigatórios do formulário desta fase preenchidos. Voltar é sempre livre.',
          },
          requireAssigneeToExit: {
            type: 'boolean',
            description: 'true = o card só avança (vai para uma fase seguinte) com alguém atribuído como responsável. Voltar é sempre livre.',
          },
          blockMoveBack: {
            type: 'boolean',
            description: 'true = ponto sem volta: depois que o card chega a esta fase, as pessoas não o devolvem para uma fase anterior a ela (quem configura as fases e o processo ainda podem).',
          },
          sla: {
            type: 'object',
            additionalProperties: false,
            required: ['hours'],
            properties: {
              hours: { type: 'integer', minimum: 1, maximum: 8760 },
              businessHours: { type: 'boolean' },
              warningPercent: { type: 'integer', minimum: 1, maximum: 99 },
            },
          },
          sections: { type: 'array', items: { $ref: '#/definitions/phaseSection' } },
        },
      },
    },
    kanban: {
      type: 'object',
      additionalProperties: false,
      properties: { cardValueField: { type: ['string', 'null'], description: 'Campo de valor mostrado e somado no card.' } },
    },
    flows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'nodes', 'edges'],
        properties: {
          name: { type: 'string', description: 'Diga a regra: "Acima de R$ 10 mil vai para a diretoria".' },
          active: { type: 'boolean' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'type'],
              properties: {
                key: { type: 'string' },
                type: { enum: Object.keys(FLOW_NODE_GUIDE) },
                data: { type: 'object', description: 'Chaves de cada tipo em flowNodes (GET /ai/guide).' },
              },
            },
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['from', 'to'],
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                when: { enum: ['yes', 'no'], description: 'Obrigatório na saída de uma condição.' },
              },
            },
          },
        },
      },
    },
    pending: { type: 'array', items: { type: 'string' }, description: 'O que só a pessoa resolve.' },
    sourceDocuments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: { name: { type: 'string' }, summary: { type: 'string' } },
      },
    },
  },
  definitions: {
    formSection: sectionSchema('submit', 'formulário de abertura'),
    phaseSection: sectionSchema('end', 'formulário da fase'),
    formField: fieldSchema(false),
    phaseField: fieldSchema(true),
  },
} as const;
