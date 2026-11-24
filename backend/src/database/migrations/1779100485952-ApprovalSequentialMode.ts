import type { MigrationInterface, QueryRunner } from "typeorm";

export class ApprovalSequentialMode1779100485952 implements MigrationInterface {
    name = 'ApprovalSequentialMode1779100485952'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "approvals" ADD "mode" character varying(20) NOT NULL DEFAULT 'parallel'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "approvals" DROP COLUMN "mode"`);
    }

}
