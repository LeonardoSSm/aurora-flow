import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase que só deixa o card avançar com os campos obrigatórios dela preenchidos. Desligada por
 * padrão: as fases que já existem continuam deixando o card sair como antes.
 */
export class PhaseRequireFieldsToExit1790400000000 implements MigrationInterface {
  name = 'PhaseRequireFieldsToExit1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "require_fields_to_exit" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "require_fields_to_exit"`);
  }
}
