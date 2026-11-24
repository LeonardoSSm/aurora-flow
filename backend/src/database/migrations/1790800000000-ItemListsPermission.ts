import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Listas de itens são um catálogo da plataforma, usado pelos campos de seleção de vários processos:
 * ganham permissão de sistema própria (`item_lists.manage`) em vez de pegar carona em "editar
 * formulários", que virou permissão de cada processo. Recebe quem já podia editar formulários pelo
 * perfil e quem tem acesso total aos processos — ninguém perde o que tinha.
 */
export class ItemListsPermission1790800000000 implements MigrationInterface {
  name = 'ItemListsPermission1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope")
      SELECT DISTINCT "role_id", 'item_lists.manage', 'all'
        FROM "role_permissions"
       WHERE "permission_code" IN ('forms.edit', 'processes.full_access') AND "scope" <> 'none'
      ON CONFLICT ("role_id", "permission_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_code" = 'item_lists.manage'`);
  }
}
