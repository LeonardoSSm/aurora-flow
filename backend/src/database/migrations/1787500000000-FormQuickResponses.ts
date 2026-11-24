import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FormQuickResponses1787500000000 implements MigrationInterface {
  name = 'FormQuickResponses1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "form_quick_response_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "label" character varying(160) NOT NULL,
        "order" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_form_quick_response_groups" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_form_quick_response_groups_form_id" ON "form_quick_response_groups" ("form_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_quick_response_groups" ADD CONSTRAINT "FK_form_quick_response_groups_form" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "form_quick_responses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "group_id" uuid NOT NULL,
        "label" character varying(120) NOT NULL,
        "body" text NOT NULL,
        "order" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_quick_responses" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_form_quick_responses_group_id" ON "form_quick_responses" ("group_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_quick_responses" ADD CONSTRAINT "FK_form_quick_responses_group" FOREIGN KEY ("group_id") REFERENCES "form_quick_response_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "form_quick_responses"`);
    await queryRunner.query(`DROP TABLE "form_quick_response_groups"`);
  }
}
