import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ResponseIdempotencyAndFlowExecutionUniqueness1778815300000 implements MigrationInterface {
  name = 'ResponseIdempotencyAndFlowExecutionUniqueness1778815300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD "idempotency_key" character varying(120)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_submissions_form_id_idempotency_key" ON "submissions" ("form_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(`
      UPDATE "flow_executions" AS execution
      SET
        "submission_id" = NULL,
        "error_message" = CASE
          WHEN execution."error_message" IS NULL OR execution."error_message" = ''
            THEN 'Execução desvinculada por duplicidade antes da trava idempotente.'
          ELSE execution."error_message" || E'\nExecução desvinculada por duplicidade antes da trava idempotente.'
        END
      FROM (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "flow_id", "submission_id"
            ORDER BY "created_at" ASC, "id" ASC
          ) AS row_number
        FROM "flow_executions"
        WHERE "submission_id" IS NOT NULL
      ) AS duplicates
      WHERE execution."id" = duplicates."id"
        AND duplicates.row_number > 1
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_flow_executions_flow_submission" ON "flow_executions" ("flow_id", "submission_id") WHERE "submission_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_flow_executions_flow_submission"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_submissions_form_id_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "idempotency_key"`);
  }
}
