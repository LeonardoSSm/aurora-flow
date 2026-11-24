import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Encaminhar para outro processo: o card criado no processo de destino guarda de qual card veio.
 * Apagar o card de origem não apaga o encaminhado — só solta o vínculo.
 */
export class SolicitationSourceLink1791600000000 implements MigrationInterface {
  name = 'SolicitationSourceLink1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD COLUMN IF NOT EXISTS "source_solicitation_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "solicitations"
          ADD CONSTRAINT "FK_solicitations_source_solicitation"
          FOREIGN KEY ("source_solicitation_id") REFERENCES "solicitations"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_solicitations_source_solicitation_id" ON "solicitations" ("source_solicitation_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_solicitations_source_solicitation_id"`);
    await queryRunner.query(
      `ALTER TABLE "solicitations" DROP CONSTRAINT IF EXISTS "FK_solicitations_source_solicitation"`,
    );
    await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN IF EXISTS "source_solicitation_id"`);
  }
}
