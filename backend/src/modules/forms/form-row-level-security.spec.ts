import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { FormEntity, UserEntity } from '../../database/entities';
import type { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import { FormVersionWriter } from './form-version.writer';
import { FormListQuery } from './form-list.query';
import { PublicFormsService } from './public-forms.service';
import { FormsService } from './forms.service';
import { type FakeMemberships, fakeProcessAccess } from '../access/testing/fake-process-access';

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

const EDITOR_A_ID = 'editor-a-id';
const EDITOR_B_ID = 'editor-b-id';
const MANAGER_ID = 'manager-id';
const ADMIN_ID = 'admin-id';
const FORM_ID = 'form-id';

function makeUser(id: string, role: string): Partial<UserEntity> {
  return { id, role, fullName: role, email: `${role}@test.com`, isActive: true };
}

const EDITOR_A = makeUser(EDITOR_A_ID, 'editor');
const _EDITOR_B = makeUser(EDITOR_B_ID, 'editor');
const MANAGER = makeUser(MANAGER_ID, 'manager');
const ADMIN = makeUser(ADMIN_ID, 'admin');

function makeForm(ownerId: string): Partial<FormEntity> {
  return {
    id: FORM_ID,
    name: 'Test Form',
    status: FormStatus.DRAFT,
    createdBy: ownerId,
    createdByUser: makeUser(ownerId, 'editor') as UserEntity,
    versions: [],
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

/**
 * `memberships`: os vínculos da pessoa (processo → permissões). `fullAccessRoles`: perfis com acesso
 * total aos processos.
 */
function makeService(
  actor: Partial<UserEntity>,
  formOwnerId: string,
  memberships: FakeMemberships = {},
  fullAccessRoles: string[] = [],
) {
  const form = makeForm(formOwnerId);

  const usersRepo = {
    findOne: jest.fn().mockResolvedValue(actor),
  };

  const formsRepo = {
    findOne: jest.fn().mockResolvedValue(form),
    save: jest.fn().mockResolvedValue(form),
    createQueryBuilder: jest.fn(),
  };

  const eventEmitter = { emit: jest.fn() };

  const googleWorkspaceService: Partial<GoogleWorkspaceService> = {
    findConnectedGoogleUserId: jest.fn().mockResolvedValue(null),
    autoCreateSpreadsheetIfNeeded: jest.fn().mockResolvedValue(undefined),
  };

  const transactionFn = jest
    .fn()
    .mockImplementation((cb: (m: Record<string, jest.Mock>) => Promise<unknown>) => {
      const manager: Record<string, jest.Mock> = {
        findOne: jest.fn().mockImplementation((Entity: unknown) => {
          if (Entity === FormEntity) return Promise.resolve(form);
          if (Entity === UserEntity) return Promise.resolve(actor);
          return Promise.resolve(null);
        }),
        save: jest.fn().mockResolvedValue(form),
        create: jest
          .fn()
          .mockImplementation((_: unknown, data: Record<string, unknown>) => ({ ...data })),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(form),
          }),
        }),
      };
      return cb(manager);
    });

  const dataSource = { transaction: transactionFn } as unknown as DataSource;

  const processAccess = fakeProcessAccess({
    formsRepository: formsRepo,
    members: { [actor.id as string]: memberships },
    fullAccessRoles,
  });
  const versionWriter = new FormVersionWriter();
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

  return { service, formsRepo, usersRepo };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
// O que a pessoa pode num processo vem do vínculo com ele; o perfil só dá acesso total (admin).

const EDITAR = { 'forms.edit': 'all' } as const;
const PUBLICAR = { 'forms.publish': 'all' } as const;

describe('Vínculo — abrir o processo', () => {
  it('sem vínculo: 403, mesmo sendo gestor (área não dá mais acesso)', async () => {
    const { service } = makeService(MANAGER, EDITOR_A_ID);
    await expect(service.findOne(FORM_ID, MANAGER_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('com vínculo, ainda que sem nenhuma caixinha marcada, abre', async () => {
    const { service } = makeService(EDITOR_A, EDITOR_B_ID, { [FORM_ID]: {} });
    await expect(service.findOne(FORM_ID, EDITOR_A_ID)).resolves.toMatchObject({ id: FORM_ID });
  });

  it('acesso total pelo perfil abre qualquer processo', async () => {
    const { service } = makeService(ADMIN, EDITOR_B_ID, {}, ['admin']);
    await expect(service.findOne(FORM_ID, ADMIN_ID)).resolves.toMatchObject({ id: FORM_ID });
  });

  it('vínculo com OUTRO processo não vale neste', async () => {
    const { service } = makeService(EDITOR_A, EDITOR_B_ID, { 'outro-form': EDITAR });
    await expect(service.findOne(FORM_ID, EDITOR_A_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('processo inexistente: 404', async () => {
    const { service, formsRepo } = makeService(ADMIN, EDITOR_A_ID, {}, ['admin']);
    formsRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('ghost', ADMIN_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Vínculo — editar o processo', () => {
  const BASE_DTO = {
    name: 'Updated',
    sections: [
      {
        title: 'S',
        fields: [{ code: 'campo', label: 'Campo', fieldType: FormFieldType.SHORT_TEXT, required: false }],
      },
    ],
  };

  it('vínculo sem "editar o formulário": 403', async () => {
    const { service } = makeService(EDITOR_A, EDITOR_B_ID, { [FORM_ID]: PUBLICAR });
    await expect(service.update(FORM_ID, BASE_DTO as never, EDITOR_A_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('com "editar o formulário" no processo, edita', async () => {
    const { service } = makeService(EDITOR_A, EDITOR_B_ID, { [FORM_ID]: EDITAR });
    await expect(service.update(FORM_ID, BASE_DTO as never, EDITOR_A_ID)).resolves.toBeDefined();
  });
});

describe('Vínculo — publicar, arquivar e excluir', () => {
  it('sem "publicar, pausar e arquivar": não muda o status nem exclui', async () => {
    const { service } = makeService(EDITOR_A, EDITOR_B_ID, { [FORM_ID]: EDITAR });
    await expect(service.updateStatus(FORM_ID, { status: FormStatus.ARCHIVED }, EDITOR_A_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.softDelete(FORM_ID, EDITOR_A_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('com a permissão no processo, muda o status e exclui', async () => {
    const { service } = makeService(EDITOR_A, EDITOR_B_ID, { [FORM_ID]: PUBLICAR });
    await expect(service.updateStatus(FORM_ID, { status: FormStatus.ARCHIVED }, EDITOR_A_ID)).resolves.toBeDefined();
    await expect(service.softDelete(FORM_ID, EDITOR_A_ID)).resolves.toBeUndefined();
  });
});
