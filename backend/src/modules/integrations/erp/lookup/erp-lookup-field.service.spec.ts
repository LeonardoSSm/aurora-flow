import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { FormFieldType } from '../../../../common/enums/form-field-type.enum';
import { FieldValidationException } from '../../../../common/exceptions/field-validation.exception';
import type { FormFieldEntity } from '../../../../database/entities';
import { ErpLookupFieldService, SEARCH_LIMIT } from './erp-lookup-field.service';
import { ErpLookupBadRequestError, ErpLookupUnavailableError } from './erp-lookup.errors';
import type { ErpLookupService } from './erp-lookup.service';

const CONECTOR = '6f1c2b8e-3d4a-4f5b-9c7d-1e2f3a4b5c6d';

function erpField(overrides: Partial<FormFieldEntity> = {}): FormFieldEntity {
  return {
    id: 'field-erp',
    code: 'cliente',
    label: 'Cliente',
    fieldType: FormFieldType.ERP_LOOKUP,
    settingsJson: {
      erpConnectorId: CONECTOR,
      fonte: 'clientes',
      modo: 'pesquisa',
      minCaracteres: 3,
    },
    ...overrides,
  } as FormFieldEntity;
}

function setup(field: FormFieldEntity | null = erpField()) {
  const versionsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'version-1' }) };
  const fieldsRepo = { findOne: jest.fn().mockResolvedValue(field) };
  const lookup = {
    search: jest.fn().mockResolvedValue([{ value: '001', label: 'ACME' }]),
    resolve: jest.fn().mockResolvedValue({ value: '001', label: 'ACME LTDA' }),
    details: jest.fn().mockResolvedValue({ value: '001', titulo: 'ACME' }),
  };
  const service = new ErpLookupFieldService(
    versionsRepo as never,
    fieldsRepo as never,
    lookup as unknown as ErpLookupService,
  );
  return { service, versionsRepo, fieldsRepo, lookup };
}

function item(fieldId: string, valueJson: unknown) {
  return {
    fieldId,
    fieldCode: fieldId,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson,
  };
}

describe('ErpLookupFieldService.searchField', () => {
  it('pesquisa na lista configurada no campo publicado, com limite de 20', async () => {
    const { service, versionsRepo, fieldsRepo, lookup } = setup();

    await expect(service.searchField('form-1', 'cliente', ' acm ', false)).resolves.toEqual({
      items: [{ value: '001', label: 'ACME' }],
    });
    expect(versionsRepo.findOne.mock.calls[0][0].where).toMatchObject({
      formId: 'form-1',
      isPublished: true,
      form: { status: 'published' },
    });
    expect(fieldsRepo.findOne.mock.calls[0][0].where).toEqual({
      formVersionId: 'version-1',
      code: 'cliente',
      fieldType: FormFieldType.ERP_LOOKUP,
    });
    expect(lookup.search).toHaveBeenCalledWith(CONECTOR, 'clientes', 'acm', SEARCH_LIMIT);
  });

  it('modo lista carrega sem texto e sem limite', async () => {
    const { service, lookup } = setup(
      erpField({ settingsJson: { erpConnectorId: CONECTOR, fonte: 'filiais', modo: 'lista' } }),
    );

    await service.searchField('form-1', 'cliente', '', false);

    expect(lookup.search).toHaveBeenCalledWith(CONECTOR, 'filiais', '', undefined);
  });

  it('campo inexistente, de outro tipo ou formulário não publicado → 404', async () => {
    const semCampo = setup(null);
    await expect(semCampo.service.searchField('form-1', 'x', 'abc', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const semVersao = setup();
    semVersao.versionsRepo.findOne.mockResolvedValue(null);
    await expect(
      semVersao.service.searchField('form-1', 'cliente', 'abc', false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('modo pesquisa respeita o mínimo de caracteres sem chamar o ERP', async () => {
    const { service, lookup } = setup();

    await expect(service.searchField('form-1', 'cliente', 'ac', false)).rejects.toThrow(
      new BadRequestException('Digite pelo menos 3 caracteres.'),
    );
    expect(lookup.search).not.toHaveBeenCalled();
  });

  it('exigirLogin: sem login → 401; com login → pesquisa', async () => {
    const { service } = setup(
      erpField({
        settingsJson: { erpConnectorId: CONECTOR, fonte: 'clientes', exigirLogin: true },
      }),
    );

    await expect(service.searchField('form-1', 'cliente', 'acme', false)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.searchField('form-1', 'cliente', 'acme', true)).resolves.toBeDefined();
  });

  it('ERP fora → 503 ERP_INDISPONIVEL', async () => {
    const { service, lookup } = setup();
    lookup.search.mockRejectedValue(new ErpLookupUnavailableError('HTTP 503'));

    const erro = await service.searchField('form-1', 'cliente', 'acme', false).catch((e) => e);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect((erro as ServiceUnavailableException).getResponse()).toMatchObject({
      statusCode: 503,
      code: 'ERP_INDISPONIVEL',
    });
  });

  it('400 da API vira 400 para o navegador', async () => {
    const { service, lookup } = setup();
    lookup.search.mockRejectedValue(new ErpLookupBadRequestError('Pesquisa inválida.'));

    await expect(service.searchField('form-1', 'cliente', 'acme', false)).rejects.toThrow(
      new BadRequestException('Pesquisa inválida.'),
    );
  });

  it('campo publicado sem configuração → 503 (não quebra com 500)', async () => {
    const { service } = setup(erpField({ settingsJson: {} }));

    await expect(service.searchField('form-1', 'cliente', 'acme', false)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('ErpLookupFieldService.detailsField', () => {
  it('busca a ficha na lista configurada no campo publicado', async () => {
    const { service, lookup } = setup();

    await expect(service.detailsField('form-1', 'cliente', ' 001 ', false)).resolves.toEqual({
      detalhes: { value: '001', titulo: 'ACME' },
    });
    expect(lookup.details).toHaveBeenCalledWith(CONECTOR, 'clientes', '001');
  });

  it('sem ficha para mostrar → detalhes null', async () => {
    const { service, lookup } = setup();
    lookup.details.mockResolvedValue(null);

    await expect(service.detailsField('form-1', 'cliente', '001', false)).resolves.toEqual({
      detalhes: null,
    });
  });

  it('exigirLogin: sem login → 401 sem chamar o ERP; com login → ficha', async () => {
    const { service, lookup } = setup(
      erpField({
        settingsJson: { erpConnectorId: CONECTOR, fonte: 'clientes', exigirLogin: true },
      }),
    );

    await expect(service.detailsField('form-1', 'cliente', '001', false)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(lookup.details).not.toHaveBeenCalled();
    await expect(service.detailsField('form-1', 'cliente', '001', true)).resolves.toBeDefined();
  });

  it('campo inexistente → 404; ERP fora → 503 ERP_INDISPONIVEL', async () => {
    await expect(
      setup(null).service.detailsField('form-1', 'x', '001', false),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { service, lookup } = setup();
    lookup.details.mockRejectedValue(new ErpLookupUnavailableError('HTTP 503'));
    const erro = await service.detailsField('form-1', 'cliente', '001', false).catch((e) => e);
    expect(erro).toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('ErpLookupFieldService.resolveSubmissionItems', () => {
  const textField = {
    id: 'field-nome',
    code: 'nome',
    fieldType: FormFieldType.SHORT_TEXT,
  } as FormFieldEntity;

  it('sem campo de lista do ERP, devolve os itens como vieram e não chama o ERP', async () => {
    const { service, lookup } = setup();
    const items = [{ ...item('field-nome', null), valueText: 'Ana' }];

    await expect(service.resolveSubmissionItems([textField], items)).resolves.toEqual(items);
    expect(lookup.resolve).not.toHaveBeenCalled();
  });

  it('grava o nome que o ERP devolve e guarda código, nome, lista e quando conferiu', async () => {
    const { service, lookup } = setup();

    const [resolvido] = await service.resolveSubmissionItems(
      [erpField()],
      [{ ...item('field-erp', { value: '001' }), valueText: 'nome forjado' }],
    );

    expect(lookup.resolve).toHaveBeenCalledWith(CONECTOR, 'clientes', '001');
    expect(resolvido.valueText).toBe('ACME LTDA');
    expect(resolvido.valueJson).toEqual({
      value: '001',
      label: 'ACME LTDA',
      fonte: 'clientes',
      resolvidoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('código que não existe no ERP → erro no campo', async () => {
    const { service, lookup } = setup();
    lookup.resolve.mockResolvedValue(null);

    const erro = await service
      .resolveSubmissionItems([erpField()], [item('field-erp', { value: '999' })])
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FieldValidationException);
    expect((erro as FieldValidationException).getResponse()).toMatchObject({
      errors: { cliente: 'Opção não encontrada no ERP. Pesquise e escolha de novo.' },
    });
  });

  it('ERP fora → 503 ERP_INDISPONIVEL', async () => {
    const { service, lookup } = setup();
    lookup.resolve.mockRejectedValue(new ErpLookupUnavailableError('ECONNREFUSED'));

    const erro = await service
      .resolveSubmissionItems([erpField()], [item('field-erp', { value: '001' })])
      .catch((e) => e);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect((erro as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'ERP_INDISPONIVEL',
    });
  });

  it('campo de lista do ERP sem valor (opcional, não preenchido) passa direto', async () => {
    const { service, lookup } = setup();

    await service.resolveSubmissionItems([erpField()], [item('field-erp', null)]);

    expect(lookup.resolve).not.toHaveBeenCalled();
  });
});

describe('ErpLookupFieldService.detailsForAnswers', () => {
  const answered = (field: FormFieldEntity | null, valueJson: unknown, fieldCode = 'cliente') => ({ fieldCode, valueJson, field });
  const stored = { value: '001', label: 'ACME LTDA', fonte: 'clientes', resolvidoEm: '2026-10-13T00:00:00Z' };

  it('monta a ficha de cada "Lista do ERP" respondida, com o conector e a lista da versão respondida', async () => {
    const { service, lookup } = setup();
    const result = await service.detailsForAnswers([
      answered(erpField(), stored),
      answered({ ...erpField(), fieldType: FormFieldType.SHORT_TEXT } as FormFieldEntity, 'texto', 'obs'),
    ]);
    expect(lookup.details).toHaveBeenCalledWith(CONECTOR, 'clientes', '001');
    expect(result).toEqual([
      { fieldCode: 'cliente', fieldLabel: 'Cliente', value: '001', label: 'ACME LTDA', status: 'ok', details: { value: '001', titulo: 'ACME' } },
    ]);
  });

  it('sem ficha → sem_detalhes; ERP fora → indisponivel, mantendo o nome gravado; uma falha não derruba as outras', async () => {
    const { service, lookup } = setup();
    lookup.details
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new ErpLookupUnavailableError('fora'));
    const result = await service.detailsForAnswers([
      answered(erpField(), stored, 'a'),
      answered(erpField(), { ...stored, value: '002', label: 'BETA' }, 'b'),
    ]);
    expect(result.map((r) => [r.fieldCode, r.status, r.label])).toEqual([
      ['a', 'sem_detalhes', 'ACME LTDA'],
      ['b', 'indisponivel', 'BETA'],
    ]);
  });

  it('resposta fora do formato gravado ou campo sem configuração é ignorada', async () => {
    const { service, lookup } = setup();
    const result = await service.detailsForAnswers([
      answered(erpField(), { value: '001' }),
      answered({ ...erpField(), settingsJson: {} } as FormFieldEntity, stored),
      answered(null, stored),
    ]);
    expect(result).toEqual([]);
    expect(lookup.details).not.toHaveBeenCalled();
  });
});
