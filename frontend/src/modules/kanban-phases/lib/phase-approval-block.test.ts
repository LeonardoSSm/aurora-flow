import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { describeApprovers, phaseApprovalBlockOf } from './phase-approval-block';

function apiError(data: unknown): AxiosError {
  const error = new AxiosError('Request failed with status code 400');
  error.response = { data, status: 400, statusText: 'Bad Request', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

describe('phaseApprovalBlockOf', () => {
  it('lê a trava de aprovação da fase que o servidor devolve ao mover', () => {
    const block = phaseApprovalBlockOf(
      apiError({
        statusCode: 400,
        message: 'A fase atual ("Aprovação") exige aprovação antes de avançar.',
        code: 'phase_approval_required',
        phaseId: 'p-aprov',
        phaseLabel: 'Aprovação',
        approvers: ['Diretora Ana', 'perfil Financeiro', 7],
        canRequest: true,
      }),
    );
    expect(block).toEqual({
      code: 'phase_approval_required',
      message: 'A fase atual ("Aprovação") exige aprovação antes de avançar.',
      phaseId: 'p-aprov',
      phaseLabel: 'Aprovação',
      approvers: ['Diretora Ana', 'perfil Financeiro'],
      canRequest: true,
    });
  });

  it('outro erro (ou servidor antigo, só com a mensagem) não é trava de aprovação', () => {
    expect(phaseApprovalBlockOf(apiError({ message: 'A fase atual exige aprovação antes de avançar.' }))).toBeNull();
    expect(phaseApprovalBlockOf(apiError({ code: 'outra_coisa', message: 'x' }))).toBeNull();
    expect(phaseApprovalBlockOf(new Error('rede'))).toBeNull();
  });
});

describe('describeApprovers', () => {
  it('junta os nomes com "ou"', () => {
    expect(describeApprovers([])).toBe('quem aprova a fase');
    expect(describeApprovers(['Ana'])).toBe('Ana');
    expect(describeApprovers(['Ana', 'Bruno', 'perfil Financeiro'])).toBe('Ana, Bruno ou perfil Financeiro');
  });
});
