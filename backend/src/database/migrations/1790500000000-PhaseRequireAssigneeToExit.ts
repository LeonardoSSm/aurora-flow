import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase que só deixa o card avançar com alguém atribuído (responsável). Desligada por padrão: as
 * fases que já existem continuam deixando o card sair como antes.
 */
export class PhaseRequireAssigneeToExit1790500000000 implements MigrationInterface {
  name = 'PhaseRequireAssigneeToExit1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "require_assignee_to_exit" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "require_assignee_to_exit"`);
  }
}
