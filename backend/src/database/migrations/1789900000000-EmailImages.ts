import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Imagens dos e-mails do sistema (arte de fundo do aviso de pontuação), com os bytes no banco, e a
 * configuração da arte geral (`email.score_alert_background`: id da imagem; vazio = arte padrão).
 */
export class EmailImages1789900000000 implements MigrationInterface {
  name = 'EmailImages1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "mime_type" character varying(50) NOT NULL,
        "size_bytes" integer NOT NULL,
        "content" bytea NOT NULL,
        "uploaded_by_user_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_images" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "app_settings" ("key", "value", "description", "is_public", "value_type")
      VALUES ('email.score_alert_background', NULL, 'Arte de fundo dos avisos de pontuação por e-mail (vazio = arte padrão)', false, 'string')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "app_settings" WHERE "key" = 'email.score_alert_background'`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_images"`);
  }
}
