import type { MigrationInterface, QueryRunner } from "typeorm";

export class Attachments1779002648344 implements MigrationInterface {
    name = 'Attachments1779002648344'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "original_name" character varying(255) NOT NULL, "stored_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "size_bytes" integer NOT NULL, "storage_path" character varying(1000) NOT NULL, "storage_type" character varying(20) NOT NULL DEFAULT 'local', "solicitation_id" uuid, "submission_id" uuid, "uploaded_by_user_id" uuid, "is_public" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5e1f050bcff31e3084a1d662412" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_attachments_submission_id" ON "attachments" ("submission_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_attachments_solicitation_id" ON "attachments" ("solicitation_id") `);
        await queryRunner.query(`ALTER TABLE "attachments" ADD CONSTRAINT "FK_f0c53722102dbc58e8e309a71ed" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "attachments" ADD CONSTRAINT "FK_bd46773d489799c35febeaefb16" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "attachments" ADD CONSTRAINT "FK_0cd963ea6ef91dda206194e0ddb" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_0cd963ea6ef91dda206194e0ddb"`);
        await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_bd46773d489799c35febeaefb16"`);
        await queryRunner.query(`ALTER TABLE "attachments" DROP CONSTRAINT "FK_f0c53722102dbc58e8e309a71ed"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_attachments_solicitation_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_attachments_submission_id"`);
        await queryRunner.query(`DROP TABLE "attachments"`);
    }

}
