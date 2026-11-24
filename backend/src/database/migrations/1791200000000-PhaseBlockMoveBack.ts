import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase "ponto sem volta": depois que o card chega a ela, as pessoas não o devolvem para uma fase
 * anterior. Desligada por padrão: as fases que já existem continuam deixando o card voltar.
 */
export class PhaseBlockMoveBack1791200000000 implements MigrationInterface {
  name = 'PhaseBlockMoveBack1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD COLUMN IF NOT EXISTS "block_move_back" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kanban_phases" DROP COLUMN IF EXISTS "block_move_back"`);
  }
}
