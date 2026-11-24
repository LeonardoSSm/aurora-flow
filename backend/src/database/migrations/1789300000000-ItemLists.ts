import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Listas de itens reutilizáveis (opções de lista suspensa / seleção única / múltipla em formulários
 * e fases): item_lists (nome, descrição, arquivada) e item_list_items (código opcional, nome, ativo,
 * ordem). Tabelas novas — nada existente muda. O vínculo do campo com a lista fica no
 * `settings_json` do campo (`itemListId`).
 */
export class ItemLists1789300000000 implements MigrationInterface {
  name = 'ItemLists1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "item_lists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(180) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_item_lists" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "item_list_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "list_id" uuid NOT NULL,
        "code" character varying(60),
        "name" character varying(180) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_item_list_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_item_list_items_list" FOREIGN KEY ("list_id")
          REFERENCES "item_lists"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_item_list_items_list" ON "item_list_items" ("list_id", "order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "item_list_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "item_lists"`);
  }
}
