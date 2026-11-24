import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Link do aviso do sino: clicar abre o que o aviso cita (a solicitação, a aprovação). Só caminho
 * interno do app; os avisos que já existem ficam sem link.
 */
export class NotificationLink1791500000000 implements MigrationInterface {
  name = 'NotificationLink1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link" varchar(300)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "link"`);
  }
}
