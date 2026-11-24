import type { MigrationInterface, QueryRunner } from "typeorm";

export class FillSolicitationTrackingTokens1779110000000 implements MigrationInterface {
    name = 'FillSolicitationTrackingTokens1779110000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE solicitations
            SET tracking_token = gen_random_uuid()
            WHERE tracking_token IS NULL
        `);
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        // irreversível intencionalmente: não é possível saber quais tokens eram NULL antes
    }

}
