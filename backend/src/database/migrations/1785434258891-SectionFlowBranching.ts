import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SectionFlowBranching1785434258891 implements MigrationInterface {
  name = 'SectionFlowBranching1785434258891';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_sections" DROP COLUMN "visibility_rules"`);

    await queryRunner.query(`ALTER TABLE "form_sections" ADD "next_section_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "form_sections" ADD "next_is_submit" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_sections" ADD CONSTRAINT "FK_form_sections_next_section_id" FOREIGN KEY ("next_section_id") REFERENCES "form_sections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "form_section_branches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "section_id" uuid NOT NULL,
        "field_id" uuid,
        "option_id" uuid,
        "checkbox_value" boolean,
        "target_section_id" uuid,
        "target_is_submit" boolean NOT NULL DEFAULT true,
        "order" integer NOT NULL,
        CONSTRAINT "PK_form_section_branches" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_section_branches" ADD CONSTRAINT "FK_fsb_section" FOREIGN KEY ("section_id") REFERENCES "form_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_section_branches" ADD CONSTRAINT "FK_fsb_field" FOREIGN KEY ("field_id") REFERENCES "form_fields"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_section_branches" ADD CONSTRAINT "FK_fsb_option" FOREIGN KEY ("option_id") REFERENCES "form_field_options"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_section_branches" ADD CONSTRAINT "FK_fsb_target_section" FOREIGN KEY ("target_section_id") REFERENCES "form_sections"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "form_section_branches"`);
    await queryRunner.query(
      `ALTER TABLE "form_sections" DROP CONSTRAINT "FK_form_sections_next_section_id"`,
    );
    await queryRunner.query(`ALTER TABLE "form_sections" DROP COLUMN "next_is_submit"`);
    await queryRunner.query(`ALTER TABLE "form_sections" DROP COLUMN "next_section_id"`);
    await queryRunner.query(`ALTER TABLE "form_sections" ADD "visibility_rules" jsonb`);
  }
}
