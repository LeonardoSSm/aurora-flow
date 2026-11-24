import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'solicitations.regenerate_token' (admin/manager only), discovered
 * while migrating solicitations.controller.ts in Tier C — reusing
 * 'solicitations.manage' (granted to editor with scope 'own') would have
 * widened tracking-token regeneration to editors, beyond today's
 * @Roles(ADMIN, MANAGER) gate.
 */
export class SolicitationsRegenerateTokenPermission1786400000000 implements MigrationInterface {
  name = 'SolicitationsRegenerateTokenPermission1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'solicitations.regenerate_token', 'all'),
      ('manager', 'solicitations.regenerate_token', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'solicitations.regenerate_token'`,
    );
  }
}
