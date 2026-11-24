import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { RecordReportTemplateEntity } from '../../database/entities';
import { type AccessActor, ProcessAccessService } from '../access/process-access.service';
import { normalizeReportConfig, type RecordReportConfig } from './record-report-config';
import type { SaveReportTemplateDto, UpdateReportTemplateDto } from './dto/query-records.dto';

export interface ReportTemplateView {
  id: string;
  name: string;
  config: RecordReportConfig;
  createdBy: string | null;
  createdByName: string | null;
  updatedAt: string;
  /** Quem pode trocar ou apagar: quem criou ou quem edita o processo. */
  canManage: boolean;
}

/**
 * Modelos de relatório da tela Registros. Ver: quem enxerga o processo. Criar: quem exporta nele.
 * Alterar/apagar: quem criou (se ainda exporta) ou quem edita o processo.
 */
@Injectable()
export class RecordReportTemplatesService {
  constructor(
    @InjectRepository(RecordReportTemplateEntity)
    private readonly templates: Repository<RecordReportTemplateEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  async list(formId: string, actor: AccessActor): Promise<ReportTemplateView[]> {
    await this.processAccess.assertProcessVisible(formId, actor);
    const canEditProcess = await this.processAccess.hasInProcess(actor, formId, 'forms.edit');
    const rows = await this.templates.find({
      where: { formId },
      relations: { createdByUser: true },
      order: { name: 'ASC' },
    });
    return rows.map((row) => this.toView(row, actor, canEditProcess));
  }

  async create(formId: string, dto: SaveReportTemplateDto, actor: AccessActor): Promise<ReportTemplateView> {
    await this.processAccess.assertFormAccess(formId, actor, 'responses.export');
    const name = this.cleanName(dto.name);
    const config = normalizeReportConfig(dto.config);
    const saved = await this.persist(() =>
      this.templates.save(
        this.templates.create({ formId, name, config: config as unknown as Record<string, unknown>, createdBy: actor.sub }),
      ),
    );
    const canEditProcess = await this.processAccess.hasInProcess(actor, formId, 'forms.edit');
    return this.toView(await this.load(saved.id), actor, canEditProcess);
  }

  async update(id: string, dto: UpdateReportTemplateDto, actor: AccessActor): Promise<ReportTemplateView> {
    const template = await this.load(id);
    const canEditProcess = await this.assertCanManage(template, actor);
    if (dto.name !== undefined) template.name = this.cleanName(dto.name);
    if (dto.config !== undefined) template.config = normalizeReportConfig(dto.config) as unknown as Record<string, unknown>;
    await this.persist(() => this.templates.save(template));
    return this.toView(await this.load(id), actor, canEditProcess);
  }

  async remove(id: string, actor: AccessActor): Promise<void> {
    const template = await this.load(id);
    await this.assertCanManage(template, actor);
    await this.templates.delete({ id });
  }

  private async assertCanManage(template: RecordReportTemplateEntity, actor: AccessActor): Promise<boolean> {
    await this.processAccess.assertProcessVisible(template.formId, actor);
    const canEditProcess = await this.processAccess.hasInProcess(actor, template.formId, 'forms.edit');
    if (canEditProcess) return true;
    const canExport = await this.processAccess.hasInProcess(actor, template.formId, 'responses.export');
    if (canExport && template.createdBy === actor.sub) return false;
    throw new ForbiddenException('Só quem criou o modelo ou quem edita o processo pode alterá-lo.');
  }

  private async load(id: string): Promise<RecordReportTemplateEntity> {
    const template = await this.templates.findOne({ where: { id }, relations: { createdByUser: true } });
    if (!template) throw new NotFoundException('Modelo de relatório não encontrado.');
    return template;
  }

  private cleanName(name: string): string {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new ConflictException('Dê um nome ao modelo.');
    return clean.slice(0, 120);
  }

  private async persist<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException('Já existe um modelo com esse nome neste processo.');
      }
      throw error;
    }
  }

  private toView(row: RecordReportTemplateEntity, actor: AccessActor, canEditProcess: boolean): ReportTemplateView {
    return {
      id: row.id,
      name: row.name,
      // Modelo gravado antes de uma regra nova continua abrindo: normaliza na leitura também.
      config: safeConfig(row.config),
      createdBy: row.createdBy,
      createdByName: row.createdByUser?.fullName ?? null,
      updatedAt: row.updatedAt.toISOString(),
      canManage: canEditProcess || row.createdBy === actor.sub,
    };
  }
}

function safeConfig(raw: unknown): RecordReportConfig {
  try {
    return normalizeReportConfig(raw);
  } catch {
    return normalizeReportConfig({ columns: [{ key: 'sys:title' }] });
  }
}
