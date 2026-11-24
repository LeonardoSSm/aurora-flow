import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPasswordDefinedAt1786700000000 implements MigrationInterface {
  name = 'UserPasswordDefinedAt1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "password_defined_at" TIMESTAMP WITH TIME ZONE`);

    // Backfill: quem nunca passou pelo Google só pode ter entrado com senha, então
    // essa senha existe de verdade. Já para quem tem conta Google vinculada não dá
    // para distinguir uma senha escolhida de um hash aleatório gerado no primeiro
    // login Google — esses ficam com NULL e recebem a tela de cadastro de senha no
    // próximo login pelo Google. A tela é opcional e não invalida senha nenhuma,
    // então o custo de errar para esse lado é só um convite a mais.
    await queryRunner.query(
      `UPDATE "users" SET "password_defined_at" = "created_at" WHERE "google_sub" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_defined_at"`);
  }
}
