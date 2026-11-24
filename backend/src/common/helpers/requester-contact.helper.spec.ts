import { FormFieldType } from '../enums/form-field-type.enum';
import type { SubmissionEntity, SubmissionItemEntity } from '../../database/entities';
import { extractRequesterContact } from './requester-contact.helper';

function makeItem(overrides: Partial<SubmissionItemEntity> = {}): SubmissionItemEntity {
  return {
    id: 'item-id',
    submissionId: 'submission-id',
    fieldId: 'field-id',
    fieldCode: 'campo',
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    ...overrides,
  } as SubmissionItemEntity;
}

function makeSubmission(overrides: Partial<SubmissionEntity> = {}): SubmissionEntity {
  return {
    id: 'submission-id',
    responderName: null,
    responderEmail: null,
    items: [],
    ...overrides,
  } as unknown as SubmissionEntity;
}

describe('extractRequesterContact', () => {
  it('retorna tudo nulo quando nao ha submissao', () => {
    expect(extractRequesterContact(null)).toEqual({ name: null, email: null, phone: null });
    expect(extractRequesterContact(undefined)).toEqual({ name: null, email: null, phone: null });
  });

  it('prefere responderName/responderEmail da submissao quando identificados', () => {
    const submission = makeSubmission({ responderName: 'Maria', responderEmail: 'maria@x.com' });
    expect(extractRequesterContact(submission)).toEqual({
      name: 'Maria',
      email: 'maria@x.com',
      phone: null,
    });
  });

  it('extrai nome/email/telefone das respostas quando a submissao e anonima', () => {
    const submission = makeSubmission({
      items: [
        makeItem({
          valueText: 'Nailton de Sousa',
          field: { label: 'Nome Completo (Aluno)', fieldType: FormFieldType.SHORT_TEXT } as never,
        }),
        makeItem({
          valueText: 'nailton59@hotmail.com',
          field: { label: 'Email', fieldType: FormFieldType.EMAIL } as never,
        }),
        makeItem({
          valueText: '(85) 99401-2260',
          field: { label: 'Telefone com DDD', fieldType: FormFieldType.PHONE } as never,
        }),
      ],
    });

    expect(extractRequesterContact(submission)).toEqual({
      name: 'Nailton de Sousa',
      email: 'nailton59@hotmail.com',
      phone: '(85) 99401-2260',
    });
  });

  it('ignora campos de texto curto que nao parecem ser nome', () => {
    const submission = makeSubmission({
      items: [
        makeItem({
          valueText: 'Alguma resposta',
          field: { label: 'Área de Interesse', fieldType: FormFieldType.SHORT_TEXT } as never,
        }),
      ],
    });

    expect(extractRequesterContact(submission).name).toBeNull();
  });

  // Caso real ("Prestação de Contas - Viagens do Comercial", envio anônimo): o e-mail do
  // gestor vem antes do "Seu E-mail" e era mostrado como e-mail do solicitante.
  it('nao usa o e-mail do gestor quando o formulario tambem pede o e-mail de quem preenche', () => {
    const submission = makeSubmission({
      items: [
        makeItem({
          valueText: 'pedro.maciel@tijucaalimentos.com',
          field: { label: 'E-mail Gestor Imediato', fieldType: FormFieldType.EMAIL } as never,
        }),
        makeItem({
          valueText: 'TESTE',
          field: { label: 'Nome Completo', fieldType: FormFieldType.SHORT_TEXT } as never,
        }),
        makeItem({
          valueText: 'teste@tijuca.com',
          field: { label: 'Seu E-mail', fieldType: FormFieldType.EMAIL } as never,
        }),
        makeItem({
          valueText: '(85) 95667-4112',
          field: { label: 'Telefone', fieldType: FormFieldType.PHONE } as never,
        }),
      ],
    });

    expect(extractRequesterContact(submission)).toEqual({
      name: 'TESTE',
      email: 'teste@tijuca.com',
      phone: '(85) 95667-4112',
    });
  });

  it('nao atribui ao solicitante nome/e-mail/telefone que sao de outra pessoa', () => {
    const submission = makeSubmission({
      items: [
        makeItem({
          valueText: 'Carla Gerente',
          field: { label: 'Nome do gestor', fieldType: FormFieldType.SHORT_TEXT } as never,
        }),
        makeItem({
          valueText: 'aprovador@x.com',
          field: { label: 'E-mail do aprovador', fieldType: FormFieldType.EMAIL } as never,
        }),
        makeItem({
          valueText: '(85) 90000-0000',
          field: { label: 'Telefone do supervisor', fieldType: FormFieldType.PHONE } as never,
        }),
      ],
    });

    expect(extractRequesterContact(submission)).toEqual({ name: null, email: null, phone: null });
  });

  it('prefere o campo marcado como do proprio solicitante mesmo vindo depois de um neutro', () => {
    const submission = makeSubmission({
      items: [
        makeItem({
          valueText: 'financeiro@x.com',
          field: { label: 'E-mail para cópia', fieldType: FormFieldType.EMAIL } as never,
        }),
        makeItem({
          valueText: 'ana@x.com',
          field: { label: 'E-mail do solicitante', fieldType: FormFieldType.EMAIL } as never,
        }),
      ],
    });

    expect(extractRequesterContact(submission).email).toBe('ana@x.com');
  });

  it('"E-mail de usuário" (sugere gente do sistema) não vira contato, salvo rótulo "seu e-mail"', () => {
    const suggestions = { userSuggestions: { userIds: [], onlySuggested: true } };
    const picked = makeItem({
      valueText: 'chefe@x.com',
      field: { label: 'E-mail para aprovação', fieldType: FormFieldType.EMAIL, settingsJson: suggestions } as never,
    });
    expect(extractRequesterContact(makeSubmission({ items: [picked] })).email).toBeNull();

    const own = makeItem({
      valueText: 'eu@x.com',
      field: { label: 'Seu e-mail', fieldType: FormFieldType.EMAIL, settingsJson: suggestions } as never,
    });
    expect(extractRequesterContact(makeSubmission({ items: [picked, own] })).email).toBe('eu@x.com');
  });

  it('ignora itens sem relacao field carregada', () => {
    const submission = makeSubmission({
      items: [makeItem({ valueText: 'algo@x.com', field: undefined as never })],
    });

    expect(extractRequesterContact(submission)).toEqual({ name: null, email: null, phone: null });
  });
});
