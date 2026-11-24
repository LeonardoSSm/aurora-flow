import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'responses.view_detail' (admin/manager/editor; no viewer), discovered
 * while migrating GET /responses/:id in Tier C. That endpoint's service
 * method has zero per-record scoping (`findOne(id)` with no form/ownership
 * check at all) — the ONLY existing security boundary is the coarse
 * @Roles(ADMIN, MANAGER, EDITOR) gate. Mapping it onto 'responses.view'
 * (whose scope for viewer is 'assigned', not 'none') would have newly let
 * viewers reach an endpoint with no further checks, a real widening — this
 * dedicated permission preserves today's exact boundary instead.
 */
export class ResponsesViewDetailPermission1786300000000 implements MigrationInterface {
  name = 'ResponsesViewDetailPermission1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'responses.view_detail', 'all'),
      ('manager', 'responses.view_detail', 'all'),
      ('editor', 'responses.view_detail', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'responses.view_detail'`,
    );
  }
}
