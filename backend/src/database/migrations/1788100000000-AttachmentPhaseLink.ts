import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ties an attachment to the specific Kanban phase-visit it was captured for
 * (e.g. the packaging-date photo uploaded during a "requires approval" phase),
 * so a phase-scoped approval can look up exactly the right photo instead of
 * every attachment on the solicitation.
 */
export class AttachmentPhaseLink1788100000000 implements MigrationInterface {
  name = 'AttachmentPhaseLink1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" ADD "phase_id" uuid`);
    await queryRunner.query(`
      ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_phase_id"
      FOREIGN KEY ("phase_id") REFERENCES "kanban_phases"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`CREATE INDEX "IDX_attachments_phase_id" ON "attachments" ("phase_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_attachments_phase_id"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_attachments_phase_id"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "phase_id"`);
  }
}
