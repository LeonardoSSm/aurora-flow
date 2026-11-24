import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Solicitations1778815400000 implements MigrationInterface {
  name = 'Solicitations1778815400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "solicitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(180) NOT NULL, "description" text, "status" character varying(30) NOT NULL DEFAULT 'open', "priority" character varying(20) NOT NULL DEFAULT 'medium', "origin_type" character varying(40) NOT NULL DEFAULT 'manual', "form_id" uuid, "submission_id" uuid, "created_by" uuid, "assignee_id" uuid, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_solicitations_form_submission_origin" CHECK ("origin_type" <> 'form_submission' OR ("form_id" IS NOT NULL AND "submission_id" IS NOT NULL)), CONSTRAINT "PK_solicitations" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitations_status_priority" ON "solicitations" ("status", "priority") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitations_form_id" ON "solicitations" ("form_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitations_assignee_id" ON "solicitations" ("assignee_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitations_created_at" ON "solicitations" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_solicitations_form_submission" ON "solicitations" ("submission_id") WHERE "origin_type" = 'form_submission' AND "submission_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "solicitation_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "solicitation_id" uuid NOT NULL, "event_type" character varying(40) NOT NULL, "actor_id" uuid, "from_value" character varying(120), "to_value" character varying(120), "message" text, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_solicitation_history" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitation_history_solicitation_created_at" ON "solicitation_history" ("solicitation_id", "created_at") `,
    );

    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_form_id" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_submission_id" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_assignee_id" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_history" ADD CONSTRAINT "FK_solicitation_history_solicitation_id" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_history" ADD CONSTRAINT "FK_solicitation_history_actor_id" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "solicitation_history" DROP CONSTRAINT "FK_solicitation_history_actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_history" DROP CONSTRAINT "FK_solicitation_history_solicitation_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_assignee_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_submission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_form_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_solicitation_history_solicitation_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "solicitation_history"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_solicitations_form_submission"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_solicitations_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_solicitations_assignee_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_solicitations_form_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_solicitations_status_priority"`);
    await queryRunner.query(`DROP TABLE "solicitations"`);
  }
}
