import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds two permissions discovered missing while migrating Tier A
 * controllers (1786000000000-RolesAndPermissions didn't seed them):
 *
 * - 'integrations.manage_channels': WhatsApp/GLPI/Webhooks/form Connectors —
 *   Manager already has full access today (unlike the ERP admin surface,
 *   where Manager only sees logs/health via 'integrations.view_logs').
 * - 'observability.view_metrics': admin/metrics summary — Manager already
 *   has access today, same as the ERP logs/health split.
 * - 'system.maintenance': the strictly-admin-only maintenance endpoints
 *   (google-sync-admin, sla-admin, admin-seed) that don't fit any of the
 *   more specific module permissions.
 *
 * Added as a new migration rather than editing the already-applied one.
 */
export class IntegrationsManageChannelsPermission1786100000000 implements MigrationInterface {
  name = 'IntegrationsManageChannelsPermission1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'integrations.manage_channels', 'all'),
      ('manager', 'integrations.manage_channels', 'all'),
      ('admin', 'observability.view_metrics', 'all'),
      ('manager', 'observability.view_metrics', 'all'),
      ('admin', 'system.maintenance', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" IN ('integrations.manage_channels', 'observability.view_metrics', 'system.maintenance')`,
    );
  }
}
