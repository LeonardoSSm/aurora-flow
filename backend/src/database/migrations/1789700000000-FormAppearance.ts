import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cor e ícone do processo nos cards do modo simplificado (`{ color, icon }`). Nulo = padrão.
 */
export class FormAppearance1789700000000 implements MigrationInterface {
  name = 'FormAppearance1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "appearance" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "forms" DROP COLUMN IF EXISTS "appearance"`);
  }
}
