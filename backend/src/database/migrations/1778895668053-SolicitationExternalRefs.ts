import type { MigrationInterface, QueryRunner } from "typeorm";

export class SolicitationExternalRefs1778895668053 implements MigrationInterface {
    name = 'SolicitationExternalRefs1778895668053'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "external_refs" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "external_refs"`);
    }

}
