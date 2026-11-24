import {
  isPhaseValueEmpty,
  missingRequiredPhaseFields,
  phaseExitMessage,
} from './phase-required-fields';

describe('phase-required-fields', () => {
  describe('isPhaseValueEmpty', () => {
    it('sem valor, texto só com espaços e checkbox desmarcado são vazios', () => {
      expect(isPhaseValueEmpty('short_text', undefined)).toBe(true);
      expect(isPhaseValueEmpty('short_text', { valueText: '  ' })).toBe(true);
      expect(isPhaseValueEmpty('checkbox', { valueBoolean: false })).toBe(true);
      expect(isPhaseValueEmpty('multi_select', { valueJson: [] })).toBe(true);
    });

    it('texto, número (inclusive zero), checkbox marcado e arquivo contam como preenchidos', () => {
      expect(isPhaseValueEmpty('short_text', { valueText: 'ok' })).toBe(false);
      expect(isPhaseValueEmpty('number', { valueNumber: 0 })).toBe(false);
      expect(isPhaseValueEmpty('checkbox', { valueBoolean: true })).toBe(false);
      expect(isPhaseValueEmpty('file_upload', { valueJson: { attachmentId: 'a-1' } })).toBe(false);
    });

    it('"Pedido de itens" sem nenhum item é vazio', () => {
      expect(isPhaseValueEmpty('item_order', { valueJson: { rows: [] } })).toBe(true);
      expect(isPhaseValueEmpty('item_order', { valueText: 'resumo', valueJson: null })).toBe(true);
      expect(isPhaseValueEmpty('item_order', { valueJson: { rows: [{ itemId: 'x', quantity: 1 }] } })).toBe(false);
    });
  });

  describe('missingRequiredPhaseFields', () => {
    const fields = [
      { id: 'a', label: 'A', fieldType: 'short_text', required: true },
      { id: 'b', label: 'B', fieldType: 'short_text', required: false },
      { id: 'c', label: 'C', fieldType: 'title', required: true },
      { id: 'd', label: 'D', fieldType: 'calculated', required: true },
      { id: 'e', label: 'E', fieldType: 'checkbox', required: true },
    ];

    it('só obrigatórios com resposta: layout e cálculo nunca entram, opcional vazio também não', () => {
      expect(missingRequiredPhaseFields(fields, () => undefined).map((f) => f.id)).toEqual(['a', 'e']);
    });

    it('preenchidos saem da lista', () => {
      const values: Record<string, object> = { a: { valueText: 'x' }, e: { valueBoolean: true } };
      expect(missingRequiredPhaseFields(fields, (f) => values[f.id])).toEqual([]);
    });
  });

  describe('phaseExitMessage', () => {
    it('nomeia a fase e cada campo, no singular ou no plural', () => {
      expect(phaseExitMessage('Conferência', { needsAssignee: false, missingFields: [{ label: 'Nota' }] })).toBe(
        'Para sair da fase "Conferência", preencha o campo obrigatório: "Nota".',
      );
      expect(
        phaseExitMessage('Conferência', { needsAssignee: false, missingFields: [{ label: 'Nota' }, { label: 'Peso' }] }),
      ).toBe('Para sair da fase "Conferência", preencha os campos obrigatórios: "Nota", "Peso".');
    });

    it('falta de responsável sozinha ou junto com os campos, numa frase só', () => {
      expect(phaseExitMessage('Conferência', { needsAssignee: true, missingFields: [] })).toBe(
        'Para sair da fase "Conferência", atribua um responsável ao card.',
      );
      expect(phaseExitMessage('Conferência', { needsAssignee: true, missingFields: [{ label: 'Nota' }] })).toBe(
        'Para sair da fase "Conferência", atribua um responsável ao card e preencha o campo obrigatório: "Nota".',
      );
    });

    it('nada faltando: sem mensagem', () => {
      expect(phaseExitMessage('Conferência', { needsAssignee: false, missingFields: [] })).toBeNull();
    });
  });
});
