import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Quem atua" e "quem aprova" na fase passam a aceitar vários perfis e usuários (jsonb
 * `{ roleCodes, userIds }`). Copia o perfil único que existia (actor_role_code /
 * approver_role_code) para o formato novo; as colunas antigas continuam existindo e são mantidas
 * com o primeiro perfil, para o app móvel já instalado seguir funcionando.
 */
export class KanbanPhaseActorsApprovers1788900000000 implements MigrationInterface {
  name = 'KanbanPhaseActorsApprovers1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "actors" jsonb`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "approvers" jsonb`);
    await queryRunner.query(`
      UPDATE "kanban_phases"
         SET "actors" = jsonb_build_object('roleCodes', jsonb_build_array("actor_role_code"), 'userIds', '[]'::jsonb)
       WHERE "actor_role_code" IS NOT NULL AND "actors" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "kanban_phases"
         SET "approvers" = jsonb_build_object('roleCodes', jsonb_build_array("approver_role_code"), 'userIds', '[]'::jsonb)
       WHERE "approver_role_code" IS NOT NULL AND "approvers" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "approvers"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "actors"`);
  }
}
