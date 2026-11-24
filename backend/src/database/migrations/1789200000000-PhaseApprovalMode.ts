import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Regra da aprovação de fase: 'any' (basta um dos escolhidos — como era), 'all' (todos precisam
 * aprovar) ou 'sequential' (um depois do outro, na ordem de `approvers.order`). As fases
 * existentes ficam em 'any'.
 */
export class PhaseApprovalMode1789200000000 implements MigrationInterface {
  name = 'PhaseApprovalMode1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "approval_mode" character varying(20) NOT NULL DEFAULT 'any'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "approval_mode"`);
  }
}
