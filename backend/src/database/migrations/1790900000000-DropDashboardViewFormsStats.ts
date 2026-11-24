import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tira `dashboard.view_forms_stats` dos perfis. Com o acesso por processo, o resumo do Início
 * (`DashboardService.getStats`) conta os processos pelo vínculo da pessoa e mostra respostas só dos
 * processos em que ela pode ver respostas; a permissão do perfil deixou de ser consultada e só
 * aparecia na tela de perfis sem efeito nenhum.
 *
 * As linhas apagadas ficam em `role_permissions_rollback_1790900000000` e o `down` as devolve como
 * eram (inclusive em perfis personalizados) — o código anterior ainda lê essa permissão.
 */
export class DropDashboardViewFormsStats1790900000000 implements MigrationInterface {
  name = 'DropDashboardViewFormsStats1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions_rollback_1790900000000" (
        "role_id" character varying(40) NOT NULL,
        "permission_code" character varying(80) NOT NULL,
        "scope" character varying(10) NOT NULL,
        PRIMARY KEY ("role_id", "permission_code")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions_rollback_1790900000000" ("role_id", "permission_code", "scope")
      SELECT "role_id", "permission_code", "scope" FROM "role_permissions"
       WHERE "permission_code" = 'dashboard.view_forms_stats'
      ON CONFLICT ("role_id", "permission_code") DO UPDATE SET "scope" = EXCLUDED."scope"
    `);
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_code" = 'dashboard.view_forms_stats'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ exists }] = (await queryRunner.query(
      `SELECT to_regclass('public.role_permissions_rollback_1790900000000') IS NOT NULL AS "exists"`,
    )) as Array<{ exists: boolean }>;
    if (!exists) {
      // Base migrada sem a cópia: volta o padrão da migration que criou a permissão (1786500000000).
      await queryRunner.query(`
        INSERT INTO "role_permissions" ("role_id", "permission_code", "scope")
        SELECT "code", 'dashboard.view_forms_stats', CASE "code" WHEN 'editor' THEN 'own' ELSE 'all' END
          FROM "roles"
         WHERE "code" IN ('admin', 'manager', 'editor')
        ON CONFLICT ("role_id", "permission_code") DO NOTHING
      `);
      return;
    }
    // Perfis apagados depois do deploy não voltam (o JOIN com roles os deixa de fora).
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope")
      SELECT b."role_id", b."permission_code", b."scope"
        FROM "role_permissions_rollback_1790900000000" b
        JOIN "roles" r ON r."code" = b."role_id"
      ON CONFLICT ("role_id", "permission_code") DO NOTHING
    `);
    await queryRunner.query(`DROP TABLE "role_permissions_rollback_1790900000000"`);
  }
}
