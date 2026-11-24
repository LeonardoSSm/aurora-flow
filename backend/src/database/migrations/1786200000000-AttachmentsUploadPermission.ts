import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'attachments.upload' (admin/manager/editor can upload+delete-own;
 * viewer cannot — matches the original @Roles(ADMIN, MANAGER, EDITOR) list
 * on the upload/delete routes), discovered while migrating the Attachments
 * module in Tier B.
 */
export class AttachmentsUploadPermission1786200000000 implements MigrationInterface {
  name = 'AttachmentsUploadPermission1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ('admin', 'attachments.upload', 'all'),
      ('manager', 'attachments.upload', 'all'),
      ('editor', 'attachments.upload', 'all')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_code" = 'attachments.upload'`,
    );
  }
}
