import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { isFirstPhase, neighborPhase, requiredOpeningFileCount } from './phase-approval-automation';

describe('aprovação de fase sem fluxo — regras', () => {
  const phases = [
    { id: 'c', order: 2 },
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
  ];

  it('acha a vizinha pela ordem, não pela posição na lista', () => {
    expect(neighborPhase(phases, 'a', 1)?.id).toBe('b');
    expect(neighborPhase(phases, 'b', -1)?.id).toBe('a');
    expect(neighborPhase(phases, 'c', 1)).toBeNull();
    expect(neighborPhase(phases, 'a', -1)).toBeNull();
    expect(neighborPhase(phases, 'x', 1)).toBeNull();
  });

  it('a 1ª fase é a de menor ordem', () => {
    expect(isFirstPhase(phases, 'a')).toBe(true);
    expect(isFirstPhase(phases, 'c')).toBe(false);
  });

  describe('arquivos obrigatórios do formulário de abertura', () => {
    const field = (id: string, sectionId: string, fieldType: FormFieldType, extra: object = {}) => ({
      id,
      sectionId,
      fieldType,
      required: true,
      visibilityRules: null,
      ...extra,
    });

    it('conta o arquivo obrigatório da seção que a pessoa respondeu', () => {
      const fields = [field('lote', 's1', FormFieldType.SHORT_TEXT), field('foto', 's1', FormFieldType.FILE_UPLOAD)];
      expect(requiredOpeningFileCount(fields, new Set(['lote']))).toBe(1);
    });

    it('arquivo opcional, com regra de exibição ou de seção não visitada não conta', () => {
      const fields = [
        field('lote', 's1', FormFieldType.SHORT_TEXT),
        field('opcional', 's1', FormFieldType.FILE_UPLOAD, { required: false }),
        field('condicional', 's1', FormFieldType.FILE_UPLOAD, { visibilityRules: [{ fieldCode: 'lote' }] }),
        field('outro', 's2', FormFieldType.SHORT_TEXT),
        field('ramo', 's2', FormFieldType.FILE_UPLOAD),
      ];
      expect(requiredOpeningFileCount(fields as never, new Set(['lote']))).toBe(0);
    });

    it('seção só de arquivos conta (não há resposta para mostrar que foi visitada)', () => {
      const fields = [field('lote', 's1', FormFieldType.SHORT_TEXT), field('foto', 's2', FormFieldType.FILE_UPLOAD)];
      expect(requiredOpeningFileCount(fields, new Set(['lote']))).toBe(1);
    });
  });
});
