import type { MigrationInterface, QueryRunner } from "typeorm";

export class SolicitationTrackingToken1779005934680 implements MigrationInterface {
    name = 'SolicitationTrackingToken1779005934680'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "tracking_token" uuid`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "UQ_32fbbd99ad61e99c3273e3bdec5" UNIQUE ("tracking_token")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "UQ_32fbbd99ad61e99c3273e3bdec5"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "tracking_token"`);
    }

}
