import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { ReadStream } from 'fs';
import { extname } from 'path';
import { IsNull, Repository } from 'typeorm';
import { AttachmentUploadedEvent } from '../../common/events/attachment-events';
import {
  AttachmentEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
} from '../../database/entities';
import { LabelValidatorClientService } from '../integrations/label-validator/label-validator-client.service';
import { PermissionsService } from '../roles/permissions.service';
import { StorageService } from '../storage/storage.service';

export interface UploadAttachmentDto {
  solicitationId?: string;
  submissionId?: string;
  isPublic?: boolean;
  uploadedByUserId?: string | null;
  phaseId?: string | null;
  /** Nome escolhido por quem enviou; a extensão do arquivo é mantida. Vazio = nome original. */
  name?: string | null;
  description?: string | null;
}

export interface UpdateAttachmentDto {
  name?: string;
  description?: string | null;
}

export const ATTACHMENT_NAME_MAX = 200;
export const ATTACHMENT_DESCRIPTION_MAX = 1000;

/**
 * Nome de exibição/download do anexo a partir do que a pessoa digitou: sem caracteres que quebram
 * nome de arquivo (barras, dois-pontos, controle…), espaços colapsados, e com a extensão do arquivo
 * de verdade — renomear "foto.jpg" para "Etiqueta lote 12" grava "Etiqueta lote 12.jpg". Sem nada
 * aproveitável, fica o nome atual.
 */
export function resolveAttachmentName(currentName: string, requested: string | null | undefined): string {
  const ext = extname(currentName);
  const cleaned = (requested ?? '')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  if (!cleaned) return currentName;
  const hasExt = ext !== '' && cleaned.toLowerCase().endsWith(ext.toLowerCase()) && cleaned.length > ext.length;
  const base = hasExt ? cleaned.slice(0, cleaned.length - ext.length).trimEnd() : cleaned;
  const room = Math.max(1, ATTACHMENT_NAME_MAX - ext.length);
  return `${base.slice(0, room).trimEnd()}${ext}`;
}

/** Descrição livre: aparada e cortada no limite; vazia vira null. */
export function normalizeAttachmentDescription(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  return text ? text.slice(0, ATTACHMENT_DESCRIPTION_MAX) : null;
}

/**
 * O multer lê o nome do arquivo do multipart como Latin-1, mas o navegador o manda em UTF-8:
 * "endereço" chegava como "endereÃ§o". Reinterpreta os bytes como UTF-8; se o nome já tiver
 * caractere fora do Latin-1 ou não formar UTF-8 válido, fica como veio.
 */
export function decodeUploadedFileName(name: string): string {
  if (/[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/** Códigos convencionados para os campos de fase usados no cruzamento com a etiqueta. */
const LABEL_CROSS_CHECK_FIELD_CODES = ['lote', 'fabricacao', 'validade'] as const;

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentsRepository: Repository<AttachmentEntity>,
    @InjectRepository(KanbanPhaseFieldEntity)
    private readonly phaseFieldsRepository: Repository<KanbanPhaseFieldEntity>,
    @InjectRepository(KanbanPhaseFieldValueEntity)
    private readonly phaseFieldValuesRepository: Repository<KanbanPhaseFieldValueEntity>,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepository: Repository<SolicitationEntity>,
    private readonly storageService: StorageService,
    private readonly permissionsService: PermissionsService,
    private readonly labelValidatorClient: LabelValidatorClientService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async upload(
    file: Express.Multer.File,
    dto: UploadAttachmentDto,
  ): Promise<AttachmentEntity> {
    this.storageService.validateFile(file);

    const folder = dto.solicitationId
      ? `solicitations/${dto.solicitationId}`
      : dto.submissionId
        ? `submissions/${dto.submissionId}`
        : 'general';

    const { storedName, storagePath, storageType } = await this.storageService.save(file, folder);

    const attachment = this.attachmentsRepository.create({
      originalName: resolveAttachmentName(decodeUploadedFileName(file.originalname), dto.name),
      description: normalizeAttachmentDescription(dto.description),
      storedName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath,
      storageType,
      solicitationId: dto.solicitationId ?? null,
      submissionId: dto.submissionId ?? null,
      uploadedByUserId: dto.uploadedByUserId ?? null,
      isPublic: dto.isPublic ?? false,
      phaseId: dto.phaseId ?? null,
    });

    let saved = await this.attachmentsRepository.save(attachment);

    // O formulário público manda os arquivos depois do envio, e a solicitação nasce em paralelo
    // (listener de responses.submitted). Se ela já existe, o anexo entra nela agora; se ainda não,
    // linkSubmissionAttachments o vincula quando ela for criada.
    if (dto.submissionId && !saved.solicitationId) {
      const solicitation = await this.solicitationsRepository.findOne({
        where: { submissionId: dto.submissionId },
        select: { id: true },
      });
      if (solicitation) {
        saved.solicitationId = solicitation.id;
        saved = await this.attachmentsRepository.save(saved);
      }
    }

    if (dto.phaseId && file.mimetype.startsWith('image/')) {
      return this.tryValidateLabelForPhase(saved, file, dto.phaseId);
    }

    // Anexos de submissão não sabem nada sobre Flows/IA — só avisam que chegaram.
    // Qualquer automação (validar com IA, criar aprovação, etc.) é responsabilidade
    // de um Flow com o gatilho "Anexo enviado" (ver FlowsAttachmentListener).
    if (dto.submissionId) {
      this.eventEmitter.emit(
        'attachments.uploaded',
        new AttachmentUploadedEvent(dto.uploadedByUserId ?? null, saved.id, dto.submissionId),
      );
    }

    return saved;
  }

  /**
   * Chama o agente de IA "validador-de-etiquetas" quando a fase tem um campo de
   * foto marcado para isso (`settingsJson.validateLabelWithAi`). Estritamente um
   * apoio visual: qualquer falha (integração não configurada, timeout, erro da
   * API) é registrada em log e ignorada — nunca derruba o upload em si.
   *
   * Cobre o upload direto vinculado a uma fase já existente (ex.: "Preencher fase"
   * no Kanban). O caminho de submissão de formulário (fase ainda pode nem existir
   * no instante do upload) passou a ser um Flow — ver FlowsAttachmentListener e o
   * nó action_ai_agent em flow-execution.engine.ts.
   */
  private async tryValidateLabelForPhase(
    attachment: AttachmentEntity,
    file: Express.Multer.File,
    phaseId: string,
  ): Promise<AttachmentEntity> {
    try {
      const phaseFields = await this.phaseFieldsRepository.find({ where: { phaseId } });
      const shouldValidate = phaseFields.some(
        (field) => field.fieldType === 'file_upload' && field.settingsJson?.validateLabelWithAi === true,
      );
      if (!shouldValidate) return attachment;

      const message = await this.buildPhaseValidationMessage(attachment.solicitationId, phaseId);
      const result = await this.labelValidatorClient.validateLabel(
        file.buffer,
        file.originalname,
        file.mimetype,
        message,
      );

      attachment.validationResult = result;
      attachment.validatedAt = new Date();
      return await this.attachmentsRepository.save(attachment);
    } catch (error) {
      this.logger.warn(`Falha ao validar etiqueta com IA: ${(error as Error).message}`);
      return attachment;
    }
  }

  private async buildPhaseValidationMessage(solicitationId: string | null, phaseId: string): Promise<string> {
    if (!solicitationId) return 'Analise essa imagem.';

    const rows = await this.phaseFieldValuesRepository
      .createQueryBuilder('v')
      .innerJoin('v.phaseField', 'f')
      .where('v.solicitation_id = :solicitationId', { solicitationId })
      .andWhere('f.phase_id = :phaseId', { phaseId })
      .andWhere('f.code IN (:...codes)', { codes: LABEL_CROSS_CHECK_FIELD_CODES })
      .select(['f.code AS code', 'v.value_text AS "valueText"'])
      .getRawMany<{ code: string; valueText: string | null }>();

    const byCode = new Map(rows.map((row) => [row.code, row.valueText]));
    const parts: string[] = [];
    if (byCode.get('lote')) parts.push(`lote ${byCode.get('lote')}`);
    if (byCode.get('fabricacao')) parts.push(`fab ${byCode.get('fabricacao')}`);
    if (byCode.get('validade')) parts.push(`val ${byCode.get('validade')}`);

    return parts.length > 0 ? `Analise essa imagem. ${parts.join(', ')}.` : 'Analise essa imagem.';
  }

  /**
   * `seesAll` = "ver e excluir anexos de todos" no processo do card (quem chama confere). Sem isso,
   * só os públicos e os que a própria pessoa enviou.
   */
  async findBySolicitation(
    solicitationId: string,
    seesAll: boolean,
    actorId?: string,
    phaseId?: string,
  ): Promise<AttachmentEntity[]> {

    const qb = this.attachmentsRepository
      .createQueryBuilder('a')
      .where('a.solicitation_id = :solicitationId', { solicitationId });

    if (!seesAll) {
      qb.andWhere('(a.is_public = true OR a.uploaded_by_user_id = :actorId)', {
        actorId: actorId ?? null,
      });
    }
    if (phaseId) {
      qb.andWhere('a.phase_id = :phaseId', { phaseId });
    }

    return qb.getMany();
  }

  /** Vincula à solicitação os anexos do envio que chegaram antes dela existir. */
  async linkSubmissionAttachments(submissionId: string, solicitationId: string): Promise<void> {
    await this.attachmentsRepository.update(
      { submissionId, solicitationId: IsNull() },
      { solicitationId },
    );
  }

  /**
   * Encaminhar para outro processo: copia os anexos de um card para outro. A cópia é do arquivo
   * também — excluir o anexo de um card apaga o arquivo do disco, e o outro não pode perder o dele.
   * Os anexos de fase entram como anexos do formulário (a fase é do processo de origem). Não dispara
   * "Anexo enviado": ninguém enviou nada no destino. Um arquivo que falhar não trava os demais.
   */
  async copyToSolicitation(
    sourceSolicitationId: string,
    target: { solicitationId: string; submissionId: string | null },
  ): Promise<{ copied: number; failed: string[] }> {
    const sources = await this.attachmentsRepository.find({
      where: { solicitationId: sourceSolicitationId },
      order: { createdAt: 'ASC' },
    });
    let copied = 0;
    const failed: string[] = [];
    for (const source of sources) {
      try {
        const buffer = await this.storageService.readFile(source.storagePath);
        const { storedName, storagePath, storageType } = await this.storageService.save(
          { originalname: source.storedName, buffer } as Express.Multer.File,
          `solicitations/${target.solicitationId}`,
        );
        await this.attachmentsRepository.save(
          this.attachmentsRepository.create({
            originalName: source.originalName,
            description: source.description,
            storedName,
            mimeType: source.mimeType,
            sizeBytes: source.sizeBytes,
            storagePath,
            storageType,
            solicitationId: target.solicitationId,
            submissionId: target.submissionId,
            uploadedByUserId: source.uploadedByUserId,
            isPublic: source.isPublic,
            phaseId: null,
          }),
        );
        copied += 1;
      } catch (err) {
        failed.push(source.originalName);
        this.logger.warn(
          `Falha ao copiar o anexo ${source.id} para a solicitação ${target.solicitationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { copied, failed };
  }

  async findBySubmission(submissionId: string): Promise<AttachmentEntity[]> {
    return this.attachmentsRepository.find({ where: { submissionId }, order: { createdAt: 'ASC' } });
  }

  /**
   * `authorize` roda com o anexo carregado e antes de abrir o arquivo — a rota autenticada confere
   * ali o card (ou a resposta) do anexo.
   */
  async download(
    id: string,
    opts: { isPublicRoute: boolean; authorize?: (attachment: AttachmentEntity) => Promise<void> },
  ): Promise<{ stream: ReadStream; attachment: AttachmentEntity }> {
    const attachment = await this.attachmentsRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    if (opts.isPublicRoute && !attachment.isPublic) {
      throw new ForbiddenException('Acesso não permitido a este anexo.');
    }
    if (opts.authorize) await opts.authorize(attachment);
    const stream = this.storageService.getStream(attachment.storagePath);
    return { stream, attachment };
  }

  /**
   * Renomear ou descrever um anexo já enviado. Mesma regra de excluir: `authorize` confere o processo
   * e diz se a pessoa tem "anexos de todos"; sem isso, só mexe no que ela mesma enviou. O arquivo em
   * disco não muda — só o nome de exibição/download e a descrição.
   */
  async update(
    id: string,
    dto: UpdateAttachmentDto,
    actorId: string,
    authorize: (attachment: AttachmentEntity) => Promise<boolean>,
  ): Promise<AttachmentEntity> {
    const attachment = await this.attachmentsRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const canManageAll = await authorize(attachment);
    if (!canManageAll && attachment.uploadedByUserId !== actorId) {
      throw new ForbiddenException('Sem permissão para alterar este anexo.');
    }
    if (dto.name !== undefined) {
      attachment.originalName = resolveAttachmentName(attachment.originalName, dto.name);
    }
    if (dto.description !== undefined) {
      attachment.description = normalizeAttachmentDescription(dto.description);
    }
    return this.attachmentsRepository.save(attachment);
  }

  /**
   * `authorize` confere o processo do anexo e diz se a pessoa tem "ver e excluir anexos de todos"
   * nele; sem isso, só exclui o que ela mesma enviou.
   */
  async delete(
    id: string,
    actorId: string,
    authorize: (attachment: AttachmentEntity) => Promise<boolean>,
  ): Promise<void> {
    const attachment = await this.attachmentsRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    const canManageAll = await authorize(attachment);
    const canDelete = canManageAll || attachment.uploadedByUserId === actorId;

    if (!canDelete) {
      throw new ForbiddenException('Sem permissão para excluir este anexo.');
    }

    await this.storageService.delete(attachment.storagePath);
    await this.attachmentsRepository.remove(attachment);
  }
}
