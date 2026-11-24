import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { FormFieldType } from '../../../../common/enums/form-field-type.enum';
import { FieldValidationException } from '../../../../common/exceptions/field-validation.exception';
import type { FormFieldEntity, FormVersionEntity } from '../../../../database/entities';
import { ErpLookupUnavailableError } from './erp-lookup.errors';
import type { ErpLookupService } from './erp-lookup.service';
import { ErpTableFieldService } from './erp-table-field.service';
import { computeErpTableHash } from './erp-table.snapshot';

const CONECTOR = '6f1c2b8e-3d4a-4f5b-9c7d-1e2f3a4b5c6d';
const SOURCE_COLUMNS = [
  { key: 'produto', label: 'Produto', type: 'text' as const },
  { key: 'qtde', label: 'Qtd. pedida', type: 'number' as const },
];
const ERP_ROWS = [
  { key: 'A', values: { produto: 'Ovos', qtde: 10, faturada: 9 } },
  { key: 'B', values: { produto: 'Leite', qtde: 5, faturada: 5 } },
];
const HASH = computeErpTableHash(
  ERP_ROWS.map((row) => ({
    key: row.key,
    values: { produto: row.values.produto, qtde: row.values.qtde },
  })),
  SOURCE_COLUMNS,
);

function field(overrides: Partial<FormFieldEntity> = {}): FormFieldEntity {
  return {
    id: 'f-tabela',
    code: 'itens',
    label: 'Itens',
    fieldType: FormFieldType.ERP_TABLE,
    required: true,
    sectionId: 's1',
    order: 2,
    settingsJson: {
      erpConnectorId: CONECTOR,
      fonte: 'pedidos',
      dataset: 'itens',
      parameterBindings: [{ parameter: 'pedidoId', fieldCode: 'pedido' }],
      sourceColumns: SOURCE_COLUMNS,
      inputColumns: [{ id: 'conferida', label: 'Conferida', type: 'number', required: true }],
    },
    ...overrides,
  } as FormFieldEntity;
}

const PEDIDO = {
  id: 'f-pedido',
  code: 'pedido',
  label: 'Pedido',
  fieldType: FormFieldType.ERP_LOOKUP,
  sectionId: 's1',
  order: 1,
} as FormFieldEntity;

function setup(options: { enabled?: boolean; fields?: FormFieldEntity[] } = {}) {
  const fields = options.fields ?? [PEDIDO, field()];
  const versionsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'version-1' }) };
  const fieldsRepo = { find: jest.fn().mockResolvedValue(fields) };
  const lookup = {
    queryTable: jest.fn().mockResolvedValue(ERP_ROWS),
    listTables: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue(options.enabled === false ? 'false' : 'true'),
  };
  const service = new ErpTableFieldService(
    versionsRepo as never,
    fieldsRepo as never,
    lookup as unknown as ErpLookupService,
    config as never,
  );
  return { service, lookup, fields };
}

function item(fieldId: string, fieldCode: string, values: Partial<Record<string, unknown>>) {
  return {
    fieldId,
    fieldCode,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    ...values,
  } as {
    fieldId: string;
    fieldCode: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueJson: unknown;
  };
}

/** O pedido já conferido pelo ErpLookupFieldService: label do ERP + código. */
const pedidoItem = item('f-pedido', 'pedido', {
  valueText: 'Pedido 123 — Mercado',
  valueJson: { value: '123', label: 'Pedido 123 — Mercado' },
});

function tabelaItem(
  sourceHash = HASH,
  rows: unknown = [
    { key: 'A', answers: { conferida: 8 } },
    { key: 'B', answers: { conferida: 5 } },
  ],
) {
  return item('f-tabela', 'itens', { valueJson: { sourceHash, rows } });
}

describe('ErpTableFieldService.loadField', () => {
  it('consulta com o conector e a tabela do campo publicado; devolve só as colunas configuradas', async () => {
    const { service, lookup } = setup();

    const result = await service.loadField('form-1', 'itens', { pedido: { value: '123' } }, false);

    expect(lookup.queryTable).toHaveBeenCalledWith(
      CONECTOR,
      'pedidos',
      'itens',
      { pedidoId: '123' },
      { useCache: true },
    );
    expect(result.sourceHash).toBe(HASH);
    expect(result.rows[0]).toEqual({ key: 'A', values: { produto: 'Ovos', qtde: 10 } });
  });

  it('dependência vazia → 400; pedido inexistente → 404; ERP fora → 503', async () => {
    const { service, lookup } = setup();
    await expect(service.loadField('form-1', 'itens', {}, false)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    lookup.queryTable.mockResolvedValueOnce(null);
    await expect(
      service.loadField('form-1', 'itens', { pedido: '999' }, false),
    ).rejects.toBeInstanceOf(NotFoundException);

    lookup.queryTable.mockRejectedValueOnce(new ErpLookupUnavailableError('timeout'));
    await expect(
      service.loadField('form-1', 'itens', { pedido: '1' }, false),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('campo inexistente → 404; exigirLogin sem token → 401; flag desligada → 503', async () => {
    await expect(
      setup().service.loadField('form-1', 'outro', { pedido: '1' }, false),
    ).rejects.toBeInstanceOf(NotFoundException);

    const comLogin = field({
      settingsJson: { ...(field().settingsJson as object), exigirLogin: true },
    });
    await expect(
      setup({ fields: [PEDIDO, comLogin] }).service.loadField(
        'form-1',
        'itens',
        { pedido: '1' },
        false,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      setup({ enabled: false }).service.loadField('form-1', 'itens', { pedido: '1' }, false),
    ).rejects.toMatchObject({ response: { code: 'ERP_TABLE_DESATIVADO' } });
  });
});

describe('ErpTableFieldService.resolveSubmissionItems', () => {
  it('consulta sem cache com o código conferido e grava o retrato do servidor', async () => {
    const { service, lookup, fields } = setup();

    const [, tabela] = await service.resolveSubmissionItems(fields, [pedidoItem, tabelaItem()]);

    expect(lookup.queryTable).toHaveBeenCalledWith(
      CONECTOR,
      'pedidos',
      'itens',
      { pedidoId: '123' },
      { useCache: false },
    );
    expect(tabela.valueJson).toMatchObject({
      schemaVersion: 1,
      source: { dataset: 'itens', dependencies: { pedido: '123' }, sourceHash: HASH },
      rows: [
        { key: 'A', sourceValues: { produto: 'Ovos', qtde: 10 }, answers: { conferida: 8 } },
        { key: 'B', sourceValues: { produto: 'Leite', qtde: 5 }, answers: { conferida: 5 } },
      ],
    });
    expect(tabela.valueText).toBe('Ovos - 10 | Conferida: 8\nLeite - 5 | Conferida: 5');
  });

  it('itens mudaram no ERP → 409 ERP_TABLE_CHANGED com o campo afetado', async () => {
    const { service, fields } = setup();

    const promise = service.resolveSubmissionItems(fields, [
      pedidoItem,
      tabelaItem('sha256-velho'),
    ]);

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'ERP_TABLE_CHANGED', fields: ['itens'] },
    });
  });

  it('valores do ERP adulterados no navegador não entram (o servidor ignora sourceValues)', async () => {
    const { service, fields } = setup();
    const adulterado = item('f-tabela', 'itens', {
      valueJson: {
        sourceHash: HASH,
        rows: [
          { key: 'A', answers: { conferida: 8 }, sourceValues: { qtde: 9999 } },
          { key: 'B', answers: { conferida: 5 } },
        ],
      },
    });

    const [, tabela] = await service.resolveSubmissionItems(fields, [pedidoItem, adulterado]);

    expect(
      (tabela.valueJson as { rows: Array<{ sourceValues: unknown }> }).rows[0].sourceValues,
    ).toEqual({
      produto: 'Ovos',
      qtde: 10,
    });
  });

  it('chave inventada, célula inválida ou formato do app antigo → 422 no campo', async () => {
    const { service, fields } = setup();
    for (const valueJson of [
      { sourceHash: HASH, rows: [{ key: 'A', answers: { conferida: 1 } }, { key: 'Z' }] },
      {
        sourceHash: HASH,
        rows: [
          { key: 'A', answers: {} },
          { key: 'B', answers: { conferida: 1 } },
        ],
      },
    ]) {
      await expect(
        service.resolveSubmissionItems(fields, [
          pedidoItem,
          item('f-tabela', 'itens', { valueJson }),
        ]),
      ).rejects.toBeInstanceOf(FieldValidationException);
    }
    await expect(
      service.resolveSubmissionItems(fields, [
        pedidoItem,
        item('f-tabela', 'itens', { valueText: '8 caixas' }),
      ]),
    ).rejects.toMatchObject({
      response: { errors: { itens: 'Este campo só pode ser preenchido pelo portal web.' } },
    });
  });

  it('pedido sem itens: obrigatório bloqueia; opcional grava tabela vazia', async () => {
    const vazio = computeErpTableHash([], SOURCE_COLUMNS);

    const obrigatorio = setup();
    obrigatorio.lookup.queryTable.mockResolvedValue([]);
    await expect(
      obrigatorio.service.resolveSubmissionItems(obrigatorio.fields, [
        pedidoItem,
        tabelaItem(vazio, []),
      ]),
    ).rejects.toMatchObject({
      response: { errors: { itens: 'O registro não tem itens no ERP.' } },
    });

    const opcional = setup({ fields: [PEDIDO, field({ required: false })] });
    opcional.lookup.queryTable.mockResolvedValue([]);
    const [, tabela] = await opcional.service.resolveSubmissionItems(opcional.fields, [
      pedidoItem,
      tabelaItem(vazio, []),
    ]);
    expect(tabela.valueJson).toMatchObject({ rows: [] });
  });

  it('dependência ausente (vazia ou oculta): obrigatório → erro; opcional → tabela some', async () => {
    const obrigatorio = setup();
    await expect(
      obrigatorio.service.resolveSubmissionItems(obrigatorio.fields, [tabelaItem()]),
    ).rejects.toMatchObject({
      response: { errors: { itens: 'Preencha "Pedido" antes da tabela.' } },
    });

    const opcional = setup({ fields: [PEDIDO, field({ required: false })] });
    await expect(
      opcional.service.resolveSubmissionItems(opcional.fields, [tabelaItem()]),
    ).resolves.toEqual([]);
    expect(opcional.lookup.queryTable).not.toHaveBeenCalled();
  });

  it('ERP fora → 503 ERP_INDISPONIVEL; flag desligada → 503 ERP_TABLE_DESATIVADO', async () => {
    const fora = setup();
    fora.lookup.queryTable.mockRejectedValue(new ErpLookupUnavailableError('timeout'));
    await expect(
      fora.service.resolveSubmissionItems(fora.fields, [pedidoItem, tabelaItem()]),
    ).rejects.toMatchObject({ response: { code: 'ERP_INDISPONIVEL' } });

    const desligada = setup({ enabled: false });
    await expect(
      desligada.service.resolveSubmissionItems(desligada.fields, [pedidoItem, tabelaItem()]),
    ).rejects.toMatchObject({ response: { code: 'ERP_TABLE_DESATIVADO' } });
  });

  it('sem tabela no envio → devolve os itens intactos e não consulta nada', async () => {
    const { service, lookup, fields } = setup({ enabled: false });
    await expect(service.resolveSubmissionItems(fields, [pedidoItem])).resolves.toEqual([
      pedidoItem,
    ]);
    expect(lookup.queryTable).not.toHaveBeenCalled();
  });
});

describe('ErpTableFieldService — publicação', () => {
  function version(fields: FormFieldEntity[]): FormVersionEntity {
    return {
      sections: [
        { id: 's1', order: 1, fields: fields.filter((f) => f.sectionId === 's1') },
        { id: 's2', order: 2, fields: fields.filter((f) => f.sectionId === 's2') },
      ],
    } as unknown as FormVersionEntity;
  }
  const manager = (isActive = true) => ({
    findOne: jest.fn().mockResolvedValue({ id: CONECTOR, isActive }),
  });

  it('estrutura ok: dependente antes, conector ativo', async () => {
    const { service } = setup();
    await expect(
      service.assertStructureReady(manager() as never, version([PEDIDO, field()])),
    ).resolves.toBeUndefined();
  });

  it('recusa dependente depois da tabela, inexistente, de tipo errado, conector inativo e flag desligada', async () => {
    const { service } = setup();
    const depois = { ...PEDIDO, sectionId: 's2', order: 1 } as FormFieldEntity;
    await expect(
      service.assertStructureReady(manager() as never, version([depois, field()])),
    ).rejects.toThrow('precisa vir antes da tabela');
    await expect(
      service.assertStructureReady(manager() as never, version([field()])),
    ).rejects.toThrow('"pedido" usado como parâmetro não existe');
    await expect(
      service.assertStructureReady(
        manager() as never,
        version([{ ...PEDIDO, fieldType: FormFieldType.FILE_UPLOAD } as FormFieldEntity, field()]),
      ),
    ).rejects.toThrow('não pode ser usado como parâmetro');
    await expect(
      service.assertStructureReady(manager(false) as never, version([PEDIDO, field()])),
    ).rejects.toThrow('conector de ERP não existe ou está inativo');
    await expect(
      setup({ enabled: false }).service.assertStructureReady(
        manager() as never,
        version([PEDIDO, field()]),
      ),
    ).rejects.toThrow('desativada neste ambiente');
  });

  it('confere no erp-lookup: tabela, chave, parâmetros obrigatórios e colunas', async () => {
    const { service, lookup } = setup();
    const definicao = {
      id: 'itens',
      label: 'Itens',
      parameters: [
        { name: 'pedidoId', type: 'number', required: true },
        { name: 'filial', type: 'text', required: true },
      ],
      columns: [{ key: 'produto', label: 'Produto', type: 'text' }],
      rowKey: null,
      maxRows: 500,
    };
    lookup.listTables.mockResolvedValueOnce([definicao]);
    await expect(service.assertSourcesReady(version([PEDIDO, field()]))).rejects.toThrow(
      /chave das linhas.*"filial" precisa de um campo associado.*"Qtd. pedida" não existe mais/,
    );

    // Caso de prod (2026-11-04): tabela como 1º campo, nada associado. A mensagem diz onde
    // associar e de que tipo o campo precisa ser — uma vez só, não por parâmetro.
    lookup.listTables.mockResolvedValueOnce([{ ...definicao, rowKey: 'item' }]);
    const semAssociacao = field({
      order: 1,
      settingsJson: { ...(field().settingsJson as Record<string, unknown>), parameterBindings: [] },
    });
    const erro = await service
      .assertSourcesReady(version([semAssociacao]))
      .catch((err: Error) => err.message);
    expect(erro).toMatch(/"pedidoId" precisa de um campo associado; o parâmetro "filial" precisa/);
    expect(erro).toMatch(/em "Parâmetros" da tabela, escolha um campo que venha antes dela/);
    expect(String(erro).match(/escolha um campo/g)).toHaveLength(1);

    lookup.listTables.mockResolvedValueOnce([]);
    await expect(service.assertSourcesReady(version([PEDIDO, field()]))).rejects.toThrow(
      'não tem a tabela "itens"',
    );

    lookup.listTables.mockRejectedValueOnce(new ErpLookupUnavailableError('timeout'));
    await expect(service.assertSourcesReady(version([PEDIDO, field()]))).rejects.toThrow(
      'Não foi possível conferir',
    );
  });
});
