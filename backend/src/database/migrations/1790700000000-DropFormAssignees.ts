import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A atribuição de pessoas ao formulário (form_assignees) foi convertida em vínculo pessoa × processo
 * (form_members) na migration anterior e deixou de dar acesso. A tabela sai de uso, mas NÃO é apagada:
 * vira `form_assignees_rollback`, uma cópia fiel para o caso de o deploy ter de ser desfeito.
 *
 * Por que não recriar a partir dos vínculos no `down`: no modelo antigo, estar atribuído valia o
 * processo inteiro. Recriar a partir de form_members transformaria em "atribuído" quem só tinha
 * vínculo para ver os próprios cards (ou o criador, ou o gestor da área) — desfazer o deploy ampliaria
 * acessos. A cópia devolve exatamente o que havia. As chaves estrangeiras em cascata seguem valendo
 * nela: processo ou pessoa apagados depois somem da cópia também.
 *
 * Quem recebeu acesso depois do deploy (só vínculo) não volta como atribuído: no modelo antigo,
 * precisa ser atribuído de novo.
 */
export class DropFormAssignees1790700000000 implements MigrationInterface {
  name = 'DropFormAssignees1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'form_assignees'))) return;
    await queryRunner.query(`DROP TABLE IF EXISTS "form_assignees_rollback"`);
    await queryRunner.query(`ALTER TABLE "form_assignees" RENAME TO "form_assignees_rollback"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'form_assignees')) return;
    if (await tableExists(queryRunner, 'form_assignees_rollback')) {
      await queryRunner.query(`ALTER TABLE "form_assignees_rollback" RENAME TO "form_assignees"`);
      return;
    }
    // Sem a cópia (base em que a tabela já tinha sido apagada): recria vazia — nunca a partir dos
    // vínculos, que ampliariam o acesso no modelo antigo.
    await queryRunner.query(`
      CREATE TABLE "form_assignees" (
        "form_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_assignees" PRIMARY KEY ("form_id", "user_id"),
        CONSTRAINT "FK_form_assignees_form_id" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_form_assignees_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_form_assignees_user_id" ON "form_assignees" ("user_id")`);
  }
}

async function tableExists(queryRunner: QueryRunner, name: string): Promise<boolean> {
  const rows = (await queryRunner.query(`SELECT to_regclass($1) IS NOT NULL AS "exists"`, [
    `public.${name}`,
  ])) as Array<{ exists: boolean }>;
  return rows[0]?.exists === true;
}
