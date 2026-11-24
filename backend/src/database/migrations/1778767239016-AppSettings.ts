import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AppSettings1778767239016 implements MigrationInterface {
  name = 'AppSettings1778767239016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("key" character varying(100) NOT NULL, "value" text, "description" character varying(255), "is_public" boolean NOT NULL DEFAULT false, "value_type" character varying(20) NOT NULL DEFAULT 'string', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_975c2db59c65c05fd9c6b63a2ab" PRIMARY KEY ("key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings"`);
  }
}
