import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modelos de relatório da tela Registros: cada processo guarda os seus (colunas, ordem, agrupamento,
 * layout em `config`). Nome único dentro do processo. Some junto com o processo; quem criou pode
 * deixar de existir sem levar o modelo.
 */
export class RecordReportTemplates1791300000000 implements MigrationInterface {
  name = 'RecordReportTemplates1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "record_report_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "config" jsonb NOT NULL,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_record_report_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_record_report_templates_form_name" UNIQUE ("form_id", "name"),
        CONSTRAINT "FK_record_report_templates_form_id" FOREIGN KEY ("form_id")
          REFERENCES "forms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_record_report_templates_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "record_report_templates"`);
  }
}
