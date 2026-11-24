import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aprovador externo: uma etapa de aprovação passa a poder ser atribuída a um **e-mail** (alguém sem
 * usuário no sistema), que decide por um link pessoal enviado por e-mail.
 *
 * `approval_steps`
 *  - `assigned_email`            e-mail do aprovador externo (exclusivo com usuário e perfil);
 *  - `access_token_hash`         SHA-256 do token do link — o token em si nunca é gravado;
 *  - `access_token_expires_at`   validade do link;
 *  - `access_link_sent_at`       quando o SMTP aceitou o e-mail (nulo = link ainda não enviado);
 *  - `access_failed_attempts`    confirmações de e-mail erradas (bloqueia o link ao passar do limite).
 *  O CHECK `CHK_approval_steps_assignee_xor` deixa de ser "usuário XOR perfil" e vira "exatamente um
 *  entre usuário, perfil e e-mail". Linhas existentes (todas com usuário ou perfil) continuam válidas.
 *
 * `approval_decisions`
 *  - `decided_by_email` / `decided_via` / `decided_ip`  trilha de quem decidiu pelo link. `decided_via`
 *    tem padrão 'system' — as decisões antigas ficam como estão.
 *
 * Só adiciona colunas anuláveis (ou com padrão) e relaxa uma restrição: compatível com o código antigo
 * durante o deploy.
 */
export class ExternalApprovers1788500000000 implements MigrationInterface {
  name = 'ExternalApprovers1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "approval_steps" ADD "assigned_email" character varying(180)`);
    await queryRunner.query(`ALTER TABLE "approval_steps" ADD "access_token_hash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "approval_steps" ADD "access_token_expires_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "approval_steps" ADD "access_link_sent_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "approval_steps" ADD "access_failed_attempts" smallint NOT NULL DEFAULT '0'`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_approval_steps_access_token_hash" ON "approval_steps" ("access_token_hash") WHERE "access_token_hash" IS NOT NULL`,
    );

    await queryRunner.query(`ALTER TABLE "approval_steps" DROP CONSTRAINT "CHK_approval_steps_assignee_xor"`);
    await queryRunner.query(`
      ALTER TABLE "approval_steps" ADD CONSTRAINT "CHK_approval_steps_assignee_xor"
      CHECK (
        ("assigned_user_id" IS NOT NULL)::int +
        ("assigned_role_code" IS NOT NULL)::int +
        ("assigned_email" IS NOT NULL)::int = 1
      )
    `);

    await queryRunner.query(`ALTER TABLE "approval_decisions" ADD "decided_by_email" character varying(180)`);
    await queryRunner.query(`ALTER TABLE "approval_decisions" ADD "decided_via" character varying(20) NOT NULL DEFAULT 'system'`);
    await queryRunner.query(`ALTER TABLE "approval_decisions" ADD "decided_ip" character varying(45)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "approval_decisions" DROP COLUMN "decided_ip"`);
    await queryRunner.query(`ALTER TABLE "approval_decisions" DROP COLUMN "decided_via"`);
    await queryRunner.query(`ALTER TABLE "approval_decisions" DROP COLUMN "decided_by_email"`);

    // Etapas externas não existem no esquema antigo: sem remover antes, o CHECK antigo não pode voltar.
    await queryRunner.query(`DELETE FROM "approval_steps" WHERE "assigned_email" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP CONSTRAINT "CHK_approval_steps_assignee_xor"`);
    await queryRunner.query(`
      ALTER TABLE "approval_steps" ADD CONSTRAINT "CHK_approval_steps_assignee_xor"
      CHECK (
        ("assigned_user_id" IS NOT NULL AND "assigned_role_code" IS NULL) OR
        ("assigned_user_id" IS NULL AND "assigned_role_code" IS NOT NULL)
      )
    `);

    await queryRunner.query(`DROP INDEX "public"."UQ_approval_steps_access_token_hash"`);
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP COLUMN "access_failed_attempts"`);
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP COLUMN "access_link_sent_at"`);
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP COLUMN "access_token_expires_at"`);
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP COLUMN "access_token_hash"`);
    await queryRunner.query(`ALTER TABLE "approval_steps" DROP COLUMN "assigned_email"`);
  }
}
