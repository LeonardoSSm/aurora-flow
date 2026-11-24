import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ramificação no formulário da fase: o caminho entre as seções (cada campo "Título" abre uma)
 * fica em `section_flow`. Nulo = como era, todas as seções em ordem.
 */
export class PhaseSectionFlow1789400000000 implements MigrationInterface {
  name = 'PhaseSectionFlow1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "section_flow" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "section_flow"`);
  }
}
