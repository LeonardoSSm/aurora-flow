import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpConnectorAuthTypes1779140244729 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE erp_connectors
        ADD COLUMN IF NOT EXISTS auth_type         varchar(30)  NOT NULL DEFAULT 'bearer_static',
        ADD COLUMN IF NOT EXISTS refresh_credentials text        NULL,
        ADD COLUMN IF NOT EXISTS token_expires_at  timestamptz  NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE erp_connectors
        DROP COLUMN IF EXISTS auth_type,
        DROP COLUMN IF EXISTS refresh_credentials,
        DROP COLUMN IF EXISTS token_expires_at
    `);
  }
}
