import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Filtro de cards da fase pela resposta (perfis/usuários que veem os cards com um valor num
 * campo). Nulo = sem filtro (comportamento de antes), então as fases existentes não mudam.
 */
export class KanbanPhaseCardVisibility1791000000000 implements MigrationInterface {
  name = 'KanbanPhaseCardVisibility1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "card_visibility" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "card_visibility"`);
  }
}
