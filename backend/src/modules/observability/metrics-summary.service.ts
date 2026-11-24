import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type MetricsSummaryDto = {
  solicitations: {
    total: number;
    byStatus: Record<string, number>;
    slaBreached: number;
    pending: number;
  };
  approvals: {
    pending: number;
    decidedToday: number;
  };
  webhooks: {
    deliveriesToday: number;
    failedDeliveries: number;
  };
  flows: {
    executionsToday: number;
    failedExecutions: number;
  };
  whatsapp: {
    sentToday: number;
    failed: number;
  };
};

@Injectable()
export class MetricsSummaryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getSummary(): Promise<MetricsSummaryDto> {
    const [
      solicitationsTotal,
      solicitationsByStatus,
      slaBreached,
      approvalsPending,
      approvalsDecidedToday,
      deliveriesToday,
      failedDeliveries,
      flowExecutionsToday,
      flowFailedToday,
      whatsappSentToday,
      whatsappFailed,
    ] = await Promise.all([
      this.queryScalar<string>(`SELECT COUNT(*)::text FROM solicitations`),
      this.dataSource.query<Array<{ status: string; count: string }>>(
        `SELECT status, COUNT(*)::text AS count FROM solicitations GROUP BY status`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM solicitations WHERE sla_status = 'breached'`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM approvals WHERE status = 'pending'`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM approval_steps
         WHERE status IN ('approved', 'rejected') AND decided_at >= CURRENT_DATE`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM webhook_deliveries WHERE created_at >= CURRENT_DATE`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM webhook_deliveries WHERE status = 'failed'`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM flow_executions WHERE created_at >= CURRENT_DATE`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM flow_executions
         WHERE status = 'failed' AND created_at >= CURRENT_DATE`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM whatsapp_messages
         WHERE status = 'sent' AND sent_at >= CURRENT_DATE`,
      ),
      this.queryScalar<string>(
        `SELECT COUNT(*)::text FROM whatsapp_messages WHERE status = 'failed'`,
      ),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of solicitationsByStatus) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const pendingCount = byStatus['open'] ?? 0;

    return {
      solicitations: {
        total: parseInt(solicitationsTotal, 10),
        byStatus,
        slaBreached: parseInt(slaBreached, 10),
        pending: pendingCount,
      },
      approvals: {
        pending: parseInt(approvalsPending, 10),
        decidedToday: parseInt(approvalsDecidedToday, 10),
      },
      webhooks: {
        deliveriesToday: parseInt(deliveriesToday, 10),
        failedDeliveries: parseInt(failedDeliveries, 10),
      },
      flows: {
        executionsToday: parseInt(flowExecutionsToday, 10),
        failedExecutions: parseInt(flowFailedToday, 10),
      },
      whatsapp: {
        sentToday: parseInt(whatsappSentToday, 10),
        failed: parseInt(whatsappFailed, 10),
      },
    };
  }

  private async queryScalar<T>(sql: string): Promise<T> {
    const rows = await this.dataSource.query<Array<Record<string, T>>>(sql);
    const row = rows[0];
    return Object.values(row)[0] as T;
  }
}
