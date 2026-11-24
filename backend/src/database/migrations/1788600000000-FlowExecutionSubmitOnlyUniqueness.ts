import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A trava "um fluxo por submissão" (UQ_flow_executions_flow_submission) valia para qualquer
 * evento que carregasse a submissão de origem. Com isso, um fluxo de "solicitação movida",
 * "anexo enviado", "campos da fase salvos" etc. só rodava na PRIMEIRA ocorrência para cada
 * solicitação — as seguintes eram descartadas como duplicata (Diagnóstico P-01).
 *
 * A trava passa a valer só para `responses.submitted`, onde ela é a idempotência pretendida
 * (o mesmo envio entregue duas vezes executa o fluxo uma vez). As execuções continuam guardando
 * `submission_id` em todos os eventos.
 */
export class FlowExecutionSubmitOnlyUniqueness1788600000000 implements MigrationInterface {
  name = 'FlowExecutionSubmitOnlyUniqueness1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_flow_executions_flow_submission"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_flow_executions_flow_submission" ON "flow_executions" ("flow_id", "submission_id") WHERE "submission_id" IS NOT NULL AND "event_name" = 'responses.submitted'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // O índice antigo não aceita duas execuções do mesmo fluxo para a mesma submissão, o que passou
    // a existir com o novo. Mantém a mais antiga e desvincula as demais, como a migration original.
    await queryRunner.query(`
      UPDATE "flow_executions" AS execution
      SET
        "submission_id" = NULL,
        "error_message" = CASE
          WHEN execution."error_message" IS NULL OR execution."error_message" = ''
            THEN 'Execução desvinculada ao reverter a trava por submissão.'
          ELSE execution."error_message" || E'\nExecução desvinculada ao reverter a trava por submissão.'
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
    await queryRunner.query(`DROP INDEX "public"."UQ_flow_executions_flow_submission"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_flow_executions_flow_submission" ON "flow_executions" ("flow_id", "submission_id") WHERE "submission_id" IS NOT NULL`,
    );
  }
}
