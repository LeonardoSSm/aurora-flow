import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { PhaseApprovalAutomationListener } from './phase-approval-automation.listener';

function repo() {
  return { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
}

function setup(phaseOverrides: Record<string, unknown> = {}) {
  const service = {
    requestPhaseApprovalAutomatically: jest.fn().mockResolvedValue(null),
    applyPhaseApprovalOutcome: jest.fn().mockResolvedValue(undefined),
    resumeApprovedAdvance: jest.fn().mockResolvedValue(undefined),
  };
  const repos = {
    phases: repo(),
    solicitations: repo(),
    phaseFields: repo(),
    submissions: repo(),
    submissionItems: repo(),
    formFields: repo(),
    attachments: repo(),
  };
  const first = {
    id: 'phase-1',
    formId: 'form-id',
    order: 0,
    requiresApproval: true,
    approvalRequest: 'on_complete',
    ...phaseOverrides,
  };
  const second = { id: 'phase-2', formId: 'form-id', order: 1, requiresApproval: true, approvalRequest: 'on_complete' };
  repos.phases.find.mockResolvedValue([first, second]);
  repos.phases.findOne.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve([first, second].find((phase) => phase.id === where.id) ?? null),
  );
  repos.solicitations.findOne.mockResolvedValue({
    id: 'sol-1',
    formId: 'form-id',
    currentPhaseId: null,
    submissionId: 'sub-1',
  });
  repos.submissions.findOne.mockResolvedValue({ id: 'sub-1', formVersionId: 'v1' });
  // Formulário de abertura: lote (respondido) e foto obrigatória na mesma seção.
  repos.formFields.find.mockResolvedValue([
    { id: 'f-lote', sectionId: 's1', fieldType: FormFieldType.SHORT_TEXT, required: true, visibilityRules: null },
    { id: 'f-foto', sectionId: 's1', fieldType: FormFieldType.FILE_UPLOAD, required: true, visibilityRules: null },
  ]);
  repos.submissionItems.find.mockResolvedValue([{ fieldId: 'f-lote' }]);
  const listener = new PhaseApprovalAutomationListener(
    service as never,
    repos.phases as never,
    repos.solicitations as never,
    repos.phaseFields as never,
    repos.submissions as never,
    repos.submissionItems as never,
    repos.formFields as never,
    repos.attachments as never,
  );
  return { listener, service, repos };
}

const created = { solicitationId: 'sol-1', formId: 'form-id' } as never;

describe('PhaseApprovalAutomationListener', () => {
  it('1ª fase "formulário completo": espera a foto obrigatória chegar', async () => {
    const { listener, service, repos } = setup();
    await listener.handleCreated(created);
    expect(service.requestPhaseApprovalAutomatically).not.toHaveBeenCalled();

    repos.attachments.count.mockResolvedValue(1);
    await listener.handleAttachmentUploaded({ attachmentId: 'a1', submissionId: 'sub-1' } as never);
    expect(service.requestPhaseApprovalAutomatically).toHaveBeenCalledWith('sol-1', 'phase-1');
  });

  it('a foto que chegou antes do card nascer conta na criação', async () => {
    const { listener, service, repos } = setup();
    repos.attachments.count.mockResolvedValue(1);
    await listener.handleCreated(created);
    expect(service.requestPhaseApprovalAutomatically).toHaveBeenCalledWith('sol-1', 'phase-1');
  });

  it('"ao entrar" pede na criação, sem esperar anexo', async () => {
    const { listener, service } = setup({ approvalRequest: 'on_enter' });
    await listener.handleCreated(created);
    expect(service.requestPhaseApprovalAutomatically).toHaveBeenCalledWith('sol-1', 'phase-1');
  });

  it('"pelo botão" nunca pede sozinho', async () => {
    const { listener, service, repos } = setup({ approvalRequest: 'manual' });
    repos.attachments.count.mockResolvedValue(1);
    await listener.handleCreated(created);
    await listener.handleAttachmentUploaded({ attachmentId: 'a1', submissionId: 'sub-1' } as never);
    expect(service.requestPhaseApprovalAutomatically).not.toHaveBeenCalled();
  });

  it('outras fases: com campos, pede quando salvam o formulário da fase, não ao entrar', async () => {
    const { listener, service, repos } = setup();
    repos.phaseFields.count.mockResolvedValue(1);
    await listener.handlePhaseChanged({ solicitationId: 'sol-1', toPhaseId: 'phase-2' } as never);
    expect(service.requestPhaseApprovalAutomatically).not.toHaveBeenCalled();

    await listener.handlePhaseFieldsSaved({ solicitationId: 'sol-1', phaseId: 'phase-2' } as never);
    expect(service.requestPhaseApprovalAutomatically).toHaveBeenCalledWith('sol-1', 'phase-2');
  });

  it('a decisão vai para a regra da fase, com a profundidade do evento', async () => {
    const { listener, service } = setup();
    await listener.handleApprovalDecided({ approvalId: 'ap-1', flowDepth: 1 } as never);
    expect(service.applyPhaseApprovalOutcome).toHaveBeenCalledWith('ap-1', 1);
  });

  it('aprovada e parada pela trava: salvar os campos ou definir o responsável tenta seguir', async () => {
    const { listener, service } = setup();
    await listener.handlePhaseFieldsSaved({ solicitationId: 'sol-1', phaseId: 'phase-2' } as never);
    expect(service.resumeApprovedAdvance).toHaveBeenCalledWith('sol-1');

    service.resumeApprovedAdvance.mockClear();
    await listener.handleAssigneeChanged({ solicitationId: 'sol-1', toAssigneeId: 'u-1' } as never);
    expect(service.resumeApprovedAdvance).toHaveBeenCalledWith('sol-1');

    // Tirar o responsável não destrava nada.
    service.resumeApprovedAdvance.mockClear();
    await listener.handleAssigneeChanged({ solicitationId: 'sol-1', toAssigneeId: null } as never);
    expect(service.resumeApprovedAdvance).not.toHaveBeenCalled();
  });

  it('falha não sobe para quem emitiu o evento', async () => {
    const { listener, service } = setup({ approvalRequest: 'on_enter' });
    service.requestPhaseApprovalAutomatically.mockRejectedValue(new Error('banco fora'));
    await expect(listener.handleCreated(created)).resolves.toBeUndefined();
  });
});
