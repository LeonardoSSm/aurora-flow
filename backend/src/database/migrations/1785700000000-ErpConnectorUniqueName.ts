import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpConnectorUniqueName1785700000000 implements MigrationInterface {
  name = 'ErpConnectorUniqueName1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_erp_connectors_name" ON "erp_connectors" ("name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_erp_connectors_name"`);
  }
}
