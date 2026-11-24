import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowScheduledTriggerColumns1785900000000 implements MigrationInterface {
  name = 'FlowScheduledTriggerColumns1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flows" ADD "next_run_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "flows" ADD "last_run_at" TIMESTAMPTZ`);
    await queryRunner.query(
      `ALTER TABLE "flows" ADD "consecutive_failure_count" INTEGER NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flows_next_run_at" ON "flows" ("next_run_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_flows_next_run_at"`);
    await queryRunner.query(`ALTER TABLE "flows" DROP COLUMN "consecutive_failure_count"`);
    await queryRunner.query(`ALTER TABLE "flows" DROP COLUMN "last_run_at"`);
    await queryRunner.query(`ALTER TABLE "flows" DROP COLUMN "next_run_at"`);
  }
}
