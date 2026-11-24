import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AppSettingEntity } from '../../database/entities';
import { SettingsService } from './settings.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSetting(overrides: Partial<AppSettingEntity> = {}): AppSettingEntity {
  return {
    key: 'org.name',
    value: 'FormHub',
    description: 'Nome da organização',
    isPublic: true,
    valueType: 'string',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AppSettingEntity;
}

function makeRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
}

function makeDataSource() {
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  return {
    transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    manager,
  };
}

function makeService() {
  const repo = makeRepo();
  const dataSource = makeDataSource();
  const service = new SettingsService(repo as never, dataSource as never);
  return { service, repo, dataSource };
}

// ─── findAll ─────────────────────────────────────────────────────────────────

describe('SettingsService.findAll', () => {
  it('passa where undefined quando includePrivate=true', async () => {
    const { service, repo } = makeService();
    repo.find.mockResolvedValue([]);

    await service.findAll(true);

    expect(repo.find).toHaveBeenCalledWith({ where: undefined, order: { key: 'ASC' } });
  });

  it('filtra isPublic=true quando includePrivate=false', async () => {
    const { service, repo } = makeService();
    repo.find.mockResolvedValue([]);

    await service.findAll(false);

    expect(repo.find).toHaveBeenCalledWith({ where: { isPublic: true }, order: { key: 'ASC' } });
  });
});

// ─── findOne ─────────────────────────────────────────────────────────────────

describe('SettingsService.findOne', () => {
  it('retorna a entidade quando a chave existe', async () => {
    const { service, repo } = makeService();
    const setting = makeSetting();
    repo.findOne.mockResolvedValue(setting);

    const result = await service.findOne('org.name');
    expect(result).toBe(setting);
  });

  it('lança NotFoundException quando a chave não existe', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('SettingsService.update', () => {
  it('persiste o novo valor em configuração string', async () => {
    const { service, repo } = makeService();
    const setting = makeSetting({ valueType: 'string' });
    repo.findOne.mockResolvedValue(setting);
    repo.save.mockResolvedValue({ ...setting, value: 'Novo Nome' });

    await service.update('org.name', 'Novo Nome');

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ value: 'Novo Nome' }));
  });

  it('lança BadRequestException ao passar string em campo number', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(
      makeSetting({ key: 'security.password_min_length', valueType: 'number' }),
    );

    await expect(service.update('security.password_min_length', 'abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('aceita string numérica em campo number', async () => {
    const { service, repo } = makeService();
    const setting = makeSetting({ key: 'security.password_min_length', valueType: 'number' });
    repo.findOne.mockResolvedValue(setting);
    repo.save.mockResolvedValue({ ...setting, value: '12' });

    await service.update('security.password_min_length', '12');
    expect(repo.save).toHaveBeenCalled();
  });

  it('lança BadRequestException para boolean inválido', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(makeSetting({ valueType: 'boolean' }));

    await expect(
      service.update('integrations.google_sheets_enabled', 'yes'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita "true" e "false" em campo boolean', async () => {
    const { service, repo } = makeService();
    const setting = makeSetting({ valueType: 'boolean' });
    repo.findOne.mockResolvedValue(setting);
    repo.save.mockResolvedValue({ ...setting, value: 'false' });

    await service.update('integrations.google_sheets_enabled', 'false');
    expect(repo.save).toHaveBeenCalled();
  });

  it('lança BadRequestException para JSON malformado', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(makeSetting({ valueType: 'json' }));

    await expect(service.update('key', '{broken')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── getValue ─────────────────────────────────────────────────────────────────

describe('SettingsService.getValue', () => {
  it('retorna defaultValue quando chave não existe', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(null);

    const result = await service.getValue('missing', 42);
    expect(result).toBe(42);
  });

  it('converte number corretamente', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(makeSetting({ value: '8', valueType: 'number' }));

    const result = await service.getValue('security.password_min_length', 0);
    expect(result).toBe(8);
  });

  it('converte boolean corretamente', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(makeSetting({ value: 'true', valueType: 'boolean' }));

    const result = await service.getValue('flag', false);
    expect(result).toBe(true);
  });

  it('retorna string diretamente', async () => {
    const { service, repo } = makeService();
    repo.findOne.mockResolvedValue(makeSetting({ value: 'FormHub Corp', valueType: 'string' }));

    const result = await service.getValue('org.name', '');
    expect(result).toBe('FormHub Corp');
  });
});

// ─── bulkUpdate ───────────────────────────────────────────────────────────────

describe('SettingsService.bulkUpdate', () => {
  it('atualiza várias configurações em transação', async () => {
    const { service, dataSource } = makeService();
    const manager = dataSource.manager as ReturnType<typeof makeDataSource>['manager'];
    manager.findOne
      .mockResolvedValueOnce(makeSetting({ key: 'org.name', valueType: 'string' }))
      .mockResolvedValueOnce(makeSetting({ key: 'org.support_email', valueType: 'string' }));
    manager.save
      .mockResolvedValueOnce(makeSetting({ key: 'org.name', value: 'Novo' }))
      .mockResolvedValueOnce(makeSetting({ key: 'org.support_email', value: 'a@b.com' }));

    const result = await service.bulkUpdate([
      { key: 'org.name', value: 'Novo' },
      { key: 'org.support_email', value: 'a@b.com' },
    ]);

    expect(result).toHaveLength(2);
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('lança NotFoundException se uma chave não existe', async () => {
    const { service, dataSource } = makeService();
    const manager = dataSource.manager as ReturnType<typeof makeDataSource>['manager'];
    manager.findOne.mockResolvedValueOnce(null);

    await expect(service.bulkUpdate([{ key: 'ghost', value: 'x' }])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
