import type { MigrationInterface, QueryRunner } from 'typeorm';

export class KanbanPhaseIsTerminal1786600000000 implements MigrationInterface {
  name = 'KanbanPhaseIsTerminal1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD "is_terminal" boolean NOT NULL DEFAULT false`,
    );

    // Best-effort backfill: phases created before this column existed commonly
    // reused the standard status labels (Concluído/Rejeitado/Cancelado) to
    // represent finished work. Flag those so existing boards don't regress.
    await queryRunner.query(
      `UPDATE "kanban_phases" SET "is_terminal" = true
       WHERE "label" ILIKE '%conclu%' OR "label" ILIKE '%rejeit%' OR "label" ILIKE '%cancel%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN "is_terminal"`);
  }
}
