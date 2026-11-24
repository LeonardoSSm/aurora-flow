import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convite por e-mail ao criar um usuário: o link leva a uma página pública onde a pessoa cria a
 * própria senha. O banco guarda só o SHA-256 do token (como no link de aprovação externa) — quem
 * lê o banco ou um backup não consegue montar o link. Um convite novo substitui o anterior.
 */
export class UserInvite1790300000000 implements MigrationInterface {
  name = 'UserInvite1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "invite_token_hash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "invite_expires_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD "invite_sent_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_invite_token_hash" ON "users" ("invite_token_hash") WHERE "invite_token_hash" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_users_invite_token_hash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invite_sent_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invite_expires_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "invite_token_hash"`);
  }
}
