import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Visível para" nas fases do Kanban: perfis, áreas e usuários que veem a fase. Nulo = todos com
 * acesso ao formulário (comportamento de antes), então as fases existentes não mudam.
 */
export class KanbanPhaseVisibility1788800000000 implements MigrationInterface {
  name = 'KanbanPhaseVisibility1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "visible_to" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "visible_to"`);
  }
}
