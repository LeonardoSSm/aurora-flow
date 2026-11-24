import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { NodeExecutionResult } from '../../modules/flows/types/flow.types';
import { FlowEntity } from './flow.entity';

@Entity('flow_executions')
@Index('IDX_flow_executions_flow_id', ['flowId'])
// Idempotência do envio de formulário: o mesmo responses.submitted executa o fluxo uma vez. Os
// demais eventos da mesma solicitação (movida, anexo, fase salva…) executam a cada ocorrência.
@Index('UQ_flow_executions_flow_submission', ['flowId', 'submissionId'], {
  unique: true,
  where: `"submission_id" IS NOT NULL AND "event_name" = 'responses.submitted'`,
})
export class FlowExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'flow_id', type: 'uuid' })
  flowId!: string;

  @ManyToOne(() => FlowEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flow_id' })
  flow!: FlowEntity;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId!: string | null;

  @Column({ name: 'event_name', type: 'varchar', length: 100, nullable: true })
  eventName!: string | null;

  @Column({ name: 'solicitation_id', type: 'uuid', nullable: true })
  solicitationId!: string | null;

  @Column({ name: 'approval_id', type: 'uuid', nullable: true })
  approvalId!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!:
    | 'pending'
    | 'running'
    | 'success'
    | 'failed'
    | 'skipped'
    | 'partial_failure'
    | 'waiting_approval'
    | 'waiting_phase_fields'
    // action_run_flow `sync` esperando a execução do filho terminar (status é varchar(20), sem CHECK)
    | 'waiting_subflow';

  /**
   * Id do nó (action_create_approval ou action_wait_for_phase_fields) onde a execução parou,
   * enquanto `status` é 'waiting_approval'/'waiting_phase_fields'. FlowsService.resumePausedExecution
   * / resumePausedPhaseFieldsExecution usa isso pra retomar exatamente dali (engine.resumeFrom)
   * quando a aprovação (approvalId, abaixo) é decidida ou a fase (waitingPhaseId, abaixo) é
   * salva — sem re-executar os nós já concluídos antes da pausa.
   */
  @Column({ name: 'paused_node_id', type: 'varchar', length: 100, nullable: true })
  pausedNodeId!: string | null;

  /**
   * Fase que a execução está esperando ser salva, enquanto `status` é 'waiting_phase_fields'.
   * Ver action_wait_for_phase_fields e FlowsPhaseFieldsListener.
   */
  @Column({ name: 'waiting_phase_id', type: 'uuid', nullable: true })
  waitingPhaseId!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'node_results', type: 'jsonb', default: [] })
  nodeResults!: NodeExecutionResult[];

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /** ID do fluxo pai quando esta execução foi disparada por action_run_flow */
  @Column({ name: 'parent_flow_id', type: 'uuid', nullable: true })
  parentFlowId!: string | null;

  /** ID do registro de execução pai quando disparado por action_run_flow */
  @Column({ name: 'parent_execution_id', type: 'uuid', nullable: true })
  parentExecutionId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
