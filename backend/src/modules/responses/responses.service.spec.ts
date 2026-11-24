import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import type { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import type { FormSubmissionValidator } from './form-submission.validator';
import type { PublicCaptchaService } from './public-captcha.service';
import {
  resolveExportCellValue,
  ResponsesService,
} from './responses.service';
import type { FormFieldEntity } from '../../database/entities';
import { fakeProcessAccess } from '../access/testing/fake-process-access';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeField(
  overrides: Partial<{
    id: string;
    code: string;
    fieldType: FormFieldType;
    required: boolean;
    options: { internalValue: string }[];
  }>,
): {
  id: string;
  code: string;
  fieldType: FormFieldType;
  required: boolean;
  options: { internalValue: string }[];
} {
  return {
    id: 'field-1',
    code: 'campo',
    fieldType: FormFieldType.SHORT_TEXT,
    required: false,
    options: [],
    ...overrides,
  };
}

function makeVersion(fields: ReturnType<typeof makeField>[]): {
  id: string;
  formId: string;
  sections: [{ fields: ReturnType<typeof makeField>[] }];
} {
  return { id: 'version-id', formId: 'form-id', sections: [{ fields }] };
}

const PUBLISHED_FORM = { id: 'form-id', status: FormStatus.PUBLISHED };

// ─── resolveExportCellValue ─────────────────────────────────────────────────
// Regressão: CSV/XLSX/PDF exportavam o internalValue bruto de select/multi_select
// (ex.: "opcao_1") em vez do rótulo escolhido, e o número cru de campos
// calculados (sem prefixo/sufixo/casas decimais configurados).

function makeExportField(overrides: Partial<FormFieldEntity>): FormFieldEntity {
  return {
    id: 'field-1',
    code: 'campo',
    fieldType: FormFieldType.SHORT_TEXT,
    settingsJson: {},
    options: [],
    ...overrides,
  } as FormFieldEntity;
}

describe('resolveExportCellValue', () => {
  it('resolve single_select para o rótulo escolhido, não o internalValue', () => {
    const field = makeExportField({
      fieldType: FormFieldType.SINGLE_SELECT,
      options: [
        { internalValue: 'opcao_1', displayLabel: 'Isabel Couto' },
        { internalValue: 'opcao_2', displayLabel: 'Felipe Ribeiro' },
      ] as FormFieldEntity['options'],
    });

    expect(resolveExportCellValue({ valueText: 'opcao_1' } as never, field)).toBe('Isabel Couto');
  });

  it('cai no valor bruto quando a opção não é encontrada', () => {
    const field = makeExportField({
      fieldType: FormFieldType.SINGLE_SELECT,
      options: [{ internalValue: 'opcao_1', displayLabel: 'Isabel Couto' }] as FormFieldEntity['options'],
    });

    expect(resolveExportCellValue({ valueText: 'opcao_removida' } as never, field)).toBe(
      'opcao_removida',
    );
  });

  it('resolve multi_select para os rótulos escolhidos, separados por vírgula', () => {
    const field = makeExportField({
      fieldType: FormFieldType.MULTI_SELECT,
      options: [
        { internalValue: 'opcao_1', displayLabel: 'Financeiro' },
        { internalValue: 'opcao_2', displayLabel: 'RH' },
      ] as FormFieldEntity['options'],
    });

    expect(
      resolveExportCellValue({ valueJson: ['opcao_1', 'opcao_2'] } as never, field),
    ).toBe('Financeiro, RH');
  });

  it('formata campo calculado com decimais e prefixo/sufixo configurados', () => {
    const field = makeExportField({
      fieldType: FormFieldType.CALCULATED,
      settingsJson: { formulaDecimals: 2, formulaPrefix: 'R$ ' },
    });

    expect(resolveExportCellValue({ valueNumber: 1234.5 } as never, field)).toBe('R$ 1.234,50');
  });

  it('agrega a tabela de produtos numa string legível', () => {
    const field = makeExportField({ fieldType: FormFieldType.PRODUCT_TABLE });
    const valueJson = [{ produto: 'Caneta', values: { Quantidade: 10 } }];

    expect(resolveExportCellValue({ valueJson } as never, field)).toBe(
      'Caneta (Quantidade: 10)',
    );
  });

  it('sem field conhecido, cai no fallback bruto de sempre', () => {
    expect(resolveExportCellValue({ valueText: 'texto qualquer' } as never, undefined)).toBe(
      'texto qualquer',
    );
  });

  it('tipos sem tratamento especial (ex.: short_text) continuam usando o valor bruto', () => {
    const field = makeExportField({ fieldType: FormFieldType.SHORT_TEXT });
    expect(resolveExportCellValue({ valueText: 'Olá' } as never, field)).toBe('Olá');
  });
});

// ─── ResponsesService.submit — validation ───────────────────────────────────

describe('ResponsesService — submit validation', () => {
  let service: ResponsesService;
  let formsRepo: { findOne: jest.Mock };
  let versionsRepo: { findOne: jest.Mock };
  let dataSource: Partial<DataSource>;
  let eventEmitter: Partial<EventEmitter2>;
  let validate: jest.Mock;
  let erpLookupFieldService: { resolveSubmissionItems: jest.Mock };
  let erpTableFieldService: { resolveSubmissionItems: jest.Mock };
  let userEmailFieldService: { findNotSuggested: jest.Mock };
  let repoCreate: jest.Mock;

  beforeEach(() => {
    formsRepo = { findOne: jest.fn().mockResolvedValue(PUBLISHED_FORM) };
    versionsRepo = { findOne: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const publicCaptchaService: Partial<PublicCaptchaService> = {
      verifyToken: jest.fn().mockResolvedValue(undefined),
    };
    validate = jest.fn().mockReturnValue([]);
    const formSubmissionValidator: Partial<FormSubmissionValidator> = { validate };
    const googleWorkspaceService: Partial<GoogleWorkspaceService> = {
      ensureSubmissionSyncJob: jest.fn().mockResolvedValue(undefined),
    };
    // Sem campo "Lista do ERP" a conferência devolve os itens como vieram.
    erpLookupFieldService = {
      resolveSubmissionItems: jest
        .fn()
        .mockImplementation((_fields, items) => Promise.resolve(items)),
    };
    // Idem para "Tabela dinâmica do ERP".
    erpTableFieldService = {
      resolveSubmissionItems: jest
        .fn()
        .mockImplementation((_fields, items) => Promise.resolve(items)),
    };

    // Sem "E-mail de usuário" restrito: nada a recusar.
    userEmailFieldService = { findNotSuggested: jest.fn().mockResolvedValue({}) };

    // transaction mock: calls the callback with a manager that always saves successfully
    repoCreate = jest.fn().mockImplementation((data) => ({ ...data, id: 'new-sub-id' }));
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        create: repoCreate,
        save: jest
          .fn()
          .mockImplementation((entity) =>
            Promise.resolve(
              Array.isArray(entity) ? entity : { ...entity, id: entity.id ?? 'new-sub-id' },
            ),
          ),
      }),
    };
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    };

    // submissionsRepo used only by findOne after the transaction
    const submissionsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'new-sub-id', items: [], status: 'submitted' }),
    };
    const itemsRepo = { create: jest.fn(), save: jest.fn() };

    service = new ResponsesService(
      dataSource as DataSource,
      eventEmitter as EventEmitter2,
      publicCaptchaService as PublicCaptchaService,
      formSubmissionValidator as FormSubmissionValidator,
      googleWorkspaceService as GoogleWorkspaceService,
      formsRepo as never,
      versionsRepo as never,
      submissionsRepo as never,
      itemsRepo as never,
      { getScope: jest.fn(), hasAny: jest.fn() } as never,
      erpLookupFieldService as never,
      erpTableFieldService as never,
      // Sem "Pedido de itens": devolve os itens como vieram.
      { resolveSubmissionItems: (_fields: unknown, items: unknown) => Promise.resolve(items) } as never,
      userEmailFieldService as never,
      { assertFormAccess: jest.fn() } as never,
    );
  });

  // ── Lista do ERP ─────────────────────────────────────────────────────────

  it('grava o que a conferência do ERP devolve, não o que o navegador mandou', async () => {
    const field = makeField({ id: 'field-erp', code: 'cliente', required: true });
    const version = makeVersion([field]);
    versionsRepo.findOne.mockResolvedValue(version);
    validate.mockReturnValue([
      {
        fieldId: 'field-erp',
        fieldCode: 'cliente',
        valueText: null,
        valueNumber: null,
        valueBoolean: null,
        valueJson: { value: '001' },
      },
    ]);
    erpLookupFieldService.resolveSubmissionItems.mockImplementation((_fields, items) =>
      Promise.resolve(
        items.map((item: Record<string, unknown>) => ({
          ...item,
          valueText: 'ACME LTDA',
          valueJson: { value: '001', label: 'ACME LTDA', fonte: 'clientes', resolvidoEm: 'x' },
        })),
      ),
    );

    await service.submit(
      {
        formId: PUBLISHED_FORM.id,
        formVersionId: version.id,
        items: [{ fieldId: 'field-erp', fieldCode: 'cliente', valueText: 'texto' }],
      } as never,
      null,
      null,
    );

    expect(erpLookupFieldService.resolveSubmissionItems).toHaveBeenCalledWith(
      [field],
      validate.mock.results[0].value,
    );
    expect(repoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fieldCode: 'cliente', valueText: 'ACME LTDA' }),
    );
  });

  it('ERP fora: o erro da conferência sobe e nada é gravado', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([makeField({ id: 'field-1', code: 'nome', required: false })]),
    );
    erpLookupFieldService.resolveSubmissionItems.mockRejectedValue(new Error('ERP fora'));

    await expect(
      service.submit(
        {
          formId: PUBLISHED_FORM.id,
          formVersionId: 'v-1',
          items: [{ fieldId: 'field-1', fieldCode: 'nome', valueText: 'Ana' }],
        } as never,
        null,
        null,
      ),
    ).rejects.toThrow('ERP fora');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // ── E-mail de usuário ────────────────────────────────────────────────────

  it('"só e-mails sugeridos": e-mail de fora vira 422 no campo e nada é gravado', async () => {
    const field = makeField({ id: 'field-gestor', code: 'gestor', required: true });
    versionsRepo.findOne.mockResolvedValue(makeVersion([field]));
    validate.mockReturnValue([
      {
        fieldId: 'field-gestor',
        fieldCode: 'gestor',
        valueText: 'alguem@fora.com',
        valueNumber: null,
        valueBoolean: null,
        valueJson: null,
      },
    ]);
    userEmailFieldService.findNotSuggested.mockResolvedValue({
      gestor: 'Escolha um dos e-mails sugeridos.',
    });

    await expect(
      service.submit(
        {
          formId: PUBLISHED_FORM.id,
          formVersionId: 'v-1',
          items: [{ fieldId: 'field-gestor', fieldCode: 'gestor', valueText: 'alguem@fora.com' }],
        } as never,
        null,
        null,
      ),
    ).rejects.toMatchObject({
      response: { errors: { gestor: 'Escolha um dos e-mails sugeridos.' } },
    });
    expect(userEmailFieldService.findNotSuggested).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'gestor', value: 'alguem@fora.com' }),
    ]);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // ── Identificação obrigatória ────────────────────────────────────────────

  function requiredIdentificationVersion() {
    return {
      ...makeVersion([makeField({ id: 'field-1', code: 'nome', required: false })]),
      settingsJson: { mode: 'single', requireResponderIdentification: true },
    };
  }

  it('identificação obrigatória sem nome/e-mail: 422 e nada é gravado', async () => {
    versionsRepo.findOne.mockResolvedValue(requiredIdentificationVersion());

    await expect(
      service.submit(
        { formId: PUBLISHED_FORM.id, formVersionId: 'version-id', items: [] } as never,
        null,
        null,
      ),
    ).rejects.toMatchObject({
      response: {
        errors: { responderName: 'Informe seu nome.', responderEmail: 'Informe seu e-mail.' },
      },
    });
    expect(validate).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('identificação obrigatória com usuário logado: grava nome e e-mail dele', async () => {
    versionsRepo.findOne.mockResolvedValue(requiredIdentificationVersion());

    await service.submit(
      { formId: PUBLISHED_FORM.id, formVersionId: 'version-id', items: [] } as never,
      null,
      null,
      { email: 'ana@tijuca.com', fullName: 'Ana Souza' },
    );

    expect(repoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ responderName: 'Ana Souza', responderEmail: 'ana@tijuca.com' }),
    );
  });

  it('sem a opção, envio anônimo continua anônimo mesmo logado', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([makeField({ id: 'field-1', code: 'nome', required: false })]),
    );

    await service.submit(
      { formId: PUBLISHED_FORM.id, formVersionId: 'version-id', items: [] } as never,
      null,
      null,
      { email: 'ana@tijuca.com', fullName: 'Ana Souza' },
    );

    expect(repoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ responderName: null, responderEmail: null }),
    );
  });

  // ── fieldId validation ───────────────────────────────────────────────────

  it('throws 400 when fieldId does not belong to the version', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([makeField({ id: 'field-1', code: 'nome', required: false })]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'unknown-id', fieldCode: 'nome', valueText: 'João' }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when fieldCode does not match the field', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([makeField({ id: 'field-1', code: 'nome', required: false })]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'codigo_errado', valueText: 'João' }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when the same fieldId appears more than once', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([makeField({ id: 'field-1', code: 'nome', required: false })]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [
            { fieldId: 'field-1', fieldCode: 'nome', valueText: 'João' },
            { fieldId: 'field-1', fieldCode: 'nome', valueText: 'Maria' },
          ],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── type validation — short_text ─────────────────────────────────────────

  it('throws 400 when short_text field receives valueNumber instead of valueText', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'nome',
          fieldType: FormFieldType.SHORT_TEXT,
          required: false,
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'nome', valueNumber: 42 }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 400 when short_text field receives valueBoolean', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'nome',
          fieldType: FormFieldType.SHORT_TEXT,
          required: false,
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'nome', valueText: 'ok', valueBoolean: true }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── type validation — number ─────────────────────────────────────────────

  it('throws 400 when number field receives valueText instead of valueNumber', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'idade',
          fieldType: FormFieldType.NUMBER,
          required: false,
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'idade', valueText: 'trinta' }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── type validation — date ───────────────────────────────────────────────

  it('throws 400 when date field receives value in wrong format', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'nascimento',
          fieldType: FormFieldType.DATE,
          required: false,
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'nascimento', valueText: '01/01/2000' }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts date field with YYYY-MM-DD format', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'nascimento',
          fieldType: FormFieldType.DATE,
          required: false,
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'nascimento', valueText: '2000-01-01' }],
        },
        null,
        null,
      ),
    ).resolves.toBeDefined();
  });

  // ── type validation — single_select ──────────────────────────────────────

  it('throws 400 when single_select receives a value not in options', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'cor',
          fieldType: FormFieldType.SINGLE_SELECT,
          required: false,
          options: [{ internalValue: 'azul' }, { internalValue: 'vermelho' }],
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'cor', valueText: 'verde' }],
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts single_select with valid option', async () => {
    versionsRepo.findOne.mockResolvedValue(
      makeVersion([
        makeField({
          id: 'field-1',
          code: 'cor',
          fieldType: FormFieldType.SINGLE_SELECT,
          required: false,
          options: [{ internalValue: 'azul' }, { internalValue: 'vermelho' }],
        }),
      ]),
    );

    await expect(
      service.submit(
        {
          formId: 'form-id',
          formVersionId: 'version-id',
          items: [{ fieldId: 'field-1', fieldCode: 'cor', valueText: 'azul' }],
        },
        null,
        null,
      ),
    ).resolves.toBeDefined();
  });

  // ── not-found cases ───────────────────────────────────────────────────────

  it('throws NotFoundException when form is not published', async () => {
    formsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.submit({ formId: 'form-id', formVersionId: 'version-id', items: [] }, null, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when version is not found', async () => {
    versionsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.submit({ formId: 'form-id', formVersionId: 'version-id', items: [] }, null, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── ResponsesService.findOne / findByForm ───────────────────────────────────
// Quem vê as respostas de um processo é quem tem "ver respostas" no vínculo com ele (ou acesso total).

function makeAccessService(options: {
  submission?: Record<string, unknown> | null;
  form?: Record<string, unknown> | null;
  /** Vínculos da pessoa: processo → permissões. */
  members?: Record<string, Record<string, Record<string, 'all' | 'own'>>>;
  /** Cards nascidos da resposta. */
  cards?: Array<Record<string, unknown>>;
  /** A pessoa foi chamada a aprovar algo num desses cards. */
  isApprover?: boolean;
}) {
  const formFieldsQb = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const ds: Partial<DataSource> = {
    transaction: jest.fn(),
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(formFieldsQb) }),
  };
  const submissionsQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const submissionsRepo = {
    findOne: jest.fn().mockResolvedValue(options.submission ?? null),
    createQueryBuilder: jest.fn().mockReturnValue(submissionsQb),
  };
  const formsRepo = { findOne: jest.fn().mockResolvedValue(options.form ?? null) };
  const approverQb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(options.isApprover ?? false),
  };
  const solicitationsRepo = {
    find: jest.fn().mockResolvedValue(options.cards ?? []),
    createQueryBuilder: jest.fn().mockReturnValue(approverQb),
  };
  const processAccess = fakeProcessAccess({
    formsRepository: formsRepo,
    solicitationsRepository: solicitationsRepo,
    members: options.members,
    fullAccessRoles: ['admin'],
  });

  const svc = new ResponsesService(
    ds as DataSource,
    { emit: jest.fn() } as never,
    { verifyToken: jest.fn() } as never,
    { validate: jest.fn() } as never,
    { ensureSubmissionSyncJob: jest.fn() } as never,
    formsRepo as never,
    {} as never,
    submissionsRepo as never,
    {} as never,
    { getScope: jest.fn(), hasAny: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    processAccess,
  );
  return { svc, submissionsRepo, formsRepo };
}

const FORM = { id: 'form-id', createdBy: 'someone-else', areaId: 'area-x' };
const SUBMISSION = { id: 'sub-1', formId: 'form-id', items: [] };

describe('ResponsesService.findOne', () => {
  it('quem tem "ver respostas" no processo abre a resposta', async () => {
    const { svc } = makeAccessService({
      submission: SUBMISSION,
      form: FORM,
      members: { 'user-1': { 'form-id': { 'responses.view': 'all' } } },
    });
    await expect(svc.findOne('sub-1', 'user-1', 'qualquer', null)).resolves.toBe(SUBMISSION);
  });

  it('resposta inexistente: 404', async () => {
    const { svc } = makeAccessService({ submission: null });
    await expect(svc.findOne('ghost-id', 'user-1', 'viewer', null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sem vínculo com o processo (IDOR pelo id): 403', async () => {
    const { svc } = makeAccessService({
      submission: SUBMISSION,
      form: FORM,
      members: { 'intruder-id': { 'outro-form': { 'responses.view': 'all' } } },
    });
    await expect(svc.findOne('sub-1', 'intruder-id', 'manager', 'area-x')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('vínculo sem "ver respostas": só abre se vir o card nascido da resposta', async () => {
    const members = { 'user-1': { 'form-id': { 'solicitations.view': 'own' as const } } };
    const denied = makeAccessService({
      submission: SUBMISSION,
      form: FORM,
      members,
      cards: [{ id: 'sol-1', formId: 'form-id', createdBy: null, assigneeId: 'outra-pessoa' }],
    });
    await expect(denied.svc.findOne('sub-1', 'user-1', 'editor', null)).rejects.toBeInstanceOf(ForbiddenException);

    const allowed = makeAccessService({
      submission: SUBMISSION,
      form: FORM,
      members,
      cards: [{ id: 'sol-1', formId: 'form-id', createdBy: null, assigneeId: 'user-1' }],
    });
    await expect(allowed.svc.findOne('sub-1', 'user-1', 'editor', null)).resolves.toBe(SUBMISSION);
  });

  it('quem foi chamado a aprovar algo no card abre a resposta (tela de aprovação do tablet)', async () => {
    const { svc } = makeAccessService({
      submission: SUBMISSION,
      form: FORM,
      cards: [{ id: 'sol-1', formId: 'form-id', createdBy: null, assigneeId: null }],
      isApprover: true,
    });
    await expect(svc.findOne('sub-1', 'aprovador-id', 'viewer', null)).resolves.toBe(SUBMISSION);
  });

  it('acesso total pelo perfil abre qualquer resposta', async () => {
    const { svc } = makeAccessService({ submission: SUBMISSION, form: FORM });
    await expect(svc.findOne('sub-1', 'adm', 'admin', null)).resolves.toBe(SUBMISSION);
  });
});
