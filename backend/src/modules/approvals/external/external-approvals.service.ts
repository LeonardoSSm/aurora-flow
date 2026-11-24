import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PRODUCT_NAME } from '../../../common/constants/product';
import { ApprovalStatus } from '../../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../../common/enums/approval-step-status.enum';
import { FormFieldType } from '../../../common/enums/form-field-type.enum';
import { ApprovalStepEntity } from '../../../database/entities';
import { normalizeEmailAddress } from '../../notifications/channels/address.util';
import { SettingsService } from '../../settings/settings.service';
import { ApprovalsService } from '../approvals.service';
import type { DecideExternalApprovalDto } from '../dto/decide-external-approval.dto';
import { hashApprovalToken, isPlausibleApprovalToken } from './external-approval-token';
import { EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS } from './external-approval-link.service';

export type ExternalApprovalState = 'pending' | 'decided' | 'expired' | 'closed';

export interface ExternalApprovalAnswer {
  label: string;
  value: string;
}

/**
 * O que a página pública do link mostra. Em qualquer estado diferente de `pending` só há o estado
 * (e, se decidida, a decisão): nada da solicitação vaza por um link já usado, expirado ou encerrado.
 */
export interface ExternalApprovalView {
  state: ExternalApprovalState;
  orgName: string;
  /** E-mail do aprovador mascarado (l***@dominio.com): lembra qual e-mail digitar na confirmação. */
  emailHint?: string;
  expiresAt?: Date | null;
  approval?: { title: string; description: string | null };
  solicitation?: {
    number: string;
    title: string;
    description: string | null;
    requesterName: string | null;
    createdAt: Date;
    answers: ExternalApprovalAnswer[];
  };
  decision?: { decision: 'approved' | 'rejected'; decidedAt: Date | null };
}

const MAX_ANSWERS = 40;
/** Tipos que nunca vão para a página pública: arquivos e documentos pessoais. */
const HIDDEN_FIELD_TYPES = new Set<string>([FormFieldType.FILE_UPLOAD, FormFieldType.CPF]);
const MAX_ANSWER_LENGTH = 1000;

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

function clip(value: string): string {
  return value.length > MAX_ANSWER_LENGTH ? `${value.slice(0, MAX_ANSWER_LENGTH)}…` : value;
}

/** Valor de um item de resposta como texto de exibição (ou `null` se vazio). */
function itemValue(item: {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
}): string | null {
  if (item.valueText?.trim()) return clip(item.valueText.trim());
  if (item.valueNumber !== null && item.valueNumber !== undefined) return String(item.valueNumber);
  if (item.valueBoolean !== null && item.valueBoolean !== undefined) return item.valueBoolean ? 'Sim' : 'Não';
  if (item.valueJson !== null && item.valueJson !== undefined) {
    if (Array.isArray(item.valueJson) && item.valueJson.every((entry) => typeof entry === 'string')) {
      return clip(item.valueJson.join(', '));
    }
    try {
      return clip(JSON.stringify(item.valueJson));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Aprovação por link pessoal (sem login). A posse do token é a primeira prova; a confirmação do
 * e-mail, a segunda. A decisão em si passa por `ApprovalsService`, a mesma regra do usuário logado.
 */
@Injectable()
export class ExternalApprovalsService {
  private readonly logger = new Logger(ExternalApprovalsService.name);

  constructor(
    @InjectRepository(ApprovalStepEntity)
    private readonly stepsRepo: Repository<ApprovalStepEntity>,
    private readonly approvals: ApprovalsService,
    private readonly settings: SettingsService,
  ) {}

  async getForToken(token: string): Promise<ExternalApprovalView> {
    const step = await this.findStep(token);
    const orgName = await this.orgName();
    const state = this.stateOf(step);

    if (state === 'decided') {
      return {
        state,
        orgName,
        decision: {
          decision: step.status === ApprovalStepStatus.APPROVED ? 'approved' : 'rejected',
          decidedAt: step.decidedAt,
        },
      };
    }
    if (state !== 'pending') return { state, orgName };

    const solicitation = step.approval.solicitation;
    const items = [...(solicitation.submission?.items ?? [])].sort(
      (a, b) => (a.field?.order ?? 0) - (b.field?.order ?? 0),
    );
    const answers: ExternalApprovalAnswer[] = [];
    for (const item of items) {
      // Campo sensível (marcado pelo dono do formulário), arquivo e CPF não saem para o link externo.
      if (item.field?.isSensitive || HIDDEN_FIELD_TYPES.has(item.field?.fieldType)) continue;
      const value = itemValue(item);
      if (value === null) continue;
      answers.push({ label: item.field?.label ?? item.fieldCode, value });
      if (answers.length >= MAX_ANSWERS) break;
    }

    return {
      state,
      orgName,
      emailHint: maskEmail(step.assignedEmail as string),
      expiresAt: step.accessTokenExpiresAt,
      approval: { title: step.approval.title, description: step.approval.description },
      solicitation: {
        number: solicitation.id.slice(0, 8).toUpperCase(),
        title: solicitation.title,
        description: solicitation.description,
        requesterName: solicitation.submission?.responderName ?? solicitation.createdByUser?.fullName ?? null,
        createdAt: solicitation.createdAt,
        answers,
      },
    };
  }

  async decide(token: string, dto: DecideExternalApprovalDto, ip: string | null): Promise<ExternalApprovalView> {
    const step = await this.findStep(token);
    this.assertPending(step);

    const confirmed = normalizeEmailAddress(dto.confirmEmail);
    if (!confirmed || confirmed !== step.assignedEmail) {
      await this.registerFailedAttempt(step);
    }
    // Só chega aqui com o e-mail certo.
    if (dto.decision === 'rejected' && !dto.comment?.trim()) {
      throw new BadRequestException('Comentário obrigatório na reprovação.');
    }

    try {
      await this.approvals.decideExternalStep(
        step.id,
        { decision: dto.decision, comment: dto.comment },
        { email: step.assignedEmail as string, ip: ip ? ip.slice(0, 45) : null },
      );
    } catch (error) {
      // Corrida: duas abas/cliques ao mesmo tempo. Quem perdeu vê "já decidida", não um erro 400 cru.
      if (error instanceof BadRequestException) {
        const fresh = await this.findStep(token).catch(() => null);
        if (fresh && this.stateOf(fresh) !== 'pending') this.assertPending(fresh);
      }
      throw error;
    }

    this.logger.log({ stepId: step.id, approvalId: step.approvalId, decision: dto.decision }, 'Aprovação externa decidida');
    return this.getForToken(token);
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async findStep(token: string): Promise<ApprovalStepEntity> {
    if (!isPlausibleApprovalToken(token)) throw new NotFoundException('Link de aprovação inválido.');
    const step = await this.stepsRepo
      .createQueryBuilder('step')
      .addSelect('step.accessFailedAttempts')
      .innerJoinAndSelect('step.approval', 'approval')
      .innerJoinAndSelect('approval.solicitation', 'solicitation')
      .leftJoinAndSelect('solicitation.createdByUser', 'creator')
      .leftJoinAndSelect('solicitation.submission', 'submission')
      .leftJoinAndSelect('submission.items', 'item')
      .leftJoinAndSelect('item.field', 'field')
      .where('step.accessTokenHash = :hash', { hash: hashApprovalToken(token) })
      .andWhere('step.assignedEmail IS NOT NULL')
      .getOne();
    if (!step) throw new NotFoundException('Link de aprovação inválido.');
    return step;
  }

  private stateOf(step: ApprovalStepEntity): ExternalApprovalState {
    if (step.status === ApprovalStepStatus.APPROVED || step.status === ApprovalStepStatus.REJECTED) {
      return 'decided';
    }
    if (step.status !== ApprovalStepStatus.PENDING || step.approval.status !== ApprovalStatus.PENDING) {
      return 'closed';
    }
    const expired = !step.accessTokenExpiresAt || step.accessTokenExpiresAt.getTime() <= Date.now();
    if (expired || step.accessFailedAttempts >= EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS) return 'expired';
    return 'pending';
  }

  private assertPending(step: ApprovalStepEntity): void {
    const state = this.stateOf(step);
    if (state === 'pending') return;
    const messages: Record<Exclude<ExternalApprovalState, 'pending'>, string> = {
      decided: 'Esta aprovação já foi decidida.',
      expired: 'Este link expirou ou foi bloqueado. Peça um novo link a quem solicitou a aprovação.',
      closed: 'Esta aprovação foi encerrada e não aceita mais decisão.',
    };
    throw new GoneException({ message: messages[state], state });
  }

  /** E-mail de confirmação errado: conta a tentativa e, no limite, bloqueia o link (expira na hora). */
  private async registerFailedAttempt(step: ApprovalStepEntity): Promise<never> {
    const result = await this.stepsRepo
      .createQueryBuilder()
      .update(ApprovalStepEntity)
      .set({ accessFailedAttempts: () => 'access_failed_attempts + 1' })
      .where('id = :id', { id: step.id })
      .returning('access_failed_attempts')
      .execute();
    const rows = (result.raw ?? []) as Array<{ access_failed_attempts: number }>;
    const attempts = Number(rows[0]?.access_failed_attempts ?? step.accessFailedAttempts + 1);
    const remaining = EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS - attempts;

    if (remaining <= 0) {
      await this.stepsRepo.update(step.id, { accessTokenExpiresAt: new Date() });
      this.logger.warn({ stepId: step.id, approvalId: step.approvalId }, 'Link de aprovação externa bloqueado por tentativas');
      throw new GoneException({
        message: 'Tentativas esgotadas: o link foi bloqueado. Peça um novo link a quem solicitou a aprovação.',
        state: 'expired',
      });
    }
    throw new ForbiddenException({
      message: `O e-mail informado não confere com o destinatário do link. Restam ${remaining} tentativa(s).`,
      remainingAttempts: remaining,
    });
  }

  private orgName(): Promise<string> {
    return this.settings.getValue<string>('org.name', PRODUCT_NAME).catch(() => PRODUCT_NAME);
  }
}
