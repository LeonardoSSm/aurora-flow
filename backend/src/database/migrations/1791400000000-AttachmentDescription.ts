import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Descrição do anexo: quem envia diz o que o arquivo é (ou o renomeia). Os anexos que já existem
 * ficam sem descrição.
 */
export class AttachmentDescription1791400000000 implements MigrationInterface {
  name = 'AttachmentDescription1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "description" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN IF EXISTS "description"`);
  }
}
