import type { MigrationInterface, QueryRunner } from "typeorm";

export class AreasAndGovernance1778907319940 implements MigrationInterface {
    name = 'AreasAndGovernance1778907319940'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "areas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(180) NOT NULL, "code" character varying(20), "description" text, "parent_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5110493f6342f34c978c084d0d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD "area_id" uuid`);
        await queryRunner.query(`ALTER TABLE "forms" ADD "area_id" uuid`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "area_id" uuid`);
        await queryRunner.query(`ALTER TABLE "areas" ADD CONSTRAINT "FK_86373c0dc23df246c2b6ac977c3" FOREIGN KEY ("parent_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_bb8cbcf3ff9a3a987b63a763139" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "forms" ADD CONSTRAINT "FK_417c63d675023d9b3f83537633c" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "forms" DROP CONSTRAINT "FK_417c63d675023d9b3f83537633c"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_bb8cbcf3ff9a3a987b63a763139"`);
        await queryRunner.query(`ALTER TABLE "areas" DROP CONSTRAINT "FK_86373c0dc23df246c2b6ac977c3"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "area_id"`);
        await queryRunner.query(`ALTER TABLE "forms" DROP COLUMN "area_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "area_id"`);
        await queryRunner.query(`DROP TABLE "areas"`);
    }

}
