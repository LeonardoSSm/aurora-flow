import { render, screen } from '@testing-library/react';
import { CurrentPhaseAttachments, PhaseHistorySection } from './phase-fields-modal';
import type { Attachment, PhaseFieldValue } from '../../solicitations/types';
import type { KanbanPhase, KanbanPhaseField } from '../types';

function field(overrides: Partial<KanbanPhaseField> & { id: string; code: string }): KanbanPhaseField {
  return {
    label: overrides.code,
    fieldType: 'short_text',
    required: false,
    order: 0,
    settingsJson: null,
    optionsJson: null,
    ...overrides,
  };
}

function phase(overrides: Partial<KanbanPhase> & { id: string }): KanbanPhase {
  return {
    formId: 'form-1',
    key: overrides.id,
    label: overrides.id,
    color: 'blue',
    description: null,
    order: 0,
    isTerminal: false,
    actorRoleCode: null,
    requiresApproval: false,
    approverRoleCode: null,
    fields: [],
    ...overrides,
  };
}

function value(overrides: Partial<PhaseFieldValue> & { id: string; phaseFieldId: string }): PhaseFieldValue {
  return {
    solicitationId: 'sol-1',
    fieldCode: 'campo',
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    ...overrides,
  };
}

function attachment(overrides: Partial<Attachment> & { id: string }): Attachment {
  return {
    originalName: 'arquivo.pdf',
    storedName: 'arquivo.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storageType: 'local',
    solicitationId: 'sol-1',
    submissionId: null,
    uploadedByUserId: null,
    uploadedByUser: null,
    isPublic: false,
    phaseId: null,
    validationResult: null,
    validatedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PhaseHistorySection', () => {
  it('não renderiza nada quando não há dados de fases anteriores', () => {
    const phases = [phase({ id: 'phase-1', order: 0, label: 'Preenchimento inicial' })];
    const { container } = render(
      <PhaseHistorySection phases={phases} values={[]} attachments={[]} currentPhaseId="phase-1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('não mostra a fase atual, mesmo que ela tenha dados preenchidos', () => {
    const f = field({ id: 'field-1', code: 'qtd' });
    const phases = [phase({ id: 'phase-1', order: 0, label: 'Fase atual', fields: [f] })];
    const values = [value({ id: 'v1', phaseFieldId: 'field-1', valueText: 'valor' })];
    const { container } = render(
      <PhaseHistorySection phases={phases} values={values} attachments={[]} currentPhaseId="phase-1" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('valor')).not.toBeInTheDocument();
  });

  it('mostra os valores preenchidos em uma fase anterior', () => {
    const f = field({ id: 'field-1', code: 'lote', label: 'Lote' });
    const phases = [
      phase({ id: 'phase-1', order: 0, label: 'Preenchimento inicial', fields: [f] }),
      phase({ id: 'phase-2', order: 1, label: 'Produção' }),
    ];
    const values = [value({ id: 'v1', phaseFieldId: 'field-1', valueText: 'L123' })];
    render(<PhaseHistorySection phases={phases} values={values} attachments={[]} currentPhaseId="phase-2" />);

    expect(screen.getByText('Histórico do processo')).toBeInTheDocument();
    expect(screen.getByText('Preenchimento inicial')).toBeInTheDocument();
    expect(screen.getByText('Lote:')).toBeInTheDocument();
    expect(screen.getByText('L123')).toBeInTheDocument();
  });

  it('formata valores booleanos, numéricos e JSON', () => {
    const boolField = field({ id: 'f-bool', code: 'aprovado', label: 'Aprovado' });
    const numberField = field({ id: 'f-num', code: 'quantidade', label: 'Quantidade', fieldType: 'number' });
    const jsonField = field({ id: 'f-json', code: 'opcoes', label: 'Opções', fieldType: 'multi_select' });
    const phases = [
      phase({ id: 'phase-1', order: 0, label: 'Fase anterior', fields: [boolField, numberField, jsonField] }),
    ];
    const values = [
      value({ id: 'v1', phaseFieldId: 'f-bool', valueBoolean: true }),
      value({ id: 'v2', phaseFieldId: 'f-num', valueNumber: 42 }),
      value({ id: 'v3', phaseFieldId: 'f-json', valueJson: ['a', 'b'] }),
    ];
    render(<PhaseHistorySection phases={phases} values={values} attachments={[]} currentPhaseId="phase-2" />);

    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('["a","b"]')).toBeInTheDocument();
  });

  it('não lista campos do tipo file_upload entre os valores de texto (eles aparecem como anexo)', () => {
    const fileField = field({ id: 'f-file', code: 'foto', label: 'Foto', fieldType: 'file_upload' });
    const phases = [phase({ id: 'phase-1', order: 0, label: 'Fase anterior', fields: [fileField] })];
    const values = [value({ id: 'v1', phaseFieldId: 'f-file', valueJson: { attachmentId: 'att-1' } })];
    const { container } = render(
      <PhaseHistorySection phases={phases} values={values} attachments={[]} currentPhaseId="phase-2" />,
    );
    // Sem anexo correspondente e sem outros campos, a fase não tem nada a mostrar.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Foto:')).not.toBeInTheDocument();
  });

  it('mostra os anexos vinculados à fase', () => {
    const phases = [
      phase({ id: 'phase-1', order: 0, label: 'Preenchimento inicial' }),
      phase({ id: 'phase-2', order: 1, label: 'Produção' }),
    ];
    const attachments = [attachment({ id: 'att-1', originalName: 'etiqueta.pdf', phaseId: 'phase-1' })];
    render(
      <PhaseHistorySection phases={phases} values={[]} attachments={attachments} currentPhaseId="phase-2" />,
    );

    expect(screen.getByText('Preenchimento inicial')).toBeInTheDocument();
    expect(screen.getByText('etiqueta.pdf')).toBeInTheDocument();
  });

  it('ignora anexos de fases não vinculadas (phaseId nulo ou de outra fase)', () => {
    const phases = [phase({ id: 'phase-1', order: 0, label: 'Fase anterior' })];
    const attachments = [
      attachment({ id: 'att-1', originalName: 'sem-fase.pdf', phaseId: null }),
      attachment({ id: 'att-2', originalName: 'outra-fase.pdf', phaseId: 'phase-999' }),
    ];
    const { container } = render(
      <PhaseHistorySection phases={phases} values={[]} attachments={attachments} currentPhaseId="phase-2" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('ordena as fases por ordem crescente', () => {
    const f1 = field({ id: 'f-1', code: 'c1', label: 'Campo 1' });
    const f2 = field({ id: 'f-2', code: 'c2', label: 'Campo 2' });
    const phases = [
      phase({ id: 'phase-2', order: 1, label: 'Segunda fase', fields: [f2] }),
      phase({ id: 'phase-1', order: 0, label: 'Primeira fase', fields: [f1] }),
    ];
    const values = [
      value({ id: 'v1', phaseFieldId: 'f-1', valueText: 'valor 1' }),
      value({ id: 'v2', phaseFieldId: 'f-2', valueText: 'valor 2' }),
    ];
    render(<PhaseHistorySection phases={phases} values={values} attachments={[]} currentPhaseId="phase-3" />);

    const labels = screen.getAllByText(/primeira fase|segunda fase/i).map((el) => el.textContent);
    expect(labels).toEqual(['Primeira fase', 'Segunda fase']);
  });
});

describe('CurrentPhaseAttachments', () => {
  it('não renderiza nada sem anexos da fase atual', () => {
    const { container } = render(
      <CurrentPhaseAttachments attachments={[]} currentPhaseId="phase-1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('não renderiza nada sem uma fase atual definida', () => {
    const attachments = [attachment({ id: 'att-1', originalName: 'foto.pdf', phaseId: 'phase-1' })];
    const { container } = render(
      <CurrentPhaseAttachments attachments={attachments} currentPhaseId={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('mostra os anexos vinculados à fase que está sendo vista agora', () => {
    const attachments = [
      attachment({ id: 'att-1', originalName: 'etiqueta.pdf', phaseId: 'phase-1' }),
      attachment({ id: 'att-2', originalName: 'de-outra-fase.pdf', phaseId: 'phase-2' }),
      attachment({ id: 'att-3', originalName: 'sem-fase.pdf', phaseId: null }),
    ];
    render(<CurrentPhaseAttachments attachments={attachments} currentPhaseId="phase-1" />);

    expect(screen.getByText('Anexos desta fase')).toBeInTheDocument();
    expect(screen.getByText('etiqueta.pdf')).toBeInTheDocument();
    expect(screen.queryByText('de-outra-fase.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('sem-fase.pdf')).not.toBeInTheDocument();
  });
});
