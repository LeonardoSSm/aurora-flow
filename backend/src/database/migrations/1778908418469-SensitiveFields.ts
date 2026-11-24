import type { MigrationInterface, QueryRunner } from "typeorm";

export class SensitiveFields1778908418469 implements MigrationInterface {
    name = 'SensitiveFields1778908418469'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "form_fields" ADD "is_sensitive" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "form_fields" DROP COLUMN "is_sensitive"`);
    }

}
