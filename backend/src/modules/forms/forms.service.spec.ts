import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { FormEntity, FormVersionEntity, UserEntity } from '../../database/entities';
import type { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import type { CreateFormDto } from './dto/create-form.dto';
import { FormVersionWriter } from './form-version.writer';
import { FormListQuery } from './form-list.query';
import { PublicFormsService } from './public-forms.service';
import { FormsService } from './forms.service';
import { fakeProcessAccess } from '../access/testing/fake-process-access';

// Formulários destes testes não têm "Tabela dinâmica do ERP": as conferências não fazem nada.
// Listas de itens: sem campos ligados nesses testes, sincronizar é no-op.
const itemListsStub = { syncFormFields: jest.fn().mockResolvedValue(undefined) };
const itemOrderFieldsStub = {
  assertFieldsReady: jest.fn().mockResolvedValue(undefined),
  publicSettingsByField: jest.fn().mockResolvedValue(new Map()),
};
const erpTableFieldsStub = {
  assertStructureReady: jest.fn().mockResolvedValue(undefined),
  assertSourcesReady: jest.fn().mockResolvedValue(undefined),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACTOR_ID = 'actor-id';
const FORM_ID = 'form-id';
const VERSION_ID = 'v-1';

const ADMIN_ACTOR: Partial<UserEntity> = {
  id: ACTOR_ID,
  role: 'admin',
};

const BASE_DTO: CreateFormDto = {
  name: 'My Form',
  sections: [
    {
      title: 'Section One',
      fields: [
        {
          code: 'nome',
          label: 'Nome',
          fieldType: FormFieldType.SHORT_TEXT,
          required: false,
        },
      ],
    },
  ],
};

const DIFFERENT_DTO: CreateFormDto = {
  name: 'My Form',
  sections: [
    {
      title: 'Section One',
      fields: [
        {
          code: 'nome',
          label: 'Nome',
          fieldType: FormFieldType.SHORT_TEXT,
          required: false,
        },
        {
          code: 'email',
          label: 'Email',
          fieldType: FormFieldType.SHORT_TEXT,
          required: true,
        },
      ],
    },
  ],
};

/** Version entity whose structure matches BASE_DTO */
function makeMatchingVersion(published = false): Partial<FormVersionEntity> {
  return {
    id: VERSION_ID,
    versionNumber: 1,
    isPublished: published,
    sections: [
      {
        id: 's-1',
        title: 'Section One',
        order: 1,
        fields: [
          {
            id: 'f-1',
            code: 'nome',
            label: 'Nome',
            fieldType: FormFieldType.SHORT_TEXT,
            required: false,
            order: 1,
            options: [],
          },
        ],
      },
    ],
  } as unknown as Partial<FormVersionEntity>;
}

/** Version entity whose structure does NOT match BASE_DTO */
function makeDifferentVersion(published = false): Partial<FormVersionEntity> {
  return {
    id: VERSION_ID,
    versionNumber: 1,
    isPublished: published,
    sections: [
      {
        id: 's-1',
        title: 'Other Title',
        order: 1,
        fields: [],
      },
    ],
  } as unknown as Partial<FormVersionEntity>;
}

// ─── Service factory ──────────────────────────────────────────────────────────

interface ServiceRig {
  service: FormsService;
  versionWriter: FormVersionWriter;
  usersRepo: { findOne: jest.Mock };
  formsRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  versionsRepo: { find: jest.Mock; findOne: jest.Mock };
  dataSource: { transaction: jest.Mock };
  eventEmitter: { emit: jest.Mock };
  googleWorkspaceService: Partial<GoogleWorkspaceService>;
}

function makeService(
  opts: {
    /** Version the manager returns when asked for FormVersionEntity */
    managerVersion?: Partial<FormVersionEntity> | null;
    /** Form stubs returned inside the transaction (versions array) */
    formVersionStubs?: Pick<FormVersionEntity, 'id' | 'versionNumber'>[];
    /** Override the whole manager object */
    managerOverride?: Record<string, jest.Mock>;
    /** Override dataSource.transaction */
    transactionOverride?: jest.Mock;
  } = {},
): ServiceRig {
  const versionStubs = opts.formVersionStubs ?? [{ id: VERSION_ID, versionNumber: 1 }];

  const formInsideTransaction: Partial<FormEntity> = {
    id: FORM_ID,
    name: 'Old Name',
    status: FormStatus.DRAFT,
    googleSheetsEnabled: false,
    googleSheetsAutoCreate: false,
    createdBy: ACTOR_ID,
    versions: versionStubs as FormVersionEntity[],
  };

  let saveSeq = 0;
  const defaultManager: Record<string, jest.Mock> = {
    findOne: jest.fn().mockImplementation((Entity: unknown) => {
      if (Entity === FormEntity) return Promise.resolve(formInsideTransaction);
      if (Entity === FormVersionEntity) return Promise.resolve(opts.managerVersion ?? null);
      if (Entity === UserEntity) return Promise.resolve(ADMIN_ACTOR);
      return Promise.resolve(null);
    }),
    save: jest.fn().mockImplementation((entity: unknown) => {
      if (Array.isArray(entity))
        return Promise.resolve(
          entity.map((e: Record<string, unknown>, i: number) => ({
            ...e,
            id: e['id'] ?? `gen-${saveSeq++}-${i}`,
          })),
        );
      const e = entity as Record<string, unknown>;
      return Promise.resolve({ ...e, id: e['id'] ?? `gen-${saveSeq++}` });
    }),
    create: jest
      .fn()
      .mockImplementation((_: unknown, data: Record<string, unknown>) => ({ ...data })),
    delete: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    getRepository: jest.fn(),
  };

  const manager =
    opts.managerOverride != null ? { ...defaultManager, ...opts.managerOverride } : defaultManager;

  const transactionFn =
    opts.transactionOverride ??
    jest.fn().mockImplementation((cb: (m: typeof manager) => Promise<unknown>) => cb(manager));

  const dataSource = { transaction: transactionFn } as unknown as DataSource;

  const usersRepo = {
    findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
    find: jest.fn().mockResolvedValue([]),
  };

  const formForFindOne: Partial<FormEntity> = {
    id: FORM_ID,
    name: BASE_DTO.name,
    status: FormStatus.DRAFT,
    createdBy: ACTOR_ID,
    createdByUser: {
      id: ACTOR_ID,
      fullName: 'A',
      email: 'a@b.com',
      role: 'admin',
    } as UserEntity,
    versions: [],
  };

  // Padrão do createQueryBuilder: a pré-checagem da "Tabela dinâmica do ERP" na publicação
  // (fora da transação) não acha versão e segue. Testes da listagem trocam o retorno.
  const formsRepo = {
    findOne: jest.fn().mockResolvedValue(formForFindOne),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  };

  const versionsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const eventEmitter = { emit: jest.fn() };

  const googleWorkspaceService = {
    findConnectedGoogleUserId: jest.fn().mockResolvedValue(null),
    autoCreateSpreadsheetIfNeeded: jest.fn().mockResolvedValue(undefined),
    getFormGoogleSheetsStatus: jest.fn().mockResolvedValue({}),
    createSpreadsheetForForm: jest.fn().mockResolvedValue({}),
    reenqueueFormSyncJobs: jest.fn().mockResolvedValue({}),
    reprocessFormSubmissions: jest.fn().mockResolvedValue({}),
  };

  const versionWriter = new FormVersionWriter();
  const processAccess = fakeProcessAccess({ formsRepository: formsRepo, everyoneFullAccess: true });
  const formListQuery = new FormListQuery(formsRepo as never, processAccess);
  const publicFormsService = new PublicFormsService(formsRepo as never, itemOrderFieldsStub as never, itemOrderFieldsStub as never);

  const service = new FormsService(
    dataSource,
    eventEmitter as unknown as EventEmitter2,
    googleWorkspaceService as unknown as GoogleWorkspaceService,
    versionWriter,
    formListQuery,
    publicFormsService,
    processAccess,
    formsRepo as never,
    usersRepo as never,
    erpTableFieldsStub as never,
    itemListsStub as never,
    itemOrderFieldsStub as never,
  );

  return {
    service,
    versionWriter,
    usersRepo,
    formsRepo,
    versionsRepo,
    dataSource: { transaction: transactionFn },
    eventEmitter,
    googleWorkspaceService,
  };
}

// ─── PARTE C — update() smart versioning ─────────────────────────────────────

describe('FormsService.update — smart versioning', () => {
  it('does not create a new version when structure is unchanged', async () => {
    const { service, versionWriter } = makeService({
      managerVersion: makeMatchingVersion(false),
    });

    const spy = jest.spyOn(versionWriter, 'createVersionFromDto').mockResolvedValue({} as never);

    await service.update(FORM_ID, BASE_DTO, ACTOR_ID);

    expect(spy).not.toHaveBeenCalled();
  });

  it('deletes the DRAFT version and recreates it with the same versionNumber when structure changes', async () => {
    let deletedId: string | null = null;
    let createdVersionNumber: number | null = null;

    const { service, versionWriter, dataSource } = makeService({
      managerVersion: makeDifferentVersion(false),
    });

    const spy = jest
      .spyOn(versionWriter, 'createVersionFromDto')
      .mockImplementation(async (_m: unknown, _formId: unknown, versionNumber: unknown) => {
        createdVersionNumber = versionNumber as number;
        return {} as never;
      });

    // capture the delete call
    const origTransaction = (dataSource.transaction as jest.Mock).getMockImplementation();
    if (!origTransaction) throw new Error('Expected transaction mock implementation to be set');
    (dataSource.transaction as jest.Mock).mockImplementation(
      (cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
        const origCb = cb;
        return origTransaction((manager: Record<string, jest.Mock>) => {
          const wrappedManager = {
            ...manager,
            delete: jest
              .fn()
              .mockImplementation((_entity: unknown, where: Record<string, string>) => {
                deletedId = where['id'];
                return Promise.resolve({});
              }),
          };
          return origCb(wrappedManager);
        });
      },
    );

    await service.update(FORM_ID, DIFFERENT_DTO, ACTOR_ID);

    expect(deletedId).toBe(VERSION_ID);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(createdVersionNumber).toBe(1); // same versionNumber as the deleted DRAFT
  });

  it('creates a new version (versionNumber+1) when the latest version is PUBLISHED', async () => {
    let createdVersionNumber: number | null = null;

    const { service, versionWriter } = makeService({
      managerVersion: makeDifferentVersion(true), // isPublished = true
    });

    jest
      .spyOn(versionWriter, 'createVersionFromDto')
      .mockImplementation(async (_m: unknown, _formId: unknown, versionNumber: unknown) => {
        createdVersionNumber = versionNumber as number;
        return {} as never;
      });

    await service.update(FORM_ID, DIFFERENT_DTO, ACTOR_ID);

    expect(createdVersionNumber).toBe(2); // versionNumber 1 + 1
  });

  it('creates version 1 when there is no existing version', async () => {
    let createdVersionNumber: number | null = null;

    const { service, versionWriter } = makeService({
      managerVersion: null,
      formVersionStubs: [], // no existing versions
    });

    jest
      .spyOn(versionWriter, 'createVersionFromDto')
      .mockImplementation(async (_m: unknown, _formId: unknown, versionNumber: unknown) => {
        createdVersionNumber = versionNumber as number;
        return {} as never;
      });

    await service.update(FORM_ID, BASE_DTO, ACTOR_ID);

    expect(createdVersionNumber).toBe(1);
  });
});

// ─── PARTE B — updateStatus() inside a transaction ───────────────────────────

describe('FormsService.updateStatus — transaction wrapper', () => {
  function makeDraftForm(): Partial<FormEntity> {
    return {
      id: FORM_ID,
      status: FormStatus.DRAFT,
      createdBy: ACTOR_ID,
      versions: [],
    };
  }

  function makePublishableForm(): Partial<FormEntity> {
    return {
      id: FORM_ID,
      status: FormStatus.DRAFT,
      createdBy: ACTOR_ID,
      versions: [
        {
          id: VERSION_ID,
          versionNumber: 1,
          isPublished: false,
          publishedAt: null,
          sections: [
            {
              id: 's-1',
              order: 1,
              title: 'S',
              fields: [
                {
                  id: 'f-1',
                  code: 'campo',
                  label: 'Campo',
                  fieldType: FormFieldType.SHORT_TEXT,
                  required: false,
                  order: 1,
                  options: [],
                },
              ],
            },
          ],
        } as unknown as FormVersionEntity,
      ],
    };
  }

  it('non-publish status change runs inside dataSource.transaction', async () => {
    const transactionSpy = jest
      .fn()
      .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
        const manager: Record<string, jest.Mock> = {
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(makeDraftForm()),
            }),
          }),
          findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
          update: jest.fn().mockResolvedValue({}),
        };
        return cb(manager);
      });

    const { service } = makeService({ transactionOverride: transactionSpy });

    await service.updateStatus(FORM_ID, { status: FormStatus.ARCHIVED }, ACTOR_ID);

    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('non-publish throws BadRequestException for invalid transition', async () => {
    const { service } = makeService({
      transactionOverride: jest
        .fn()
        .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
          const manager: Record<string, jest.Mock> = {
            getRepository: jest.fn().mockReturnValue({
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                // Form is ARCHIVED — PAUSED is not an allowed transition
                getOne: jest.fn().mockResolvedValue({
                  ...makeDraftForm(),
                  status: FormStatus.ARCHIVED,
                }),
              }),
            }),
            findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
            update: jest.fn().mockResolvedValue({}),
          };
          return cb(manager);
        }),
    });

    await expect(
      service.updateStatus(FORM_ID, { status: FormStatus.PAUSED }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when form is not found during updateStatus', async () => {
    const { service } = makeService({
      transactionOverride: jest
        .fn()
        .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
          const manager: Record<string, jest.Mock> = {
            getRepository: jest.fn().mockReturnValue({
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(null), // not found
              }),
            }),
            findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
          };
          return cb(manager);
        }),
    });

    await expect(
      service.updateStatus(FORM_ID, { status: FormStatus.ARCHIVED }, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('concurrent publish calls both invoke dataSource.transaction (smoke test)', async () => {
    const transactionSpy = jest
      .fn()
      .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
        const form = makePublishableForm();
        const manager: Record<string, jest.Mock> = {
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(form),
            }),
          }),
          findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
          update: jest.fn().mockResolvedValue({}),
        };
        return cb(manager);
      });

    const { service } = makeService({ transactionOverride: transactionSpy });

    const results = await Promise.allSettled([
      service.updateStatus(FORM_ID, { status: FormStatus.PUBLISHED }, ACTOR_ID),
      service.updateStatus(FORM_ID, { status: FormStatus.PUBLISHED }, ACTOR_ID),
    ]);

    // Both should resolve (mock does not enforce the DB lock, but the
    // real pessimistic lock serialises concurrent transactions in production)
    expect(transactionSpy).toHaveBeenCalledTimes(2);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('blocks publishing when the latest version has an orphaned flow rule', async () => {
    const form = makePublishableForm();
    (form.versions as FormVersionEntity[])[0].sections[0] = {
      ...(form.versions as FormVersionEntity[])[0].sections[0],
      branches: [
        {
          fieldId: 'f-1',
          optionId: 'ghost-option',
          checkboxValue: null,
          targetSectionId: null,
          targetIsSubmit: true,
        },
      ],
    } as unknown as FormVersionEntity['sections'][number];

    const { service } = makeService({
      transactionOverride: jest
        .fn()
        .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
          const manager: Record<string, jest.Mock> = {
            getRepository: jest.fn().mockReturnValue({
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(form),
              }),
            }),
            findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
            update: jest.fn().mockResolvedValue({}),
          };
          return cb(manager);
        }),
    });

    await expect(
      service.updateStatus(FORM_ID, { status: FormStatus.PUBLISHED }, ACTOR_ID),
    ).rejects.toThrow(BadRequestException);
  });

  describe('faixas de pontuação do campo calculado', () => {
    function publishWith(phaseIds: string[]) {
      const form = makePublishableForm();
      (form.versions as FormVersionEntity[])[0].sections[0].fields.push({
        id: 'f-2',
        code: 'pontos',
        label: 'Pontuação',
        fieldType: FormFieldType.CALCULATED,
        required: false,
        order: 2,
        options: [],
        settingsJson: {
          formula: '{campo}',
          scoreRanges: [
            { id: 'a', from: 20, phaseId: 'fase-a' },
            { id: 'b', from: 30, label: 'Urgente', phaseId: 'fase-b' },
          ],
        },
      } as unknown as FormVersionEntity['sections'][number]['fields'][number]);
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({
        transactionOverride: jest
          .fn()
          .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) =>
            cb({
              getRepository: jest.fn().mockReturnValue({
                createQueryBuilder: jest.fn().mockReturnValue({
                  setLock: jest.fn().mockReturnThis(),
                  where: jest.fn().mockReturnThis(),
                  leftJoinAndSelect: jest.fn().mockReturnThis(),
                  getOne: jest.fn().mockResolvedValue(form),
                }),
              }),
              findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
              find: jest.fn().mockResolvedValue(phaseIds.map((id) => ({ id }))),
              update,
            }),
          ),
      });
      return { promise: service.updateStatus(FORM_ID, { status: FormStatus.PUBLISHED }, ACTOR_ID), update };
    }

    it('publica quando toda faixa aponta para uma fase do processo', async () => {
      const { promise, update } = publishWith(['fase-a', 'fase-b']);
      await expect(promise).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith(FormEntity, { id: FORM_ID }, { status: FormStatus.PUBLISHED });
    });

    it('recusa faixa cuja fase não é deste processo, dizendo qual', async () => {
      const { promise, update } = publishWith(['fase-a']);
      await expect(promise).rejects.toThrow('A faixa "Urgente" do cálculo "Pontuação"');
      expect(update).not.toHaveBeenCalled();
    });
  });
});

// ─── PARTE A — findAll() list projection ─────────────────────────────────────

describe('FormsService.findAll — list projection', () => {
  function makeQbReturning(
    forms: Partial<FormEntity>[],
    raw: unknown[],
  ): {
    leftJoinAndSelect: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    clone: jest.Mock;
    getRawAndEntities: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    getMany: jest.Mock;
  } {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnValue({ getCount: jest.fn().mockResolvedValue(forms.length) }),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: forms, raw }),
      // Segunda consulta do FormListQuery: os atribuidos da pagina.
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(forms),
    };
    return qb;
  }

  it('maps aggregate fields returned by FormListQuery subqueries', async () => {
    const form1: Partial<FormEntity> = {
      id: 'form-1',
      name: 'F1',
      description: null,
      status: FormStatus.DRAFT,
      category: null,
      area: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      googleSheetsEnabled: false,
      createdByUser: {
        id: ACTOR_ID,
        fullName: 'A',
        email: 'a@b.com',
        role: 'admin',
      } as UserEntity,
    };

    const rawRow = { submissionCount: '3', latestVersionNumber: '2' };

    const { service, usersRepo, formsRepo } = makeService();

    usersRepo.findOne.mockResolvedValue(ADMIN_ACTOR);
    const qb = makeQbReturning([form1], [rawRow]);
    formsRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll({ page: 1, limit: 10 } as never, ACTOR_ID);

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'form-1',
        submissionCount: 3,
        latestVersionNumber: 2,
      }),
    );
  });

  it('returns an empty page when the query finds no forms', async () => {
    const { service, usersRepo, formsRepo } = makeService();

    usersRepo.findOne.mockResolvedValue(ADMIN_ACTOR);
    const qb = makeQbReturning([], []);
    formsRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll({ page: 1, limit: 10 } as never, ACTOR_ID);

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── Atribuição a várias pessoas ─────────────────────────────────────────────

describe('FormsService — atribuição a várias pessoas', () => {
  function makeAssigneeService(activeUsers: Array<{ id: string }>) {
    const usersRepo = {
      findOne: jest.fn().mockResolvedValue(ADMIN_ACTOR),
      find: jest.fn().mockResolvedValue(activeUsers),
    };
    const saved: Array<Partial<FormEntity>> = [];
    const manager = {
      create: jest.fn().mockImplementation((_entity: unknown, data: Partial<FormEntity>) => data),
      save: jest.fn().mockImplementation((data: Partial<FormEntity>) => {
        saved.push(data);
        return Promise.resolve({ ...data, id: FORM_ID });
      }),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue({
        create: jest.fn().mockImplementation((data: unknown) => data),
        save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
        find: jest.fn().mockResolvedValue([]),
      }),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    const formsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: FORM_ID,
        name: 'F',
        status: FormStatus.DRAFT,
        createdBy: ACTOR_ID,
        createdByUser: { id: ACTOR_ID } as UserEntity,
        assignees: [],
        versions: [],
      }),
      createQueryBuilder: jest.fn(),
    };
    const processAccess = fakeProcessAccess({ formsRepository: formsRepo, everyoneFullAccess: true });
    const eventEmitter = { emit: jest.fn() };
    const google = {
      findConnectedGoogleUserId: jest.fn().mockResolvedValue(null),
      autoCreateSpreadsheetIfNeeded: jest.fn().mockResolvedValue(undefined),
    };

    const service = new FormsService(
      dataSource,
      eventEmitter as unknown as EventEmitter2,
      google as unknown as GoogleWorkspaceService,
      new FormVersionWriter(),
      new FormListQuery(formsRepo as never, processAccess),
      new PublicFormsService(formsRepo as never, itemOrderFieldsStub as never, itemOrderFieldsStub as never),
      processAccess,
      formsRepo as never,
      usersRepo as never,
      erpTableFieldsStub as never,
    itemListsStub as never,
    itemOrderFieldsStub as never,
    );

    return { service, usersRepo, saved, eventEmitter, processAccess };
  }

  it('quem cria vira membro completo; os atribuídos entram com o modelo Operador', async () => {
    const { service, processAccess } = makeAssigneeService([{ id: 'user-1' }, { id: ACTOR_ID }]);

    await service.create({ ...BASE_DTO, assignedUserIds: ['user-1', ACTOR_ID] }, ACTOR_ID);

    expect(processAccess.grantCreator).toHaveBeenCalledWith(expect.anything(), expect.any(String), ACTOR_ID);
    expect(processAccess.addMemberIfMissing).toHaveBeenCalledTimes(1);
    expect(processAccess.addMemberIfMissing).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'user-1',
      expect.objectContaining({ 'solicitations.view': 'all', 'solicitations.act': 'all' }),
      ACTOR_ID,
    );
  });

  it('dá acesso a todas as pessoas informadas na criação (vínculo, não mais atribuição)', async () => {
    const { service, eventEmitter, processAccess } = makeAssigneeService([
      { id: 'user-1' },
      { id: 'user-2' },
    ]);

    await service.create({ ...BASE_DTO, assignedUserIds: ['user-1', 'user-2'] }, ACTOR_ID);

    const added = (processAccess.addMemberIfMissing as jest.Mock).mock.calls.map((call) => call[2]);
    expect(added).toEqual(['user-1', 'user-2']);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'forms.created',
      expect.objectContaining({ assignedUserIds: ['user-1', 'user-2'] }),
    );
  });

  it('colapsa ids repetidos antes de consultar', async () => {
    const { service, usersRepo } = makeAssigneeService([{ id: 'user-1' }]);

    await service.create({ ...BASE_DTO, assignedUserIds: ['user-1', 'user-1'] }, ACTOR_ID);

    expect(usersRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: expect.anything(), isActive: true } }),
    );
    const call = usersRepo.find.mock.calls[0][0] as { where: { id: { _value: string[] } } };
    expect(call.where.id._value).toEqual(['user-1']);
  });

  it('recusa a operação inteira quando algum id não existe ou está inativo', async () => {
    // Só 'user-1' volta ativo; 'fantasma' não existe.
    const { service } = makeAssigneeService([{ id: 'user-1' }]);

    await expect(
      service.create({ ...BASE_DTO, assignedUserIds: ['user-1', 'fantasma'] }, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista vazia: só quem cria fica com acesso', async () => {
    const { service, processAccess } = makeAssigneeService([]);

    await service.create({ ...BASE_DTO, assignedUserIds: [] }, ACTOR_ID);

    expect(processAccess.addMemberIfMissing).not.toHaveBeenCalled();
    expect(processAccess.grantCreator).toHaveBeenCalledWith(expect.anything(), expect.any(String), ACTOR_ID);
  });
});

// ─── Aparência do processo (cor e ícone dos cards) ───────────────────────────

describe('FormsService.updateAppearance', () => {
  function rigWith(appearance: FormEntity['appearance']) {
    const rig = makeService();
    const formsRepo = rig.formsRepo as typeof rig.formsRepo & { update: jest.Mock };
    formsRepo.findOne.mockResolvedValue({
      id: FORM_ID,
      status: FormStatus.DRAFT,
      createdBy: ACTOR_ID,
      assignees: [],
      appearance,
    });
    formsRepo.update = jest.fn().mockResolvedValue(undefined);
    return { service: rig.service, formsRepo };
  }

  it('grava cor e ícone sem criar versão nova', async () => {
    const { service, formsRepo } = rigWith(null);

    const result = await service.updateAppearance(FORM_ID, { color: '#16A34A', icon: 'truck' }, ACTOR_ID);

    expect(result).toEqual({ color: '#16A34A', icon: 'truck' });
    expect(formsRepo.update).toHaveBeenCalledWith(FORM_ID, {
      appearance: { color: '#16A34A', icon: 'truck' },
    });
  });

  it('campo ausente mantém o valor salvo; null volta ao padrão', async () => {
    const { service } = rigWith({ color: '#DC2626', icon: 'truck' });

    await expect(service.updateAppearance(FORM_ID, { icon: 'package' }, ACTOR_ID)).resolves.toEqual({
      color: '#DC2626',
      icon: 'package',
    });
    await expect(service.updateAppearance(FORM_ID, { color: null }, ACTOR_ID)).resolves.toEqual({
      color: null,
      icon: 'truck',
    });
  });

  it('processo inexistente dá 404', async () => {
    const { service, formsRepo } = rigWith(null);
    formsRepo.findOne.mockResolvedValue(null);

    await expect(service.updateAppearance(FORM_ID, { color: '#16A34A' }, ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ─── Opções de Categoria / Área do Criador ───────────────────────────────────

describe('FormsService.findClassificationOptions', () => {
  it('devolve categorias em uso e áreas ativas, sem vazios nem repetidos, em ordem alfabética', async () => {
    const getRawMany = jest
      .fn()
      .mockResolvedValue([
        { category: 'Qualidade' },
        { category: 'compras' },
        { category: 'QUALIDADE' },
        { category: 'Ágil' },
      ]);
    const formsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany,
      }),
    };
    const areasFind = jest
      .fn()
      .mockResolvedValue([{ name: 'Laboratório' }, { name: ' Expedição ' }, { name: '' }]);
    const dataSource = { getRepository: jest.fn().mockReturnValue({ find: areasFind }) };

    const service = new FormsService(
      dataSource as never,
      { emit: jest.fn() } as never,
      {} as never,
      new FormVersionWriter(),
      {} as never,
      {} as never,
      {} as never,
      formsRepo as never,
      {} as never,
      erpTableFieldsStub as never,
      itemListsStub as never,
      itemOrderFieldsStub as never,
    );

    await expect(service.findClassificationOptions()).resolves.toEqual({
      categories: ['Ágil', 'compras', 'Qualidade'],
      areas: ['Expedição', 'Laboratório'],
    });
    expect(areasFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });
});
