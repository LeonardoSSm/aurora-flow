import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'dashboard.view_forms_stats' (admin/manager=all, editor=own,
 * viewer=none), discovered while sweeping for leftover UserRole ladders
 * after Fase 5. `DashboardService.getStats()` (the summary `/dashboard/stats`
 * endpoint — distinct from `operational-stats`) had its own bespoke
 * `isPrivilegedUser`/`applyFormScope` role ladder, not covered by the Tier C
 * module list (which only named `operational-dashboard.service.ts`). Its
 * legacy behavior differs from `forms.view`'s own matrix (manager is fully
 * unrestricted here, not area-scoped), so reusing `forms.view` would have
 * silently narrowed what managers see — this dedicated permission preserves
 * today's exact boundary instead.
 */
export class DashboardViewFormsStatsPermission1786500000000 implements MigrationInterface {
  name = 'DashboardViewFormsStatsPermission1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'dashboard.view_forms_stats', 'all'),
      ('manager', 'dashboard.view_forms_stats', 'all'),
      ('editor', 'dashboard.view_forms_stats', 'own')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'dashboard.view_forms_stats'`,
    );
  }
}
