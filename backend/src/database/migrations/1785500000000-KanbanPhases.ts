import type { MigrationInterface, QueryRunner } from 'typeorm';

export class KanbanPhases1785500000000 implements MigrationInterface {
  name = 'KanbanPhases1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "kanban_phases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "key" character varying(120) NOT NULL,
        "label" character varying(180) NOT NULL,
        "color" character varying(30) NOT NULL DEFAULT 'blue',
        "description" text,
        "order" integer NOT NULL,
        CONSTRAINT "PK_kanban_phases" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_kanban_phases_form_id" ON "kanban_phases" ("form_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "kanban_phases" ADD CONSTRAINT "FK_kanban_phases_form" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "kanban_phase_fields" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phase_id" uuid NOT NULL,
        "code" character varying(120) NOT NULL,
        "label" character varying(180) NOT NULL,
        "field_type" character varying(30) NOT NULL,
        "required" boolean NOT NULL DEFAULT false,
        "order" integer NOT NULL,
        "settings_json" jsonb,
        "options_json" jsonb,
        CONSTRAINT "PK_kanban_phase_fields" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_kanban_phase_fields_phase_id" ON "kanban_phase_fields" ("phase_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "kanban_phase_fields" ADD CONSTRAINT "FK_kpf_phase" FOREIGN KEY ("phase_id") REFERENCES "kanban_phases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "kanban_phase_field_values" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "solicitation_id" uuid NOT NULL,
        "phase_field_id" uuid,
        "field_code" character varying(120) NOT NULL,
        "value_text" text,
        "value_number" double precision,
        "value_boolean" boolean,
        "value_json" jsonb,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kanban_phase_field_values" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_kpfv_solicitation_id" ON "kanban_phase_field_values" ("solicitation_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_kpfv_solicitation_field" ON "kanban_phase_field_values" ("solicitation_id", "phase_field_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "kanban_phase_field_values" ADD CONSTRAINT "FK_kpfv_solicitation" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "kanban_phase_field_values" ADD CONSTRAINT "FK_kpfv_phase_field" FOREIGN KEY ("phase_field_id") REFERENCES "kanban_phase_fields"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "solicitations" ADD "current_phase_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_current_phase" FOREIGN KEY ("current_phase_id") REFERENCES "kanban_phases"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "automation_rules" ADD "target_phase_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_target_phase" FOREIGN KEY ("target_phase_id") REFERENCES "kanban_phases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "automation_executions" ADD "solicitation_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "automation_executions" ADD CONSTRAINT "FK_automation_executions_solicitation" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "automation_executions" DROP CONSTRAINT "FK_automation_executions_solicitation"`,
    );
    await queryRunner.query(`ALTER TABLE "automation_executions" DROP COLUMN "solicitation_id"`);

    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_automation_rules_target_phase"`,
    );
    await queryRunner.query(`ALTER TABLE "automation_rules" DROP COLUMN "target_phase_id"`);

    await queryRunner.query(
      `ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_current_phase"`,
    );
    await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "current_phase_id"`);

    await queryRunner.query(`DROP TABLE "kanban_phase_field_values"`);
    await queryRunner.query(`DROP TABLE "kanban_phase_fields"`);
    await queryRunner.query(`DROP TABLE "kanban_phases"`);
  }
}
