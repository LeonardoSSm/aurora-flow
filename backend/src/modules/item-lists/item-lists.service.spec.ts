import { BadRequestException } from '@nestjs/common';
import {
  FormFieldEntity,
  FormFieldOptionEntity,
  ItemListEntity,
  ItemListItemEntity,
  KanbanPhaseFieldEntity,
} from '../../database/entities';
import type { SaveItemListDto } from './dto/save-item-list.dto';
import { ItemListsService } from './item-lists.service';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';

/** Query builder que devolve `rows` em getMany (o filtro por lista é SQL; aqui só o resultado). */
function qb(rows: unknown[]) {
  const builder = {
    leftJoinAndSelect: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    andWhere: () => builder,
    getMany: async () => rows,
  };
  return builder;
}

function makeService({
  existingItems = [] as Array<{ id: string }>,
  listItems = [] as Array<{ id: string; listId: string; name: string; isActive: boolean }>,
  formFields = [] as unknown[],
  phaseFields = [] as unknown[],
} = {}) {
  const listRepo = {
    create: jest.fn((value: object) => value),
    save: jest.fn(async (value: object) => ({ id: 'list-1', ...value })),
    findOne: jest.fn().mockResolvedValue({ id: 'list-1', name: 'Antiga' }),
    find: jest.fn().mockResolvedValue([{ id: 'list-1' }]),
  };
  const itemRepo = {
    create: jest.fn((value: object) => value),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(async (options: { where: { listId: unknown } }) =>
      typeof options.where.listId === 'string' ? existingItems : listItems,
    ),
  };
  const optionRepo = { create: jest.fn((value: object) => value), save: jest.fn() };
  const formFieldRepo = { createQueryBuilder: () => qb(formFields), save: jest.fn() };
  const phaseFieldRepo = { createQueryBuilder: () => qb(phaseFields), save: jest.fn() };
  const repos = new Map<unknown, unknown>([
    [ItemListEntity, listRepo],
    [ItemListItemEntity, itemRepo],
    [FormFieldOptionEntity, optionRepo],
    [FormFieldEntity, formFieldRepo],
    [KanbanPhaseFieldEntity, phaseFieldRepo],
  ]);
  const manager = {
    getRepository: jest.fn((entity: unknown) => repos.get(entity)),
    query: jest.fn().mockResolvedValue([]),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    manager,
  };
  const lists = { findOne: jest.fn().mockResolvedValue({ id: 'list-1', name: 'X', items: [] }) };
  const service = new ItemListsService(dataSource as never, lists as never, {} as never);
  return { service, manager, listRepo, itemRepo, optionRepo, formFieldRepo, phaseFieldRepo };
}

const dto = (overrides: Partial<SaveItemListDto> = {}): SaveItemListDto => ({
  name: ' Matéria-prima ',
  items: [{ name: ' Farinha ', code: ' MP1 ' }, { name: 'Sal' }],
  ...overrides,
});

describe('ItemListsService', () => {
  it('cria a lista com os itens na ordem (código opcional, nomes aparados)', async () => {
    const { service, listRepo, itemRepo } = makeService();
    await service.create(dto(), 'u-1');
    expect(listRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Matéria-prima', description: null, createdBy: 'u-1' }),
    );
    expect(itemRepo.save).toHaveBeenCalledWith(
      [
        expect.objectContaining({ code: 'MP1', name: 'Farinha', isActive: true, order: 0 }),
        expect.objectContaining({ code: null, name: 'Sal', order: 1 }),
      ],
      { chunk: 200 },
    );
  });

  it('salvar mantém o id dos itens que ficam e apaga os que saíram', async () => {
    const { service, itemRepo } = makeService({ existingItems: [{ id: ID_1 }, { id: ID_2 }] });
    await service.update('list-1', dto({ items: [{ id: ID_1, name: 'Farinha' }] }));
    expect(itemRepo.delete).toHaveBeenCalledWith([ID_2]);
    expect(itemRepo.save).toHaveBeenCalledWith(
      [expect.objectContaining({ id: ID_1 })],
      expect.anything(),
    );
  });

  it('guarda as colunas da lista e os valores de cada item conferidos contra elas', async () => {
    const { service, listRepo, itemRepo } = makeService();
    await service.create(
      dto({
        columns: [
          { id: 'prazo', name: ' Prazo ', type: 'number' },
          { id: 'ok', name: 'Homologado', type: 'checkbox' },
        ],
        items: [{ name: 'Farinha', values: { prazo: '30', ok: false, outra: 'x' } }],
      }),
      null,
    );
    expect(listRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        columnsJson: [
          { id: 'prazo', name: 'Prazo', type: 'number' },
          { id: 'ok', name: 'Homologado', type: 'checkbox' },
        ],
      }),
    );
    expect(itemRepo.save).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Farinha', valuesJson: { prazo: 30 } })],
      expect.anything(),
    );
  });

  it('salvar sem colunas/valores mantém os que já existem (menos os de colunas removidas)', async () => {
    const { service, listRepo, itemRepo } = makeService({
      existingItems: [{ id: ID_1, valuesJson: { prazo: 10, velha: 'x' } } as never],
    });
    listRepo.findOne.mockResolvedValue({
      id: 'list-1',
      name: 'Antiga',
      columnsJson: [{ id: 'prazo', name: 'Prazo', type: 'number' }],
    });
    await service.update('list-1', dto({ items: [{ id: ID_1, name: 'Farinha' }] }));
    expect(listRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ columnsJson: [{ id: 'prazo', name: 'Prazo', type: 'number' }] }),
    );
    expect(itemRepo.save).toHaveBeenCalledWith(
      [expect.objectContaining({ id: ID_1, valuesJson: { prazo: 10 } })],
      expect.anything(),
    );
  });

  it('recusa nomes (sem diferenciar maiúscula) ou códigos repetidos', async () => {
    const { service } = makeService();
    await expect(
      service.create(dto({ items: [{ name: 'Sal' }, { name: ' sal' }] }), null),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        dto({
          items: [
            { name: 'A', code: 'X' },
            { name: 'B', code: 'X' },
          ],
        }),
        null,
      ),
    ).rejects.toThrow('Dois itens com o código "X".');
  });

  it('salvar a lista atualiza as opções dos campos ligados (formulário e fase)', async () => {
    const listItems = [
      { id: 'i-1', listId: 'list-1', name: 'Farinha', isActive: true },
      { id: 'i-2', listId: 'list-1', name: 'Açúcar', isActive: false },
      { id: 'i-3', listId: 'list-1', name: 'Sal novo', isActive: true },
    ];
    const formField = {
      id: 'ff-1',
      settingsJson: { itemListId: 'list-1', displayAs: 'dropdown' },
      options: [
        { id: 'o-1', fieldId: 'ff-1', internalValue: 'i-1', displayLabel: 'Farinha', order: 0 },
        { id: 'o-2', fieldId: 'ff-1', internalValue: 'i-2', displayLabel: 'Açúcar', order: 1 },
      ],
    };
    const phaseField = {
      id: 'pf-1',
      settingsJson: { itemListId: 'list-1' },
      optionsJson: [{ value: 'i-1', label: 'Farinha' }],
    };
    const { service, optionRepo, formFieldRepo, phaseFieldRepo } = makeService({
      listItems,
      formFields: [formField],
      phaseFields: [phaseField],
    });

    await service.update('list-1', dto({ items: [] }));

    // Farinha fica como está; Sal novo entra; Açúcar (inativo) vai para o fim, escondido.
    expect(optionRepo.save).toHaveBeenCalledWith(
      [
        { fieldId: 'ff-1', internalValue: 'i-3', displayLabel: 'Sal novo', order: 1 },
        expect.objectContaining({ id: 'o-2', internalValue: 'i-2', order: 2 }),
      ],
      { chunk: 200 },
    );
    expect(formFieldRepo.save).toHaveBeenCalledWith({
      id: 'ff-1',
      settingsJson: { itemListId: 'list-1', displayAs: 'dropdown', hiddenOptionValues: ['i-2'] },
    });
    expect(phaseFieldRepo.save).toHaveBeenCalledWith({
      id: 'pf-1',
      settingsJson: { itemListId: 'list-1' },
      optionsJson: [
        { value: 'i-1', label: 'Farinha' },
        { value: 'i-3', label: 'Sal novo' },
      ],
    });
  });

  it('campo de fase salvo com lista que não existe mais é recusado', async () => {
    const { service, manager } = makeService();
    (manager.getRepository(ItemListEntity) as { find: jest.Mock }).find.mockResolvedValue([]);
    await expect(
      service.syncPhaseFieldInput(manager as never, 'single_select', { itemListId: 'sumiu' }, []),
    ).rejects.toThrow('A lista de itens escolhida não existe mais.');
    await expect(
      service.syncPhaseFieldInput(manager as never, 'short_text', { itemListId: 'x' }, []),
    ).resolves.toBeNull();
  });
});
