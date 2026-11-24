import { NotFoundException } from '@nestjs/common';
import type { AreaEntity } from '../../database/entities/area.entity';
import { AreasService } from './areas.service';

function makeArea(overrides: Partial<AreaEntity> = {}): AreaEntity {
  return {
    id: 'area-id',
    name: 'Recursos Humanos',
    code: 'RH',
    description: null,
    parentId: null,
    parent: null,
    children: [],
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as AreaEntity;
}

function makeRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
}

function makeService(repo = makeRepo()) {
  const service = new AreasService(repo as never);
  return { service, repo };
}

describe('AreasService', () => {
  describe('findAll', () => {
    it('returns active areas only by default', async () => {
      const { service, repo } = makeService();
      const areas = [makeArea()];
      repo.find.mockResolvedValue(areas);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(result).toBe(areas);
    });

    it('returns all areas when includeInactive is true', async () => {
      const { service, repo } = makeService();
      repo.find.mockResolvedValue([]);

      await service.findAll(true);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the area when found', async () => {
      const { service, repo } = makeService();
      const area = makeArea();
      repo.findOne.mockResolvedValue(area);

      const result = await service.findOne('area-id');

      expect(result).toBe(area);
    });

    it('throws NotFoundException when area does not exist', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a root area without parentId', async () => {
      const { service, repo } = makeService();
      const area = makeArea();
      repo.create.mockReturnValue(area);
      repo.save.mockResolvedValue(area);

      const result = await service.create({ name: 'Recursos Humanos', code: 'RH' });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Recursos Humanos', code: 'RH', parentId: null }),
      );
      expect(result).toBe(area);
    });

    it('creates a child area when parentId is valid', async () => {
      const { service, repo } = makeService();
      const parent = makeArea({ id: 'parent-id', name: 'Departamento' });
      const child = makeArea({ id: 'child-id', parentId: 'parent-id' });

      repo.findOne
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(null);
      repo.create.mockReturnValue(child);
      repo.save.mockResolvedValue(child);

      const result = await service.create({ name: 'Subárea', parentId: 'parent-id' });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'parent-id' } });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'parent-id' }),
      );
      expect(result).toBe(child);
    });

    it('throws NotFoundException when parentId does not exist', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Subárea', parentId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates area name', async () => {
      const { service, repo } = makeService();
      const area = makeArea();
      const updated = makeArea({ name: 'TI' });

      repo.findOne.mockResolvedValue(area);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('area-id', { name: 'TI' });

      expect(area.name).toBe('TI');
      expect(result).toBe(updated);
    });

    it('deactivates area via update', async () => {
      const { service, repo } = makeService();
      const area = makeArea();
      repo.findOne.mockResolvedValue(area);
      repo.save.mockResolvedValue({ ...area, isActive: false });

      await service.update('area-id', { isActive: false });

      expect(area.isActive).toBe(false);
    });

    it('throws NotFoundException when area does not exist', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      const { service, repo } = makeService();
      const area = makeArea({ isActive: true });
      repo.findOne.mockResolvedValue(area);
      repo.save.mockResolvedValue({ ...area, isActive: false });

      await service.deactivate('area-id');

      expect(area.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('throws NotFoundException when area does not exist', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.deactivate('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
