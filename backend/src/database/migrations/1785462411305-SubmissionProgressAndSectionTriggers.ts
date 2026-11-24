import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SubmissionProgressAndSectionTriggers1785462411305 implements MigrationInterface {
  name = 'SubmissionProgressAndSectionTriggers1785462411305';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "submission_progress" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "form_version_id" uuid NOT NULL,
        "answers_json" jsonb NOT NULL DEFAULT '{}',
        "visited_section_ids" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_submission_progress" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_progress" ADD CONSTRAINT "FK_submission_progress_form" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_progress" ADD CONSTRAINT "FK_submission_progress_version" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "automation_rules" ADD "target_section_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_target_section" FOREIGN KEY ("target_section_id") REFERENCES "form_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "automation_executions" ADD "progress_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "automation_executions" ADD CONSTRAINT "FK_automation_executions_progress" FOREIGN KEY ("progress_id") REFERENCES "submission_progress"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "automation_executions" DROP CONSTRAINT "FK_automation_executions_progress"`,
    );
    await queryRunner.query(`ALTER TABLE "automation_executions" DROP COLUMN "progress_id"`);

    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_automation_rules_target_section"`,
    );
    await queryRunner.query(`ALTER TABLE "automation_rules" DROP COLUMN "target_section_id"`);

    await queryRunner.query(`DROP TABLE "submission_progress"`);
  }
}
