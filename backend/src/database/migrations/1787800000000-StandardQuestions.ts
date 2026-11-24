import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces "Respostas rápidas" (canned reply text) with "Perguntas padrão":
 * typed questions configured per form that the attendant answers inside the
 * solicitation itself, saved alongside it — same shape as kanban_phase_fields
 * / kanban_phase_field_values, minus the phase scoping, so it works regardless
 * of whether the form's Kanban uses phases or the default status board.
 *
 * form_quick_response(_group)s and 'quick_responses.manage' were added by
 * 1787500000000/1787600000000 but never deployed — dropped here rather than
 * editing those migrations in place, since they already ran locally and may
 * have run anywhere else main was pulled.
 */
export class StandardQuestions1787800000000 implements MigrationInterface {
  name = 'StandardQuestions1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "form_quick_responses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "form_quick_response_groups"`);
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'quick_responses.manage'`,
    );

    await queryRunner.query(
      `CREATE TABLE "form_standard_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "code" character varying(120) NOT NULL,
        "label" character varying(180) NOT NULL,
        "field_type" character varying(30) NOT NULL,
        "required" boolean NOT NULL DEFAULT false,
        "order" integer NOT NULL,
        "settings_json" jsonb,
        "options_json" jsonb,
        CONSTRAINT "PK_form_standard_questions" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_form_standard_questions_form_id" ON "form_standard_questions" ("form_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_standard_questions" ADD CONSTRAINT "FK_fsq_form" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "solicitation_standard_answers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "solicitation_id" uuid NOT NULL,
        "question_id" uuid,
        "field_code" character varying(120) NOT NULL,
        "value_text" text,
        "value_number" double precision,
        "value_boolean" boolean,
        "value_json" jsonb,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_solicitation_standard_answers" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ssa_solicitation_id" ON "solicitation_standard_answers" ("solicitation_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ssa_solicitation_question" ON "solicitation_standard_answers" ("solicitation_id", "question_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_standard_answers" ADD CONSTRAINT "FK_ssa_solicitation" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_standard_answers" ADD CONSTRAINT "FK_ssa_question" FOREIGN KEY ("question_id") REFERENCES "form_standard_questions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Mirrors kanban_phases.manage's exact grant matrix (admin/manager/editor
    // 'all', no viewer) — same shape of permission, same builder-tab gate.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'standard_questions.manage', 'all'),
      ('manager', 'standard_questions.manage', 'all'),
      ('editor', 'standard_questions.manage', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'standard_questions.manage'`,
    );
    await queryRunner.query(`DROP TABLE "solicitation_standard_answers"`);
    await queryRunner.query(`DROP TABLE "form_standard_questions"`);
  }
}
