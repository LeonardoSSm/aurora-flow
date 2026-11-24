import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suporte a uma SEGUNDA forma de pausa/retomada de fluxo, além da aprovação: agora
 * action_wait_for_phase_fields também para a execução até os campos de uma fase específica
 * serem salvos (solicitations.phase_fields_saved). Isso permite unir num único fluxo etapas
 * separadas por ações manuais no meio (ex.: foto da fase 1 → aprovação → [espera] →
 * apontamento da fase 3 → aprovação), sem inventar múltiplos fluxos desconectados.
 *
 * `waiting_phase_id` guarda a fase que a execução está esperando; junto com `paused_node_id`
 * (já existente) e `solicitation_id` (já existente), FlowsService.resumePausedPhaseFieldsExecution
 * sabe de onde continuar quando FlowsPhaseFieldsListener detecta que essa fase foi salva.
 * `status` já é varchar(20) sem CHECK constraint — 'waiting_phase_fields' (20 chars) é só mais
 * um valor aceito, sem migração de dado.
 */
export class FlowExecutionWaitingPhaseFields1788300000000 implements MigrationInterface {
  name = 'FlowExecutionWaitingPhaseFields1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flow_executions" ADD "waiting_phase_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "waiting_phase_id"`);
  }
}
