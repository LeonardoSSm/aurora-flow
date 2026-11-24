import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormConnectorEntity, FormVersionEntity, SubmissionEntity } from '../../database/entities';
import { type ConnectorPayload, ConnectorType, type IConnector } from './connector.interface';
import { RestApiConnector } from './rest-api.connector';
import { WebhookConnector } from './webhook.connector';
import type { CreateConnectorDto } from './dto/create-connector.dto';
import type { UpdateConnectorDto } from './dto/update-connector.dto';

/*
 * Auditoria tecnica do modulo connectors (2026-05-15):
 * - Entidade existente: FormConnectorEntity em form_connectors, vinculada a forms, com type,
 *   name, isActive, config, lastSyncAt e lastSyncStatus.
 * - Service: findByForm, create, update, delete, testConnector e executeForSubmission.
 * - Controller: GET/POST forms/:formId/connectors, PATCH/DELETE connectors/:id e
 *   POST connectors/:id/test, protegidos por JWT + roles ADMIN/MANAGER.
 * - Funcional: CRUD, teste e envio direto em responses.submitted para WEBHOOK e REST_API.
 * - Stubs/parcial: ConnectorType declara GOOGLE_SHEETS e EMAIL, mas o registry atual so resolve
 *   WEBHOOK e REST_API; nao ha historico persistente por tentativa nem endpoint de webhook inbound.
 */
@Injectable()
export class ConnectorsService {
  private readonly registry = new Map<ConnectorType, IConnector>([
    [ConnectorType.WEBHOOK, new WebhookConnector()],
    [ConnectorType.REST_API, new RestApiConnector()],
  ]);

  constructor(
    @InjectRepository(FormConnectorEntity)
    private readonly connectorsRepo: Repository<FormConnectorEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepo: Repository<SubmissionEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly formVersionsRepo: Repository<FormVersionEntity>,
  ) {}

  findByForm(formId: string): Promise<FormConnectorEntity[]> {
    return this.connectorsRepo.find({ where: { formId }, order: { createdAt: 'ASC' } });
  }

  async create(formId: string, dto: CreateConnectorDto): Promise<FormConnectorEntity> {
    const connector = this.connectorsRepo.create({
      formId,
      type: dto.type,
      name: dto.name,
      isActive: dto.isActive ?? true,
      config: dto.config,
    });
    return this.connectorsRepo.save(connector);
  }

  async update(id: string, dto: UpdateConnectorDto): Promise<FormConnectorEntity> {
    const connector = await this.findOrFail(id);
    Object.assign(connector, dto);
    return this.connectorsRepo.save(connector);
  }

  async delete(id: string): Promise<void> {
    const connector = await this.findOrFail(id);
    await this.connectorsRepo.remove(connector);
  }

  async testConnector(id: string): Promise<{ success: boolean; message: string }> {
    const connector = await this.findOrFail(id);
    const impl = this.resolveConnector(connector.type);
    return impl.test(connector.config);
  }

  async executeForSubmission(submissionId: string, formId: string): Promise<void> {
    const connectors = await this.connectorsRepo.find({ where: { formId, isActive: true } });
    if (connectors.length === 0) return;

    const [submission, latestVersion] = await Promise.all([
      this.submissionsRepo.findOne({
        where: { id: submissionId },
        relations: ['form', 'items'],
      }),
      this.formVersionsRepo.findOne({
        where: { formId },
        order: { versionNumber: 'DESC' },
        relations: ['sections', 'sections.fields'],
      }),
    ]);

    if (!submission) return;

    const labelMap = new Map<string, string>();
    for (const section of latestVersion?.sections ?? []) {
      for (const field of section.fields ?? []) {
        labelMap.set(field.code, field.label);
      }
    }

    const payload: ConnectorPayload = {
      form: { id: submission.formId, name: submission.form?.name ?? '' },
      submission: { id: submission.id, submittedAt: submission.submittedAt ?? new Date() },
      responder: { name: submission.responderName, email: submission.responderEmail },
      fields: (submission.items ?? []).map((item) => ({
        code: item.fieldCode,
        label: labelMap.get(item.fieldCode) ?? item.fieldCode,
        value: item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null,
      })),
    };

    for (const record of connectors) {
      const impl = this.resolveConnector(record.type);
      try {
        await impl.send(payload, record.config);
        await this.connectorsRepo.update(record.id, {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.connectorsRepo.update(record.id, {
          lastSyncAt: new Date(),
          lastSyncStatus: `error: ${msg.slice(0, 200)}`,
        });
      }
    }
  }

  /** O formulário do conector — para a rota conferir o processo antes de mexer nele. */
  async findFormIdOrFail(id: string): Promise<string> {
    return (await this.findOrFail(id)).formId;
  }

  private async findOrFail(id: string): Promise<FormConnectorEntity> {
    const connector = await this.connectorsRepo.findOne({ where: { id } });
    if (!connector) throw new NotFoundException('Conector não encontrado.');
    return connector;
  }

  private resolveConnector(type: ConnectorType): IConnector {
    const impl = this.registry.get(type);
    if (!impl) throw new NotFoundException(`Tipo de conector '${type}' não suportado.`);
    return impl;
  }
}
