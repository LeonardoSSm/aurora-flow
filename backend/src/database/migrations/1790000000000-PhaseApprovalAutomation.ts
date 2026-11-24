import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aprovação de fase sem fluxo: quando pedir ('manual' | 'on_enter' | 'on_complete') e o que fazer
 * com o card depois da decisão (aprovada: 'stay' | 'next'; reprovada: 'stay' | 'previous' | 'close').
 * Os padrões são o comportamento de antes: pedido pelo botão e card parado.
 */
export class PhaseApprovalAutomation1790000000000 implements MigrationInterface {
  name = 'PhaseApprovalAutomation1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "approval_request" varchar(20) NOT NULL DEFAULT 'manual'`,
    );
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "approval_on_approved" varchar(20) NOT NULL DEFAULT 'stay'`,
    );
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "approval_on_rejected" varchar(20) NOT NULL DEFAULT 'stay'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "approval_on_rejected"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "approval_on_approved"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "approval_request"`);
  }
}
