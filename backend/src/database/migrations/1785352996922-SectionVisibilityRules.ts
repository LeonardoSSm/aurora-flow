import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SectionVisibilityRules1785352996922 implements MigrationInterface {
  name = 'SectionVisibilityRules1785352996922';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_sections" ADD "visibility_rules" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_sections" DROP COLUMN "visibility_rules"`);
  }
}
