import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an approval be scoped to one phase-visit of a solicitation instead of
 * the whole solicitation (`approvals.phase_id`), and lets an approval step be
 * routed to "anyone holding role X" instead of a single named user
 * (`approval_steps.assigned_role_code`). Exactly one of assigned_user_id /
 * assigned_role_code must be set — enforced at the DB level so a bad row
 * can't silently become unclaimable.
 *
 * `assigned_role_code` uses ON DELETE NO ACTION (not SET NULL) matching the
 * `users.role` FK precedent in RolesAndPermissions: SET NULL would let
 * deleting a role in use null out assigned_role_code while assigned_user_id
 * is also null, violating the CHECK below with a confusing DB error instead
 * of a clean "role still in use" failure.
 */
export class ApprovalPhaseScoping1788000000000 implements MigrationInterface {
  name = 'ApprovalPhaseScoping1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "approvals" ADD "phase_id" uuid`);
    await queryRunner.query(`
      ALTER TABLE "approvals" ADD CONSTRAINT "FK_approvals_phase_id"
      FOREIGN KEY ("phase_id") REFERENCES "kanban_phases"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_approvals_phase_id" ON "approvals" ("phase_id")`);

    await queryRunner.query(
      `ALTER TABLE "approval_steps" ADD "assigned_role_code" character varying(40)`,
    );
    await queryRunner.query(`
      ALTER TABLE "approval_steps" ADD CONSTRAINT "FK_approval_steps_assigned_role_code"
      FOREIGN KEY ("assigned_role_code") REFERENCES "roles"("code") ON DELETE NO ACTION ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "approval_steps" ADD CONSTRAINT "CHK_approval_steps_assignee_xor"
      CHECK (
        ("assigned_user_id" IS NOT NULL AND "assigned_role_code" IS NULL) OR
        ("assigned_user_id" IS NULL AND "assigned_role_code" IS NOT NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "approval_steps" DROP CONSTRAINT "CHK_approval_steps_assignee_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "approval_steps" DROP CONSTRAINT "FK_approval_steps_assigned_role_code"`,
    );
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP COLUMN "assigned_role_code"`);

    await queryRunner.query(`DROP INDEX "IDX_approvals_phase_id"`);
    await queryRunner.query(`ALTER TABLE "approvals" DROP CONSTRAINT "FK_approvals_phase_id"`);
    await queryRunner.query(`ALTER TABLE "approvals" DROP COLUMN "phase_id"`);
  }
}
