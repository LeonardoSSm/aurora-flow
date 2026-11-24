import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NullableFlowFormId1778815100000 implements MigrationInterface {
  name = 'NullableFlowFormId1778815100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flows" DROP CONSTRAINT "FK_78c84e9a33aa04e2a8c10b50659"`);
    await queryRunner.query(`ALTER TABLE "flows" ALTER COLUMN "form_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "flows" ADD CONSTRAINT "FK_78c84e9a33aa04e2a8c10b50659" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flows" DROP CONSTRAINT "FK_78c84e9a33aa04e2a8c10b50659"`);
    await queryRunner.query(`DELETE FROM "flows" WHERE "form_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "flows" ALTER COLUMN "form_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "flows" ADD CONSTRAINT "FK_78c84e9a33aa04e2a8c10b50659" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
