import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { FormEntity, UserEntity } from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';
import type { QueryFormsDto } from './dto/query-forms.dto';
import { FormListItemDto } from './dto/form-list-item.dto';

@Injectable()
export class FormListQuery {
  constructor(
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  async execute(
    query: QueryFormsDto,
    actor: UserEntity,
  ): Promise<PaginatedResponseDto<FormListItemDto>> {
    const { page, limit, search, status, excludeStatus, category, area, createdBy } = query;

    const qb = this.formsRepository
      .createQueryBuilder('form')
      .leftJoinAndSelect('form.createdByUser', 'createdByUser')
      .select([
        'form.id',
        'form.name',
        'form.description',
        'form.status',
        'form.category',
        'form.area',
        'form.createdAt',
        'form.updatedAt',
        'form.googleSheetsEnabled',
        'form.appearance',
        'createdByUser.id',
        'createdByUser.fullName',
        'createdByUser.email',
        'createdByUser.role',
      ])
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(submission.id)', 'submissionCount')
            .from('submissions', 'submission')
            .where('submission.form_id = form.id'),
        'submissionCount',
      )
      .addSelect(
        (sub) =>
          sub
            .select('COALESCE(MAX(version.version_number), 0)', 'latestVersionNumber')
            .from('form_versions', 'version')
            .where('version.form_id = form.id'),
        'latestVersionNumber',
      );

    // Só os processos com que a pessoa tem vínculo (ou todos, com acesso total pelo perfil).
    const grants = await this.processAccess.grantsOf({ sub: actor.id, role: actor.role });
    this.processAccess.applyFormScope(qb, grants, 'form.id');
    if (search) qb.andWhere('form.name ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('form.status = :status', { status });
    if (excludeStatus) qb.andWhere('form.status != :excludeStatus', { excludeStatus });
    if (category) qb.andWhere('form.category ILIKE :category', { category: `%${category}%` });
    if (area) qb.andWhere('form.area ILIKE :area', { area: `%${area}%` });
    if (createdBy) qb.andWhere('form.created_by = :createdBy', { createdBy });

    const total = await qb.clone().getCount();
    qb.orderBy('form.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const { entities, raw } = await qb.getRawAndEntities();

    const data = entities.map((form, i) => {
      const row = raw[i] as Record<string, string | number | null>;
      const item = new FormListItemDto();
      Object.assign(item, {
        id: form.id,
        name: form.name,
        description: form.description,
        status: form.status,
        category: form.category,
        area: form.area,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
        googleSheetsEnabled: form.googleSheetsEnabled,
        appearance: form.appearance ?? null,
        submissionCount: Number(row.submissionCount ?? 0),
        latestVersionNumber: Number(row.latestVersionNumber ?? 0),
        // Legado (app do tablet instalado): ver FormListItemDto.assignees.
        assignees: [],
      });
      item.createdByUser = {
        id: form.createdByUser.id,
        fullName: form.createdByUser.fullName,
        email: form.createdByUser.email,
        role: form.createdByUser.role,
      };
      return item;
    });

    return PaginatedResponseDto.of(data, total, page, limit);
  }
}
