import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suporte a pausa/retomada de fluxo em action_create_approval.
 *
 * O motor não tinha uma etapa de espera de verdade: criar a aprovação disparava e o fluxo
 * seguia na hora pros próximos nós, com `ctx.solicitation` desatualizado (de antes da
 * aprovação existir) — então uma condição "Status = Aprovada" logo depois avaliava sempre
 * como falso e o ramo "não" chegava a mover o card de verdade, mesmo sem decisão nenhuma.
 *
 * `paused_node_id` guarda o id do nó action_create_approval onde a execução parou; junto com
 * a coluna `approval_id` já existente, FlowsService.resumePausedExecution sabe de onde
 * continuar (engine.resumeFrom) quando a aprovação é decidida. `status` já é varchar(20) sem
 * CHECK constraint — 'waiting_approval' (16 chars) é só mais um valor aceito, sem migração
 * de dado.
 */
export class FlowExecutionPausedNode1787400000000 implements MigrationInterface {
  name = 'FlowExecutionPausedNode1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flow_executions" ADD "paused_node_id" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "paused_node_id"`);
  }
}
