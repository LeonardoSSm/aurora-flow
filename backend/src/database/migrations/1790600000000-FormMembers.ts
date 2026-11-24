import type { MigrationInterface, QueryRunner } from 'typeorm';
import type { PermissionScope } from '../../common/constants/permission-catalog';
import { convertAccess } from '../../modules/access/access-conversion';

/**
 * Vínculo pessoa × processo (form_members) com as permissões de cada pessoa em cada processo
 * (form_member_permissions). A partir daqui o perfil só decide o que é da plataforma.
 *
 * O acesso de hoje é convertido aqui mesmo, para ninguém perder nada no dia do deploy: o criador vira
 * membro completo; quem estava atribuído ou via o processo pelo perfil (escopo de criador/área/tudo)
 * vira membro com as permissões que o perfil dava; perfis que viam e operavam tudo ganham
 * `processes.full_access` em vez de um vínculo por processo. Ver access-conversion.ts e o relatório
 * `npm run access:report` para conferir pessoa a pessoa antes de aplicar.
 *
 * As linhas antigas de role_permissions ficam (o perfil não as lê mais): o `down` volta ao modelo
 * anterior só apagando as tabelas novas e o acesso total.
 */
export class FormMembers1790600000000 implements MigrationInterface {
  name = 'FormMembers1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "form_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_form_members_form_user" UNIQUE ("form_id", "user_id"),
        CONSTRAINT "FK_form_members_form_id" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_form_members_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_form_members_user_id" ON "form_members" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "form_member_permissions" (
        "member_id" uuid NOT NULL,
        "permission_code" character varying(80) NOT NULL,
        "scope" character varying(10) NOT NULL DEFAULT 'all',
        CONSTRAINT "PK_form_member_permissions" PRIMARY KEY ("member_id", "permission_code"),
        CONSTRAINT "FK_form_member_permissions_member_id" FOREIGN KEY ("member_id")
          REFERENCES "form_members"("id") ON DELETE CASCADE
      )
    `);

    const [grants, users, forms, assignees] = await Promise.all([
      queryRunner.query(`SELECT "role_id", "permission_code", "scope" FROM "role_permissions"`) as Promise<
        Array<{ role_id: string; permission_code: string; scope: PermissionScope }>
      >,
      queryRunner.query(`SELECT "id", "role", "area_id" FROM "users"`) as Promise<
        Array<{ id: string; role: string; area_id: string | null }>
      >,
      queryRunner.query(`SELECT "id", "created_by", "area_id", "status" FROM "forms"`) as Promise<
        Array<{ id: string; created_by: string | null; area_id: string | null; status: string }>
      >,
      // A tabela de atribuições sai na migration seguinte (DropFormAssignees); rodar esta de novo depois
      // dela (os testes fazem isso) não pode quebrar.
      (queryRunner.query(`SELECT to_regclass('public.form_assignees') IS NOT NULL AS "exists"`) as Promise<
        Array<{ exists: boolean }>
      >).then((rows) =>
        rows[0]?.exists
          ? (queryRunner.query(`SELECT "form_id", "user_id" FROM "form_assignees"`) as Promise<
              Array<{ form_id: string; user_id: string }>
            >)
          : [],
      ),
    ]);

    const roleGrants = new Map<string, Map<string, PermissionScope>>();
    for (const row of grants) {
      const byCode = roleGrants.get(row.role_id) ?? new Map<string, PermissionScope>();
      byCode.set(row.permission_code, row.scope);
      roleGrants.set(row.role_id, byCode);
    }
    const assigneesByForm = new Map<string, Set<string>>();
    for (const row of assignees) {
      const set = assigneesByForm.get(row.form_id) ?? new Set<string>();
      set.add(row.user_id);
      assigneesByForm.set(row.form_id, set);
    }

    const result = convertAccess({
      roleGrants,
      users: users.map((u) => ({ id: u.id, role: u.role, areaId: u.area_id })),
      forms: forms.map((f) => ({ id: f.id, createdBy: f.created_by, areaId: f.area_id, status: f.status })),
      assignees: assigneesByForm,
    });

    for (const role of result.fullAccessRoles) {
      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_code", "scope")
         VALUES ($1, 'processes.full_access', 'all')
         ON CONFLICT ("role_id", "permission_code") DO NOTHING`,
        [role],
      );
    }

    for (const membership of result.memberships) {
      const inserted = (await queryRunner.query(
        `INSERT INTO "form_members" ("form_id", "user_id") VALUES ($1, $2)
         ON CONFLICT ("form_id", "user_id") DO NOTHING
         RETURNING "id"`,
        [membership.formId, membership.userId],
      )) as Array<{ id: string }>;
      const memberId = inserted[0]?.id;
      if (!memberId) continue; // já existia: não mexe no que alguém marcou
      for (const [code, scope] of Object.entries(membership.grants)) {
        await queryRunner.query(
          `INSERT INTO "form_member_permissions" ("member_id", "permission_code", "scope") VALUES ($1, $2, $3)`,
          [memberId, code, scope],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "form_member_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "form_members"`);
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_code" = 'processes.full_access'`);
  }
}
