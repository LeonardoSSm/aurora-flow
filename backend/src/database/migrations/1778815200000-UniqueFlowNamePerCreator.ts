import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueFlowNamePerCreator1778815200000 implements MigrationInterface {
  name = 'UniqueFlowNamePerCreator1778815200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH duplicated AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY created_by, LOWER(BTRIM(name))
            ORDER BY created_at ASC, id ASC
          ) AS row_number
        FROM "flows"
      )
      UPDATE "flows" flow
      SET "name" = LEFT(BTRIM(flow."name"), 139) || ' (' || SUBSTRING(flow."id"::text FROM 1 FOR 8) || ')'
      FROM duplicated
      WHERE flow."id" = duplicated.id
        AND duplicated.row_number > 1
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_flows_created_by_name" ON "flows" ("created_by", LOWER(BTRIM("name")))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_flows_created_by_name"`);
  }
}
