import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paineis livres — o painel deixa de precisar de um formulario.
 *
 * O painel do formulario continua exatamente como esta: `form_id` preenchido,
 * um por formulario, visivel para quem enxerga o formulario. O que muda e que
 * agora existe um segundo tipo de painel, com `form_id` nulo, que cruza varios
 * formularios e pertence a uma pessoa.
 *
 * Duas consequencias na modelagem:
 *
 * - **O unico em `form_id` vira parcial.** Sem o `WHERE form_id IS NOT NULL`,
 *   o Postgres deixaria passar varios nulos (nulos nao colidem entre si em
 *   indice unico), mas o indice ficaria carregando linhas que ele nao serve.
 *   Parcial diz a intencao e ainda fica menor.
 * - **`published_at` no lugar de um enum de visibilidade.** Nulo e privado,
 *   preenchido e publicado para a organizacao — e de quebra guarda quando. Um
 *   enum precisaria de valor tambem para painel de formulario, onde a coluna
 *   nao significa nada, e ninguem lembraria disso seis meses depois.
 */
export class PaineisLivres1787100000000 implements MigrationInterface {
  name = 'PaineisLivres1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dashboards" ALTER COLUMN "form_id" DROP NOT NULL`);

    await queryRunner.query(`DROP INDEX "UQ_dashboards_form_id"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_dashboards_form_id"
      ON "dashboards" ("form_id")
      WHERE "form_id" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "dashboards" ADD "published_at" TIMESTAMP WITH TIME ZONE`,
    );

    // A lista de paineis livres pergunta sempre a mesma coisa: os meus, e os
    // publicados. Um indice para cada metade da pergunta.
    await queryRunner.query(`
      CREATE INDEX "IDX_dashboards_livres_do_dono"
      ON "dashboards" ("created_by", "updated_at" DESC)
      WHERE "form_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_dashboards_livres_publicados"
      ON "dashboards" ("published_at" DESC)
      WHERE "form_id" IS NULL AND "published_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dashboards_livres_publicados"`);
    await queryRunner.query(`DROP INDEX "IDX_dashboards_livres_do_dono"`);
    await queryRunner.query(`ALTER TABLE "dashboards" DROP COLUMN "published_at"`);

    // Sem formulario, um painel livre nao tem para onde voltar: a coluna volta
    // a ser obrigatoria, entao eles saem junto.
    await queryRunner.query(`DELETE FROM "dashboards" WHERE "form_id" IS NULL`);

    await queryRunner.query(`DROP INDEX "UQ_dashboards_form_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_dashboards_form_id" ON "dashboards" ("form_id")`,
    );
    await queryRunner.query(`ALTER TABLE "dashboards" ALTER COLUMN "form_id" SET NOT NULL`);
  }
}
