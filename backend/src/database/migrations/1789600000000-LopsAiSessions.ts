import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sessões da LOPS IA com token curto (tf-XXXX-XXXX-XXXX-XXXX) no lugar do JWT: a IA copia o token
 * em cada chamada e errava ao repetir os ~265 caracteres do JWT. Só o hash fica gravado.
 */
export class LopsAiSessions1789600000000 implements MigrationInterface {
  name = 'LopsAiSessions1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lops_ai_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token_hash" character varying(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "token_version" integer NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lops_ai_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lops_ai_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_lops_ai_sessions_token_hash" ON "lops_ai_sessions" ("token_hash")`);
    await queryRunner.query(`CREATE INDEX "IDX_lops_ai_sessions_user_id" ON "lops_ai_sessions" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lops_ai_sessions"`);
  }
}
