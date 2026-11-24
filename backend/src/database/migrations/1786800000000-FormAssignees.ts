import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atribuicao de formulario deixa de ser uma coluna unica e vira tabela de
 * ligacao: um formulario pode ser atribuido a varias pessoas, e todas elas
 * enxergam respostas, solicitacoes, kanban e fluxos daquele formulario.
 *
 * O backfill preserva as atribuicoes existentes antes de a coluna sair, e o
 * `down` devolve a coluna com a primeira atribuicao de cada formulario.
 */
export class FormAssignees1786800000000 implements MigrationInterface {
  name = 'FormAssignees1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "form_assignees" (
        "form_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_assignees" PRIMARY KEY ("form_id", "user_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_form_assignees_user_id" ON "form_assignees" ("user_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "form_assignees"
      ADD CONSTRAINT "FK_form_assignees_form_id"
      FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "form_assignees"
      ADD CONSTRAINT "FK_form_assignees_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Preserva quem ja estava atribuido antes de a coluna sair.
    await queryRunner.query(`
      INSERT INTO "form_assignees" ("form_id", "user_id")
      SELECT "id", "assigned_user_id" FROM "forms" WHERE "assigned_user_id" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "forms" DROP CONSTRAINT "FK_efebe6e84cb7dbcf1af2e0bb043"`,
    );
    await queryRunner.query(`ALTER TABLE "forms" DROP COLUMN "assigned_user_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "forms" ADD "assigned_user_id" uuid`);

    // Sem coluna para varias pessoas, sobra a atribuicao mais antiga de cada formulario.
    await queryRunner.query(`
      UPDATE "forms" f
      SET "assigned_user_id" = fa."user_id"
      FROM (
        SELECT DISTINCT ON ("form_id") "form_id", "user_id"
        FROM "form_assignees"
        ORDER BY "form_id", "created_at" ASC, "user_id" ASC
      ) fa
      WHERE fa."form_id" = f."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "forms"
      ADD CONSTRAINT "FK_efebe6e84cb7dbcf1af2e0bb043"
      FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`DROP TABLE "form_assignees"`);
  }
}
