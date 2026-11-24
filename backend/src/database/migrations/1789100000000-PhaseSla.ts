import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prazo (SLA) por fase do Kanban:
 * - kanban_phases: prazo em horas, se conta só horas úteis e o percentual de aviso. Nulo = sem prazo.
 * - solicitations: quando o card entrou na fase atual (cards existentes: a criação), o vencimento
 *   (com prorrogação) e o último estado avisado (alerta/vencido), para não repetir o aviso.
 * - solicitation_phase_periods: a linha do tempo do card, uma linha por passagem em cada fase.
 * As fases existentes começam sem prazo, então nenhum card existente fica "vencido" de repente.
 */
export class PhaseSla1789100000000 implements MigrationInterface {
  name = 'PhaseSla1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "sla_hours" integer`);
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "sla_business_hours" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "sla_warning_percent" integer`);

    await queryRunner.query(`ALTER TABLE "solicitations" ADD COLUMN IF NOT EXISTS "phase_entered_at" TIMESTAMP WITH TIME ZONE`);
    // Cards que já existem: entraram na fase atual quando foram criados (ou movidos — o histórico de
    // fase não guarda o instante exato; a criação é o melhor que há). created_at é "timestamp" sem
    // fuso gravado pelo now() do banco: convertido no fuso do próprio banco, vira o instante certo.
    await queryRunner.query(
      `UPDATE "solicitations" SET "phase_entered_at" = "created_at"::timestamptz WHERE "phase_entered_at" IS NULL`,
    );
    // Cards novos: o banco marca a entrada (timestamptz, sem depender do fuso do servidor da API).
    await queryRunner.query(`ALTER TABLE "solicitations" ALTER COLUMN "phase_entered_at" SET DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "solicitations" ADD COLUMN IF NOT EXISTS "phase_due_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "solicitations" ADD COLUMN IF NOT EXISTS "phase_sla_status" character varying(20)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "solicitation_phase_periods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "solicitation_id" uuid NOT NULL,
        "phase_id" uuid,
        "phase_label" character varying(180) NOT NULL,
        "entered_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "left_at" TIMESTAMP WITH TIME ZONE,
        "due_at" TIMESTAMP WITH TIME ZONE,
        "sla_business_hours" boolean NOT NULL DEFAULT false,
        "extended" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_solicitation_phase_periods" PRIMARY KEY ("id"),
        CONSTRAINT "FK_solicitation_phase_periods_solicitation" FOREIGN KEY ("solicitation_id")
          REFERENCES "solicitations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_solicitation_phase_periods_phase" FOREIGN KEY ("phase_id")
          REFERENCES "kanban_phases"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_solicitation_phase_periods_solicitation" ON "solicitation_phase_periods" ("solicitation_id", "entered_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "solicitation_phase_periods"`);
    await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN IF EXISTS "phase_sla_status"`);
    await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN IF EXISTS "phase_due_at"`);
    await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN IF EXISTS "phase_entered_at"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "sla_warning_percent"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "sla_business_hours"`);
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "sla_hours"`);
  }
}
