import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppSettingEntity } from '../../database/entities';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettingEntity)
    private readonly repo: Repository<AppSettingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(includePrivate: boolean): Promise<AppSettingEntity[]> {
    return this.repo.find({
      where: includePrivate ? undefined : { isPublic: true },
      order: { key: 'ASC' },
    });
  }

  async findOne(key: string): Promise<AppSettingEntity> {
    const setting = await this.repo.findOne({ where: { key } });
    if (!setting) {
      throw new NotFoundException(`Configuração '${key}' não encontrada.`);
    }
    return setting;
  }

  async update(key: string, value: string): Promise<AppSettingEntity> {
    const setting = await this.findOne(key);
    this.assertValidValue(setting.valueType, value);
    setting.value = value;
    return this.repo.save(setting);
  }

  async bulkUpdate(updates: Array<{ key: string; value: string }>): Promise<AppSettingEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const results: AppSettingEntity[] = [];
      for (const { key, value } of updates) {
        const setting = await manager.findOne(AppSettingEntity, { where: { key } });
        if (!setting) {
          throw new NotFoundException(`Configuração '${key}' não encontrada.`);
        }
        this.assertValidValue(setting.valueType, value);
        setting.value = value;
        results.push(await manager.save(AppSettingEntity, setting));
      }
      return results;
    });
  }

  async getValue<T>(key: string, defaultValue: T): Promise<T> {
    const setting = await this.repo.findOne({ where: { key } });
    if (setting?.value == null) return defaultValue;

    switch (setting.valueType) {
      case 'number':
        return Number(setting.value) as unknown as T;
      case 'boolean':
        return (setting.value === 'true') as unknown as T;
      case 'json':
        try {
          return JSON.parse(setting.value) as T;
        } catch {
          return defaultValue;
        }
      default:
        return setting.value as unknown as T;
    }
  }

  private assertValidValue(valueType: string, value: string): void {
    switch (valueType) {
      case 'number':
        if (value !== '' && isNaN(Number(value))) {
          throw new BadRequestException(`Valor inválido: esperado um número, recebido '${value}'.`);
        }
        break;
      case 'boolean':
        if (value !== 'true' && value !== 'false') {
          throw new BadRequestException(
            `Valor inválido: esperado 'true' ou 'false', recebido '${value}'.`,
          );
        }
        break;
      case 'json':
        try {
          JSON.parse(value);
        } catch {
          throw new BadRequestException(`Valor inválido: JSON malformado.`);
        }
        break;
    }
  }
}
