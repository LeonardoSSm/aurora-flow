import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleSheetsSyncJobStatus } from '../../../common/enums/google-sheets-sync-job-status.enum';
import {
  GoogleSyncReenqueuedEvent,
  GoogleSyncReprocessedEvent,
} from '../../../common/events/form-events';
import {
  FormEntity,
  GoogleSheetsSyncJobEntity,
  SubmissionEntity,
} from '../../../database/entities';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { GoogleConnectionService } from '../connection/google-connection.service';
import { GoogleSheetsClientService } from '../sheets/google-sheets-client.service';
import { GoogleSheetsHeadersService } from '../sheets/google-sheets-headers.service';
import { GoogleTokenService } from '../tokens/google-token.service';
import { GoogleApiError, FormGoogleSheetsStatusResponse } from '../types/google-workspace.types';
import { GoogleSheetsSpreadsheetService } from './google-sheets-spreadsheet.service';

@Injectable()
export class GoogleSheetsSyncService {
  private readonly staleMs = 10 * 60 * 1000;
  private readonly retryMinutes = [1, 2, 5, 10, 30, 60, 120, 240];

  // Single-instance overlap guard: @Cron fires every 30 s; if the previous
  // cycle is still running we skip rather than stack executions.
  private isProcessing = false;
  private lastCycleAt: Date | null = null;

  constructor(
    @InjectPinoLogger(GoogleSheetsSyncService.name) private readonly logger: PinoLogger,
    private readonly connectionService: GoogleConnectionService,
    private readonly tokenService: GoogleTokenService,
    private readonly sheetsClient: GoogleSheetsClientService,
    private readonly headersService: GoogleSheetsHeadersService,
    private readonly spreadsheetService: GoogleSheetsSpreadsheetService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepository: Repository<SubmissionEntity>,
    @InjectRepository(GoogleSheetsSyncJobEntity)
    private readonly syncJobsRepository: Repository<GoogleSheetsSyncJobEntity>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async runSyncCycle(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    const start = Date.now();
    try {
      this.logger.info('Ciclo de sync iniciado');
      await this.recoverStale();
      await this.processQueued();
      this.lastCycleAt = new Date();
      this.logger.info({ durationMs: Date.now() - start }, 'Ciclo de sync concluido');
    } catch (error) {
      this.logger.error({ err: error }, 'Falha no ciclo de sync com Google Sheets');
    } finally {
      this.isProcessing = false;
    }
  }

  async getSyncHealth(): Promise<{
    totalQueued: number;
    totalProcessing: number;
    totalFailed: number;
    oldestQueuedAt: Date | null;
    lastCycleAt: Date | null;
  }> {
    const [totalQueued, totalProcessing, totalFailed] = await Promise.all([
      this.syncJobsRepository.count({ where: { status: GoogleSheetsSyncJobStatus.QUEUED } }),
      this.syncJobsRepository.count({ where: { status: GoogleSheetsSyncJobStatus.PROCESSING } }),
      this.syncJobsRepository.count({ where: { status: GoogleSheetsSyncJobStatus.FAILED } }),
    ]);

    const oldest = await this.syncJobsRepository.findOne({
      where: { status: GoogleSheetsSyncJobStatus.QUEUED },
      order: { createdAt: 'ASC' },
      select: { createdAt: true },
    });

    return {
      totalQueued,
      totalProcessing,
      totalFailed,
      oldestQueuedAt: oldest?.createdAt ?? null,
      lastCycleAt: this.lastCycleAt,
    };
  }

  async ensureSubmissionSyncJob(submissionId: string): Promise<void> {
    const submission = await this.submissionsRepository.findOne({
      where: { id: submissionId },
      relations: { form: true },
    });
    if (!submission?.form.googleSheetsEnabled) return;

    const existing = await this.syncJobsRepository.findOne({ where: { submissionId } });
    if (existing) return;

    await this.syncJobsRepository.save(
      this.syncJobsRepository.create({
        formId: submission.formId,
        submissionId,
        status: GoogleSheetsSyncJobStatus.QUEUED,
        nextAttemptAt: new Date(),
      }),
    );
  }

  async reenqueueFormSyncJobs(
    formId: string,
    actorId: string,
  ): Promise<{
    requeuedJobs: number;
    recoveredProcessingJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    const form = await this.findFormOrFail(formId);
    const staleBefore = new Date(Date.now() - this.staleMs);
    const jobs = await this.syncJobsRepository.find({ where: { formId } });

    let requeuedJobs = 0;
    let recoveredProcessingJobs = 0;

    for (const job of jobs) {
      if (job.status === GoogleSheetsSyncJobStatus.COMPLETED) continue;
      if (
        job.status === GoogleSheetsSyncJobStatus.PROCESSING &&
        (!job.startedAt || job.startedAt.getTime() > staleBefore.getTime())
      ) {
        continue;
      }
      if (job.status === GoogleSheetsSyncJobStatus.PROCESSING) recoveredProcessingJobs += 1;
      job.status = GoogleSheetsSyncJobStatus.QUEUED;
      job.nextAttemptAt = new Date();
      job.startedAt = null;
      job.completedAt = null;
      requeuedJobs += 1;
      await this.syncJobsRepository.save(job);
    }

    if (requeuedJobs > 0 || recoveredProcessingJobs > 0) {
      this.eventEmitter.emit(
        'forms.google_sync_reenqueued',
        new GoogleSyncReenqueuedEvent(actorId, form.id, requeuedJobs, recoveredProcessingJobs),
      );
    }

    return {
      requeuedJobs,
      recoveredProcessingJobs,
      status: await this.spreadsheetService.getFormGoogleSheetsStatus(formId),
    };
  }

  async reprocessFormSubmissions(
    formId: string,
    actorId: string,
  ): Promise<{
    createdJobs: number;
    skippedExistingJobs: number;
    skippedCompletedJobs: number;
    status: FormGoogleSheetsStatusResponse;
  }> {
    await this.findFormOrFail(formId);

    const submissions = await this.submissionsRepository.find({
      where: { formId },
      select: { id: true },
    });
    const existing = await this.syncJobsRepository.find({
      where: { formId },
      select: { id: true, status: true, submissionId: true },
    });
    const byId = new Map(existing.map((j) => [j.submissionId, j]));

    let createdJobs = 0;
    let skippedExistingJobs = 0;
    let skippedCompletedJobs = 0;

    for (const sub of submissions) {
      const ex = byId.get(sub.id);
      if (!ex) {
        await this.syncJobsRepository.save(
          this.syncJobsRepository.create({
            formId,
            submissionId: sub.id,
            status: GoogleSheetsSyncJobStatus.QUEUED,
            nextAttemptAt: new Date(),
          }),
        );
        createdJobs += 1;
      } else if (ex.status === GoogleSheetsSyncJobStatus.COMPLETED) {
        skippedCompletedJobs += 1;
      } else {
        skippedExistingJobs += 1;
      }
    }

    this.eventEmitter.emit(
      'forms.google_sync_reprocessed',
      new GoogleSyncReprocessedEvent(
        actorId,
        formId,
        createdJobs,
        skippedExistingJobs,
        skippedCompletedJobs,
      ),
    );

    return {
      createdJobs,
      skippedExistingJobs,
      skippedCompletedJobs,
      status: await this.spreadsheetService.getFormGoogleSheetsStatus(formId),
    };
  }

  private async recoverStale(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.staleMs);
    const jobs = await this.syncJobsRepository.find({
      where: { status: GoogleSheetsSyncJobStatus.PROCESSING },
    });
    for (const job of jobs) {
      if (job.startedAt && job.startedAt.getTime() > staleBefore.getTime()) continue;
      job.status = GoogleSheetsSyncJobStatus.QUEUED;
      job.nextAttemptAt = new Date();
      job.startedAt = null;
      job.lastError = 'Job recuperado automaticamente apos exceder o tempo maximo em processing.';
      await this.syncJobsRepository.save(job);
    }
  }

  private async processQueued(): Promise<void> {
    const now = new Date();
    const jobs = await this.syncJobsRepository
      .createQueryBuilder('job')
      .where('job.status = :status', { status: GoogleSheetsSyncJobStatus.QUEUED })
      .andWhere('(job.next_attempt_at IS NULL OR job.next_attempt_at <= :now)', { now })
      .orderBy('job.created_at', 'ASC')
      .limit(10)
      .getMany();

    for (const job of jobs) {
      const claim = await this.syncJobsRepository.update(
        { id: job.id, status: GoogleSheetsSyncJobStatus.QUEUED },
        {
          status: GoogleSheetsSyncJobStatus.PROCESSING,
          attempts: job.attempts + 1,
          startedAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
          completedAt: null,
        },
      );
      if (!claim.affected) continue;
      await this.processClaimedJob(job.id);
    }
  }

  private async processClaimedJob(jobId: string): Promise<void> {
    const job = await this.syncJobsRepository.findOne({
      where: { id: jobId },
      relations: {
        form: { googleLinkedUser: true, versions: { sections: { fields: true } } },
        submission: { items: true },
      },
    });
    if (!job) return;

    try {
      if (!job.form.googleSheetsEnabled) {
        throw new GoogleApiError(
          'Integracao com Google Sheets desabilitada para o formulario.',
          false,
        );
      }
      if (!job.form.googleSpreadsheetId) {
        throw new GoogleApiError(
          'Planilha do Google Sheets ainda nao foi criada para este formulario.',
          true,
        );
      }

      const linked = job.form.googleLinkedUser;
      if (!linked || !this.connectionService.isUserGoogleConnected(linked)) {
        throw new GoogleApiError('Conta Google vinculada esta desconectada.', true);
      }

      const accessToken = await this.tokenService.getValidAccessToken(linked);
      const headers = await this.headersService.ensureSpreadsheetHeaders(
        job.form,
        accessToken,
        job.submission,
      );
      const row = this.headersService.buildSheetRow(headers, job.form, job.submission);

      await this.sheetsClient.appendValues(accessToken, job.form.googleSpreadsheetId, [row]);

      const completedAt = new Date();
      job.status = GoogleSheetsSyncJobStatus.COMPLETED;
      job.completedAt = completedAt;
      job.lastError = null;
      await this.syncJobsRepository.save(job);
      await this.formsRepository.update(
        { id: job.form.id },
        { googleLastSyncedAt: completedAt, googleLastError: null },
      );
      await this.connectionService.touchGoogleUsage(linked.id);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Falha ao sincronizar resposta com Google Sheets.';
      const retryable = error instanceof GoogleApiError ? error.retryable : true;

      job.lastError = message;
      job.completedAt = null;

      if (retryable && job.attempts < job.maxAttempts) {
        job.status = GoogleSheetsSyncJobStatus.QUEUED;
        job.nextAttemptAt = this.nextAttemptAt(job.attempts);
        job.startedAt = null;
      } else {
        job.status = GoogleSheetsSyncJobStatus.FAILED;
        job.nextAttemptAt = null;
        this.logger.error(
          { jobId: job.id, submissionId: job.submissionId, syncError: message },
          'Job permanentemente falhou',
        );
      }

      await this.syncJobsRepository.save(job);
      await this.formsRepository.update({ id: job.form.id }, { googleLastError: message });
    }
  }

  private async findFormOrFail(formId: string): Promise<FormEntity> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    return form;
  }

  private nextAttemptAt(attempt: number): Date {
    const minutes = this.retryMinutes[Math.min(attempt - 1, this.retryMinutes.length - 1)];
    return new Date(Date.now() + minutes * 60 * 1000);
  }
}
