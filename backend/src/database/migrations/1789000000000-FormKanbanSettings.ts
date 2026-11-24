import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuração do Kanban por formulário (`{ cardValueField }`): qual campo aparece em R$ no card e
 * é somado no total da coluna. Nulo = card sem valor, como antes.
 */
export class FormKanbanSettings1789000000000 implements MigrationInterface {
  name = 'FormKanbanSettings1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "kanban_settings" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "forms" DROP COLUMN IF EXISTS "kanban_settings"`);
  }
}
