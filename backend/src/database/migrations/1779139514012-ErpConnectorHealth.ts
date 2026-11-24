import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpConnectorHealth1779139514012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE erp_connectors
        ADD COLUMN IF NOT EXISTS last_health_check jsonb NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_health_checked_at timestamptz NULL DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE erp_connectors
        DROP COLUMN IF EXISTS last_health_check,
        DROP COLUMN IF EXISTS last_health_checked_at
    `);
  }
}
