import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AreaEntity } from '../../database/entities/area.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(AreaEntity)
    private readonly areasRepository: Repository<AreaEntity>,
  ) {}

  findAll(includeInactive = false): Promise<AreaEntity[]> {
    const where = includeInactive ? {} : { isActive: true };
    return this.areasRepository.find({
      where,
      relations: { parent: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<AreaEntity> {
    const area = await this.areasRepository.findOne({
      where: { id },
      relations: { parent: true, children: true },
    });
    if (!area) throw new NotFoundException('Área não encontrada.');
    return area;
  }

  async create(dto: CreateAreaDto): Promise<AreaEntity> {
    if (dto.parentId) {
      const parent = await this.areasRepository.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Área pai não encontrada.');
    }

    const area = this.areasRepository.create({
      name: dto.name,
      code: dto.code ?? null,
      description: dto.description ?? null,
      parentId: dto.parentId ?? null,
      isActive: true,
    });

    return this.areasRepository.save(area);
  }

  async update(id: string, dto: UpdateAreaDto): Promise<AreaEntity> {
    const area = await this.findOne(id);

    if (dto.parentId !== undefined) {
      if (dto.parentId && dto.parentId === id) {
        throw new NotFoundException('Área não pode ser pai de si mesma.');
      }
      if (dto.parentId) {
        const parent = await this.areasRepository.findOne({ where: { id: dto.parentId } });
        if (!parent) throw new NotFoundException('Área pai não encontrada.');
      }
      area.parentId = dto.parentId ?? null;
    }

    if (dto.name !== undefined) area.name = dto.name;
    if (dto.code !== undefined) area.code = dto.code ?? null;
    if (dto.description !== undefined) area.description = dto.description ?? null;
    if (dto.isActive !== undefined) area.isActive = dto.isActive;

    return this.areasRepository.save(area);
  }

  async deactivate(id: string): Promise<AreaEntity> {
    const area = await this.findOne(id);
    area.isActive = false;
    return this.areasRepository.save(area);
  }
}
