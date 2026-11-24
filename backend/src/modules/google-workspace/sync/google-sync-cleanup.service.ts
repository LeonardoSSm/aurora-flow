import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { GoogleSheetsSyncJobStatus } from '../../../common/enums/google-sheets-sync-job-status.enum';
import { GoogleSheetsSyncJobEntity } from '../../../database/entities';

@Injectable()
export class GoogleSyncCleanupService {
  constructor(
    @InjectPinoLogger(GoogleSyncCleanupService.name) private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    @InjectRepository(GoogleSheetsSyncJobEntity)
    private readonly syncJobsRepository: Repository<GoogleSheetsSyncJobEntity>,
  ) {}

  @Cron('0 3 * * *')
  async cleanupOldJobs(): Promise<void> {
    const retentionCompleted = Number(
      this.configService.get<string>('GOOGLE_SYNC_RETENTION_DAYS_COMPLETED', '30'),
    );
    const retentionFailed = Number(
      this.configService.get<string>('GOOGLE_SYNC_RETENTION_DAYS_FAILED', '90'),
    );

    const completedCutoff = new Date(Date.now() - retentionCompleted * 24 * 60 * 60 * 1000);
    const failedCutoff = new Date(Date.now() - retentionFailed * 24 * 60 * 60 * 1000);

    const [completedResult, failedResult] = await Promise.all([
      this.syncJobsRepository.delete({
        status: GoogleSheetsSyncJobStatus.COMPLETED,
        completedAt: LessThan(completedCutoff),
      }),
      this.syncJobsRepository.delete({
        status: GoogleSheetsSyncJobStatus.FAILED,
        updatedAt: LessThan(failedCutoff),
      }),
    ]);

    this.logger.info(
      {
        deletedCompleted: completedResult.affected ?? 0,
        deletedFailed: failedResult.affected ?? 0,
        retentionCompletedDays: retentionCompleted,
        retentionFailedDays: retentionFailed,
      },
      'Limpeza de jobs concluida',
    );
  }
}
