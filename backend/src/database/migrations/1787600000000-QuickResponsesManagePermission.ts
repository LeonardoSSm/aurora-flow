import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'quick_responses.manage' (admin/manager/editor; no viewer), mirroring
 * the exact grant matrix of 'kanban_phases.manage' — both gate a per-form
 * builder tab whose PUT replaces the whole configured list. Added as a new
 * migration rather than editing the already-applied RolesAndPermissions one.
 */
export class QuickResponsesManagePermission1787600000000 implements MigrationInterface {
  name = 'QuickResponsesManagePermission1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'quick_responses.manage', 'all'),
      ('manager', 'quick_responses.manage', 'all'),
      ('editor', 'quick_responses.manage', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'quick_responses.manage'`,
    );
  }
}
