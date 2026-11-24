import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SolicitationWebhookIdempotencyKey1785800000000 implements MigrationInterface {
  name = 'SolicitationWebhookIdempotencyKey1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD "idempotency_key" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_solicitations_webhook_idempotency_key" ON "solicitations" ("idempotency_key") WHERE "origin_type" = 'webhook' AND "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_solicitations_webhook_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "idempotency_key"`);
  }
}
