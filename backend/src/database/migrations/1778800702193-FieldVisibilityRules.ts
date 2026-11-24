import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldVisibilityRules1778800702193 implements MigrationInterface {
  name = 'FieldVisibilityRules1778800702193';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_fields" ADD "visibility_rules" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_fields" DROP COLUMN "visibility_rules"`);
  }
}
