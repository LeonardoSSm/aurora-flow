import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores the verdict returned by the external "validador-de-etiquetas" AI agent
 * (lote/fabricação/validade read off a label photo) alongside the attachment it
 * was computed for, so the UI can show it without a separate lookup.
 */
export class AttachmentLabelValidation1788200000000 implements MigrationInterface {
  name = 'AttachmentLabelValidation1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" ADD "validation_result" jsonb`);
    await queryRunner.query(`ALTER TABLE "attachments" ADD "validated_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "validated_at"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "validation_result"`);
  }
}
