import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomationRules1778783727962 implements MigrationInterface {
  name = 'AutomationRules1778783727962';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "automation_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "trigger" character varying(50) NOT NULL DEFAULT 'on_submission', "conditions" jsonb, "actions" jsonb NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_378bed501eacc036895837121c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_rules_form_id" ON "automation_rules" ("form_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "automation_executions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rule_id" uuid NOT NULL, "submission_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'pending', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "completed_at" TIMESTAMP WITH TIME ZONE, "error_message" character varying(1000), "actions_executed" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dc450e9c9835c88bb3d5abec4c6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_executions_rule_id" ON "automation_executions" ("rule_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "message" character varying(500) NOT NULL, "is_read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_id_created_at" ON "notifications" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_afb8daaf697f94eac689abac213" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" ADD CONSTRAINT "FK_2e22d2fd8fcca4d5b3d07918452" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" ADD CONSTRAINT "FK_8044c8cf950e85d21e7f9782035" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" DROP CONSTRAINT "FK_8044c8cf950e85d21e7f9782035"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" DROP CONSTRAINT "FK_2e22d2fd8fcca4d5b3d07918452"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_afb8daaf697f94eac689abac213"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_user_id_created_at"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_automation_executions_rule_id"`);
    await queryRunner.query(`DROP TABLE "automation_executions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_automation_rules_form_id"`);
    await queryRunner.query(`DROP TABLE "automation_rules"`);
  }
}
