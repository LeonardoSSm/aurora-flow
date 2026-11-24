import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 'ai.copilot.use': criar processos pela LOPS IA (rotas /ai). Só admin e gerente de início — quem
 * monta processos; outros perfis ganham pela tela de perfis. A IA age sempre com as permissões da
 * própria pessoa, então ela ainda precisa de forms.create, kanban_phases.manage e flows.manage.
 */
export class AiCopilotPermission1789500000000 implements MigrationInterface {
  name = 'AiCopilotPermission1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope")
      SELECT r."code", 'ai.copilot.use', 'all' FROM "roles" r
      WHERE r."code" IN ('admin', 'manager')
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp
          WHERE rp."role_id" = r."code" AND rp."permission_code" = 'ai.copilot.use'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_code" = 'ai.copilot.use'`);
  }
}
