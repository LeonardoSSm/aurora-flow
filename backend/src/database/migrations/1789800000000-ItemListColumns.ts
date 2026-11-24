import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Colunas próprias nas listas de itens: a lista guarda as colunas (`columns_json`, lista vazia por
 * padrão) e cada item o valor de cada coluna (`values_json`, objeto vazio por padrão). Só adiciona
 * colunas com padrão — as listas que já existem continuam iguais.
 */
export class ItemListColumns1789800000000 implements MigrationInterface {
  name = 'ItemListColumns1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "item_lists" ADD COLUMN IF NOT EXISTS "columns_json" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "item_list_items" ADD COLUMN IF NOT EXISTS "values_json" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "item_list_items" DROP COLUMN IF EXISTS "values_json"`);
    await queryRunner.query(`ALTER TABLE "item_lists" DROP COLUMN IF EXISTS "columns_json"`);
  }
}
