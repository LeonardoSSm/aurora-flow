import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SubmissionAuditFields1778174474562 implements MigrationInterface {
  name = 'SubmissionAuditFields1778174474562';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "updated_at"`);
  }
}
