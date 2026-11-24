import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { resolvePath } from '../../common/utils/dot-path';
import { FlowEntity } from '../../database/entities';
import { ErpConnectorService } from '../integrations/erp/erp-connector.service';
import { FlowsService } from './flows.service';
import type { FlowExecutionContext } from './types/flow.types';

/**
 * Rede de segurança para integrações orientadas a webhook (ex: Protheus): reprocessa
 * periodicamente uma lista de pendências que talvez não tenham chegado via webhook (falha de
 * rede, endpoint fora do ar no momento do envio, etc). NÃO substitui o webhook — é um
 * complemento de reconciliação, desativado por padrão.
 *
 * Em vez de duplicar a lógica de mapeamento/idempotência/aprovação, reaproveita o mesmo Flow
 * configurado para o webhook: cada item da lista é injetado como se fosse o payload de um
 * webhook individual (ctx.metadata.payload), então a chave de idempotência do próprio Flow
 * garante que pedidos já criados via webhook não são duplicados aqui.
 */
@Injectable()
export class FlowsErpReconciliationService {
  private readonly logger = new Logger(FlowsErpReconciliationService.name);
  private isProcessing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly erpConnectorService: ErpConnectorService,
    private readonly flowsService: FlowsService,
    @InjectRepository(FlowEntity)
    private readonly flowsRepo: Repository<FlowEntity>,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcilePendingItems(): Promise<void> {
    if (this.isProcessing || !this.isEnabled()) return;
    this.isProcessing = true;

    const templateId = this.configService.get<string>('ERP_RECONCILIATION_TEMPLATE_ID', '');
    const flowId = this.configService.get<string>('ERP_RECONCILIATION_FLOW_ID', '');
    const itemsPath = this.configService.get<string>('ERP_RECONCILIATION_ITEMS_PATH', '');

    try {
      const flow = await this.flowsRepo.findOne({ where: { id: flowId, isActive: true } });
      if (!flow) {
        this.logger.warn(
          `Reconciliação ERP: fluxo "${flowId}" (ERP_RECONCILIATION_FLOW_ID) não encontrado ou inativo.`,
        );
        return;
      }

      const log = await this.erpConnectorService.executeOperation(templateId, {
        eventName: 'erp.reconciliation.list',
      });
      if (log.status !== 'success' || !log.responseBody) {
        this.logger.warn(
          `Reconciliação ERP: falha ao listar pendências (status "${log.status}").`,
        );
        return;
      }

      const items = this.extractItems(log.responseBody, itemsPath);
      if (items.length === 0) {
        this.logger.log('Reconciliação ERP: nenhum item pendente retornado.');
        return;
      }

      // Os itens entram como payloads de webhook: pelo gatilho de webhook do fluxo, se houver.
      const entryNodeId = flow.nodes.find((node) => node.type === 'trigger_webhook_received')?.id;

      let processed = 0;
      let failed = 0;
      for (const item of items) {
        try {
          const context: FlowExecutionContext = {
            eventName: 'erp.reconciliation.tick',
            metadata: { payload: item },
            entryNodeId,
          };
          await this.flowsService.executeFlowWithContext(flow, context);
          processed++;
        } catch (err) {
          failed++;
          this.logger.warn(`Reconciliação ERP: item falhou: ${this.errorMessage(err)}`);
        }
      }
      this.logger.log(
        `Reconciliação ERP concluída: ${items.length} item(ns), ${processed} processado(s), ${failed} falha(s).`,
      );
    } catch (err) {
      this.logger.error(`Reconciliação ERP falhou: ${this.errorMessage(err)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private isEnabled(): boolean {
    return (
      this.configService.get<string>('ERP_RECONCILIATION_ENABLED', 'false') === 'true' &&
      !!this.configService.get<string>('ERP_RECONCILIATION_TEMPLATE_ID', '').trim() &&
      !!this.configService.get<string>('ERP_RECONCILIATION_FLOW_ID', '').trim()
    );
  }

  private extractItems(rawResponseBody: string, itemsPath: string): unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponseBody);
    } catch {
      return [];
    }
    const target = itemsPath.trim() ? resolvePath(parsed, itemsPath) : parsed;
    return Array.isArray(target) ? target : [];
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
