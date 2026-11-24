import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FieldValidationException } from '../../common/exceptions/field-validation.exception';
import type {
  FormFieldEntity,
  FormSectionBranchEntity,
  FormSectionEntity,
  FormVersionEntity,
} from '../../database/entities';
import { FormSubmissionValidator } from './form-submission.validator';
import type { SubmitResponseDto } from './dto/submit-response.dto';

function makeField(overrides: Partial<FormFieldEntity>): FormFieldEntity {
  return {
    id: 'field-id',
    sectionId: 'section-id',
    code: 'campo',
    label: 'Campo',
    fieldType: FormFieldType.SHORT_TEXT,
    order: 1,
    required: false,
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
    isSensitive: false,
    options: [],
    ...overrides,
  } as FormFieldEntity;
}

function makeBranch(overrides: Partial<FormSectionBranchEntity>): FormSectionBranchEntity {
  return {
    id: 'branch-id',
    sectionId: 'section-id',
    fieldId: null,
    optionId: null,
    checkboxValue: null,
    targetSectionId: null,
    targetIsSubmit: true,
    order: 1,
    ...overrides,
  } as FormSectionBranchEntity;
}

function makeSection(overrides: Partial<FormSectionEntity>): FormSectionEntity {
  return {
    id: 'section-id',
    order: 1,
    nextSectionId: null,
    nextIsSubmit: true,
    branches: [],
    fields: [],
    ...overrides,
  } as FormSectionEntity;
}

function makeVersion(sections: FormSectionEntity[]): FormVersionEntity {
  return { sections } as FormVersionEntity;
}

describe('FormSubmissionValidator — section reachability graph walk', () => {
  const validator = new FormSubmissionValidator();

  it('follows the default nextSectionId chain when no branch matches', () => {
    const secondField = makeField({ id: 'second-id', sectionId: 'section-2', code: 'nome' });
    const sectionOne = makeSection({
      id: 'section-1',
      order: 1,
      nextSectionId: 'section-2',
      nextIsSubmit: false,
    });
    const sectionTwo = makeSection({
      id: 'section-2',
      order: 2,
      fields: [secondField],
    });
    const version = makeVersion([sectionOne, sectionTwo]);

    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'second-id', fieldCode: 'nome', valueText: 'Ana' }],
    } as SubmitResponseDto;

    const result = validator.validate(version, dto);
    expect(result).toHaveLength(1);
    expect(result[0].fieldCode).toBe('nome');
  });

  it('does not require a field inside a section skipped by a matching branch', () => {
    const triggerField = makeField({
      id: 'trigger-id',
      sectionId: 'section-main',
      code: 'area',
      fieldType: FormFieldType.SINGLE_SELECT,
      options: [
        { id: 'opt-financeiro', internalValue: 'financeiro', displayLabel: 'Financeiro' },
        { id: 'opt-ti', internalValue: 'ti', displayLabel: 'TI' },
      ] as FormFieldEntity['options'],
    });
    const branchField = makeField({
      id: 'branch-field-id',
      sectionId: 'section-branch',
      code: 'centro_custo',
      required: true,
    });
    const mainSection = makeSection({
      id: 'section-main',
      order: 1,
      nextSectionId: 'section-final',
      branches: [
        makeBranch({
          sectionId: 'section-main',
          fieldId: 'trigger-id',
          optionId: 'opt-financeiro',
          targetSectionId: 'section-branch',
          targetIsSubmit: false,
        }),
      ],
      fields: [triggerField],
    });
    const branchSection = makeSection({
      id: 'section-branch',
      order: 2,
      fields: [branchField],
    });
    const finalSection = makeSection({ id: 'section-final', order: 3 });
    const version = makeVersion([mainSection, branchSection, finalSection]);

    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'trigger-id', fieldCode: 'area', valueText: 'ti' }],
    } as SubmitResponseDto;

    const result = validator.validate(version, dto);
    expect(result).toHaveLength(1);
    expect(result[0].fieldCode).toBe('area');
  });

  it('requires a field once the matching branch redirects into its section', () => {
    const triggerField = makeField({
      id: 'trigger-id',
      sectionId: 'section-main',
      code: 'area',
      fieldType: FormFieldType.SINGLE_SELECT,
      options: [
        { id: 'opt-financeiro', internalValue: 'financeiro', displayLabel: 'Financeiro' },
        { id: 'opt-ti', internalValue: 'ti', displayLabel: 'TI' },
      ] as FormFieldEntity['options'],
    });
    const branchField = makeField({
      id: 'branch-field-id',
      sectionId: 'section-branch',
      code: 'centro_custo',
      required: true,
    });
    const mainSection = makeSection({
      id: 'section-main',
      order: 1,
      nextSectionId: 'section-final',
      branches: [
        makeBranch({
          sectionId: 'section-main',
          fieldId: 'trigger-id',
          optionId: 'opt-financeiro',
          targetSectionId: 'section-branch',
          targetIsSubmit: false,
        }),
      ],
      fields: [triggerField],
    });
    const branchSection = makeSection({
      id: 'section-branch',
      order: 2,
      fields: [branchField],
    });
    const finalSection = makeSection({ id: 'section-final', order: 3 });
    const version = makeVersion([mainSection, branchSection, finalSection]);

    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'trigger-id', fieldCode: 'area', valueText: 'financeiro' }],
    } as SubmitResponseDto;

    expect(() => validator.validate(version, dto)).toThrow(FieldValidationException);
  });

  it('matches a checkbox-based branch by boolean value', () => {
    const checkboxField = makeField({
      id: 'checkbox-id',
      sectionId: 'section-main',
      code: 'aceita_termos',
      fieldType: FormFieldType.CHECKBOX,
    });
    const branchField = makeField({
      id: 'branch-field-id',
      sectionId: 'section-branch',
      code: 'motivo_recusa',
      required: true,
    });
    const mainSection = makeSection({
      id: 'section-main',
      order: 1,
      branches: [
        makeBranch({
          sectionId: 'section-main',
          fieldId: 'checkbox-id',
          checkboxValue: false,
          targetSectionId: 'section-branch',
          targetIsSubmit: false,
        }),
      ],
      fields: [checkboxField],
    });
    const branchSection = makeSection({
      id: 'section-branch',
      order: 2,
      fields: [branchField],
    });
    const version = makeVersion([mainSection, branchSection]);

    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'checkbox-id', fieldCode: 'aceita_termos', valueBoolean: false }],
    } as SubmitResponseDto;

    expect(() => validator.validate(version, dto)).toThrow(FieldValidationException);
  });

  it('stops the walk at a section whose branch/fallback resolves to submit', () => {
    const onlyField = makeField({ id: 'only-id', sectionId: 'section-1', code: 'nome' });
    const sectionOne = makeSection({
      id: 'section-1',
      order: 1,
      nextSectionId: null,
      nextIsSubmit: true,
      fields: [onlyField],
    });
    const version = makeVersion([sectionOne]);

    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'only-id', fieldCode: 'nome', valueText: 'Ana' }],
    } as SubmitResponseDto;

    const result = validator.validate(version, dto);
    expect(result).toHaveLength(1);
  });
});

describe('FormSubmissionValidator - campos calculados', () => {
  const validator = new FormSubmissionValidator();

  function makeCalculatedVersion(
    formula: string,
    options: { required?: boolean; decimals?: number } = {},
  ): FormVersionEntity {
    const quantidade = makeField({
      id: 'qtd-id',
      sectionId: 'section-1',
      code: 'quantidade',
      fieldType: FormFieldType.NUMBER,
    });
    const preco = makeField({
      id: 'preco-id',
      sectionId: 'section-1',
      code: 'preco',
      fieldType: FormFieldType.CURRENCY,
    });
    const total = makeField({
      id: 'total-id',
      sectionId: 'section-1',
      code: 'total',
      fieldType: FormFieldType.CALCULATED,
      required: options.required ?? false,
      settingsJson: { formula, formulaDecimals: options.decimals ?? 2 },
    });

    return makeVersion([
      makeSection({ id: 'section-1', order: 1, fields: [quantidade, preco, total] }),
    ]);
  }

  it('recalcula o campo no servidor em vez de aceitar o valor enviado', () => {
    const version = makeCalculatedVersion('{quantidade} * {preco}');
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [
        { fieldId: 'qtd-id', fieldCode: 'quantidade', valueNumber: 3 },
        { fieldId: 'preco-id', fieldCode: 'preco', valueText: 'R$ 19,90' },
        { fieldId: 'total-id', fieldCode: 'total', valueNumber: 1 },
      ],
    } as SubmitResponseDto;

    const result = validator.validate(version, dto);
    const total = result.find((item) => item.fieldCode === 'total');
    expect(total?.valueNumber).toBe(59.7);
  });

  it('grava o calculo mesmo quando o cliente nao envia o campo', () => {
    const version = makeCalculatedVersion('{quantidade} + 10');
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'qtd-id', fieldCode: 'quantidade', valueNumber: 5 }],
    } as SubmitResponseDto;

    const result = validator.validate(version, dto);
    expect(result.find((item) => item.fieldCode === 'total')?.valueNumber).toBe(15);
  });

  it('nao grava nada quando nenhum campo do calculo foi preenchido', () => {
    const version = makeCalculatedVersion('{quantidade} * {preco}');
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [],
    } as unknown as SubmitResponseDto;

    const result = validator.validate(version, dto);
    expect(result.find((item) => item.fieldCode === 'total')).toBeUndefined();
  });

  it('cobra os campos de origem quando o calculo e obrigatorio', () => {
    const version = makeCalculatedVersion('{quantidade} * {preco}', { required: true });
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [],
    } as unknown as SubmitResponseDto;

    expect(() => validator.validate(version, dto)).toThrow(FieldValidationException);
  });

  describe('escondido de quem responde', () => {
    function hiddenVersion(required: boolean): FormVersionEntity {
      const version = makeCalculatedVersion('{quantidade} * {preco}', { required });
      const total = version.sections[0].fields.find((field) => field.code === 'total');
      if (total) total.settingsJson = { ...total.settingsJson, hideFromRespondent: true };
      return version;
    }

    it('continua calculado e gravado no envio', () => {
      const dto = {
        formId: 'form-id',
        formVersionId: 'version-id',
        items: [
          { fieldId: 'qtd-id', fieldCode: 'quantidade', valueNumber: 2 },
          { fieldId: 'preco-id', fieldCode: 'preco', valueText: 'R$ 10,00' },
        ],
      } as SubmitResponseDto;
      const total = validator.validate(hiddenVersion(false), dto).find((item) => item.fieldCode === 'total');
      expect(total?.valueNumber).toBe(20);
    });

    it('obrigatório e em branco não trava o envio: ninguém vê o campo para corrigir', () => {
      const dto = { formId: 'form-id', formVersionId: 'version-id', items: [] } as unknown as SubmitResponseDto;
      expect(() => validator.validate(hiddenVersion(true), dto)).not.toThrow();
    });
  });
});

describe('FormSubmissionValidator — file_upload obrigatório', () => {
  const validator = new FormSubmissionValidator();

  function makeFileUploadVersion(): FormVersionEntity {
    const field = makeField({
      id: 'foto-id',
      code: 'foto',
      fieldType: FormFieldType.FILE_UPLOAD,
      required: true,
    });
    return makeVersion([makeSection({ fields: [field] })]);
  }

  // O arquivo em si sempre chega numa chamada separada, depois da submissão
  // (ver form-runtime.ts no frontend: `fieldToSubmitItem`/`validatePublicAnswers`
  // nunca incluem nada para file_upload) — então a submissão inicial nunca pode
  // exigir esse campo, mesmo quando required=true.
  it('não bloqueia a submissão quando um campo file_upload obrigatório não vem no payload', () => {
    const version = makeFileUploadVersion();
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [],
    } as unknown as SubmitResponseDto;

    expect(() => validator.validate(version, dto)).not.toThrow();
  });

  it('ainda aceita e persiste o valor quando o cliente envia uma referência de upload', () => {
    const version = makeFileUploadVersion();
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [
        {
          fieldId: 'foto-id',
          fieldCode: 'foto',
          valueJson: { url: 'https://example.com/f.jpg', name: 'f.jpg', mimeType: 'image/jpeg', size: 10 },
        },
      ],
    } as unknown as SubmitResponseDto;

    const result = validator.validate(version, dto);
    expect(result.find((item) => item.fieldCode === 'foto')?.valueJson).toMatchObject({
      url: 'https://example.com/f.jpg',
    });
  });

  it('outros campos obrigatórios continuam sendo cobrados normalmente', () => {
    const fotoField = makeField({ id: 'foto-id', code: 'foto', fieldType: FormFieldType.FILE_UPLOAD, required: true });
    const textField = makeField({ id: 'nome-id', code: 'nome', fieldType: FormFieldType.SHORT_TEXT, required: true });
    const version = makeVersion([makeSection({ fields: [fotoField, textField] })]);
    const dto: SubmitResponseDto = {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [],
    } as unknown as SubmitResponseDto;

    expect(() => validator.validate(version, dto)).toThrow(FieldValidationException);
  });
});

describe('FormSubmissionValidator — Lista do ERP', () => {
  const validator = new FormSubmissionValidator();

  function erpVersion(required: boolean): FormVersionEntity {
    const field = makeField({
      id: 'cliente-id',
      code: 'cliente',
      fieldType: FormFieldType.ERP_LOOKUP,
      required,
    });
    return makeVersion([makeSection({ fields: [field] })]);
  }

  function dto(valueJson: unknown): SubmitResponseDto {
    return {
      formId: 'form-id',
      formVersionId: 'version-id',
      items: [{ fieldId: 'cliente-id', fieldCode: 'cliente', valueJson }],
    } as unknown as SubmitResponseDto;
  }

  it('guarda só o código escolhido; o nome vem depois, do ERP', () => {
    const [item] = validator.validate(erpVersion(true), dto({ value: ' 001 ', label: 'forjado' }));

    expect(item).toMatchObject({
      fieldCode: 'cliente',
      valueText: null,
      valueJson: { value: '001' },
    });
  });

  it('obrigatório sem opção escolhida → "Campo obrigatório."', () => {
    const erro = (() => {
      try {
        validator.validate(erpVersion(true), dto({ value: '  ' }));
      } catch (e) {
        return e as FieldValidationException;
      }
      return null;
    })();

    expect(erro?.getResponse()).toMatchObject({ errors: { cliente: 'Campo obrigatório.' } });
  });

  it('opcional sem opção escolhida não grava nada', () => {
    expect(validator.validate(erpVersion(false), dto(null))).toEqual([]);
  });

  it('formato errado → "Escolha uma opção da lista."', () => {
    const erro = (() => {
      try {
        validator.validate(erpVersion(false), dto({ value: 123 }));
      } catch (e) {
        return e as FieldValidationException;
      }
      return null;
    })();

    expect(erro?.getResponse()).toMatchObject({
      errors: { cliente: 'Escolha uma opção da lista.' },
    });
  });
});
