import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Construtor de dashboards — persistencia.
 *
 * Decisoes de produto que a modelagem reflete:
 *
 * - **Um painel por formulario.** O indice unico em `form_id` e proposital: o
 *   painel substitui a aba Analytics do builder, que e uma so. Se um dia
 *   precisar de varios paineis por formulario, basta remover o unico — a tabela
 *   ja suporta.
 * - **Quem monta e quem tem permissao de gestao** (`dashboards.manage`, semeada
 *   abaixo para admin e manager). Ver o painel segue a mesma regra que ver o
 *   analytics de hoje (`analytics.view`), entao nenhum perfil perde acesso na
 *   troca.
 * - **Configuracao do widget em jsonb**, mesmo padrao de `settings_json` nos
 *   campos: da para acrescentar formato novo de widget sem migracao.
 */
export class Dashboards1787000000000 implements MigrationInterface {
  name = 'Dashboards1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dashboards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "name" character varying(180) NOT NULL,
        "description" text,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboards" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_dashboards_form_id" ON "dashboards" ("form_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "dashboards"
      ADD CONSTRAINT "FK_dashboards_form_id"
      FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "dashboards"
      ADD CONSTRAINT "FK_dashboards_created_by"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "dashboard_widgets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "dashboard_id" uuid NOT NULL,
        "title" character varying(180) NOT NULL,
        "kind" character varying(30) NOT NULL,
        "config_json" jsonb NOT NULL DEFAULT '{}',
        "position" integer NOT NULL DEFAULT 0,
        "width" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboard_widgets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_dashboard_widgets_dashboard_id_position"
       ON "dashboard_widgets" ("dashboard_id", "position")`,
    );

    await queryRunner.query(`
      ALTER TABLE "dashboard_widgets"
      ADD CONSTRAINT "FK_dashboard_widgets_dashboard_id"
      FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Montar painel é ação de gestão; ver segue `analytics.view`, já semeada.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'dashboards.manage', 'all'),
      ('manager', 'dashboards.manage', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'dashboards.manage'`,
    );
    await queryRunner.query(`DROP TABLE "dashboard_widgets"`);
    await queryRunner.query(`DROP TABLE "dashboards"`);
  }
}
