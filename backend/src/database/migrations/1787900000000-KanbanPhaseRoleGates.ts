import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a Kanban phase declare (a) which role is expected to act on it
 * (`actor_role_code`) and (b) whether leaving it requires an approval decided
 * by a specific role (`requires_approval` + `approver_role_code`). This is
 * the generic "step needs a specific role, optionally gated by that role's
 * approval" primitive multi-step operator/supervisor processes (e.g. dating
 * packaging batches) are built from — see ApprovalPhaseScoping for the other
 * half (approvals routable by role and scoped to a phase).
 */
export class KanbanPhaseRoleGates1787900000000 implements MigrationInterface {
  name = 'KanbanPhaseRoleGates1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD "actor_role_code" character varying(40)`);
    await queryRunner.query(`
      ALTER TABLE "kanban_phases" ADD CONSTRAINT "FK_kanban_phases_actor_role_code"
      FOREIGN KEY ("actor_role_code") REFERENCES "roles"("code") ON DELETE SET NULL ON UPDATE CASCADE
    `);
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD "requires_approval" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD "approver_role_code" character varying(40)`);
    await queryRunner.query(`
      ALTER TABLE "kanban_phases" ADD CONSTRAINT "FK_kanban_phases_approver_role_code"
      FOREIGN KEY ("approver_role_code") REFERENCES "roles"("code") ON DELETE SET NULL ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" DROP CONSTRAINT "FK_kanban_phases_approver_role_code"`,
    );
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN "approver_role_code"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN "requires_approval"`);
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" DROP CONSTRAINT "FK_kanban_phases_actor_role_code"`,
    );
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN "actor_role_code"`);
  }
}
