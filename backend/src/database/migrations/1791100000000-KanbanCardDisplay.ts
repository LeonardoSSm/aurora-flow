import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O que o card do Kanban mostra em cada fase: padrão da fase (kanban_phases.card_display) e o
 * ajuste pessoal de cada usuário (user_kanban_card_displays). Nulo/sem linha = padrão do sistema,
 * igual ao card de antes, então nada muda para quem não configurar.
 */
export class KanbanCardDisplay1791100000000 implements MigrationInterface {
  name = 'KanbanCardDisplay1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "card_display" jsonb`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_kanban_card_displays" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "phase_id" uuid NOT NULL,
        "config" jsonb NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_kanban_card_displays" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_kanban_card_displays_user_phase" UNIQUE ("user_id", "phase_id"),
        CONSTRAINT "FK_user_kanban_card_displays_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_kanban_card_displays_phase_id" FOREIGN KEY ("phase_id")
          REFERENCES "kanban_phases"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_kanban_card_displays"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "card_display"`);
  }
}
