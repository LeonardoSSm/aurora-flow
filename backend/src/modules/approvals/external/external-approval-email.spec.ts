import { buildExternalApprovalEmail, type ExternalApprovalEmailInput } from './external-approval-email';

const LINK = 'https://flow.tijucaalimentos.com/aprovar/abc123_-XYZ';

function input(overrides: Partial<ExternalApprovalEmailInput> = {}): ExternalApprovalEmailInput {
  return {
    orgName: 'Tijuca Flow',
    approvalTitle: 'Aprovar pedido 123',
    approvalDescription: 'Confira os itens do pedido.',
    solicitationNumber: 'A1B2C3D4',
    solicitationTitle: 'Pedido de embalagens',
    requesterName: 'Maria Souza',
    link: LINK,
    expiresAt: new Date('2026-10-13T15:00:00Z'),
    ...overrides,
  };
}

describe('buildExternalApprovalEmail', () => {
  it('monta assunto, texto e HTML com o link e a validade em horário de Brasília', () => {
    const email = buildExternalApprovalEmail(input());

    expect(email.subject).toBe('[Tijuca Flow] Aprovação pendente: Aprovar pedido 123');
    expect(email.text).toContain(LINK);
    expect(email.text).toContain('Pedido de embalagens');
    expect(email.text).toContain('Solicitante: Maria Souza');
    expect(email.text).toContain('13/10/2026');
    expect(email.html).toContain(`href="${LINK}"`);
    expect(email.html).toContain('Ver detalhes e decidir');
  });

  it('escapa tudo o que vem de dados: nada vira marcação no HTML', () => {
    const email = buildExternalApprovalEmail(
      input({
        approvalTitle: '<script>alert(1)</script>',
        approvalDescription: '<img src=x onerror=alert(2)>',
        solicitationTitle: '"><b>negrito</b>',
        requesterName: '<i>quem</i>',
        orgName: 'Org <u>X</u>',
      }),
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>negrito</b>');
    expect(email.html).not.toContain('<i>quem</i>');
    expect(email.html).not.toContain('<u>X</u>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('o assunto é uma linha só (sem quebra de linha injetada)', () => {
    const email = buildExternalApprovalEmail(input({ approvalTitle: 'Linha 1\r\nBcc: alguem@x.com' }));

    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it('omite descrição e solicitante quando não existem', () => {
    const email = buildExternalApprovalEmail(
      input({ approvalDescription: null, requesterName: null }),
    );

    expect(email.text).not.toContain('Solicitante:');
    expect(email.html).not.toContain('Solicitante:');
  });

  it('avisa que o link é pessoal e não deve ser encaminhado', () => {
    const email = buildExternalApprovalEmail(input());

    expect(email.text).toContain('pessoal');
    expect(email.text).toContain('Não o encaminhe');
  });
});
