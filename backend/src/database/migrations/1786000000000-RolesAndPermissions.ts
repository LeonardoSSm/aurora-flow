import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces a data-driven roles/permissions model to replace the hardcoded
 * `UserRole` enum. `users.role` is already a plain varchar(20) with no
 * CHECK/native-enum constraint (see 1777911403160-InitialSchema), and today's
 * four values ('admin'/'manager'/'editor'/'viewer') are already just data —
 * so `roles.code` uses those exact strings as primary key, letting the FK
 * added at the end be a zero-data-rewrite migration.
 *
 * The permission_scope seeded below reproduces today's exact access-control
 * behavior (verified against the actual service code, not just documentation)
 * so that before any admin touches the new "Perfis" UI, the app behaves
 * identically for existing users. Absence of a role_permissions row means
 * scope='none' (no access) — only granted permissions get a row.
 */
export class RolesAndPermissions1786000000000 implements MigrationInterface {
  name = 'RolesAndPermissions1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "code" character varying(40) NOT NULL,
        "name" character varying(120) NOT NULL,
        "description" text,
        "color" character varying(20) NOT NULL DEFAULT 'gray',
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles_code" PRIMARY KEY ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "role_id" character varying(40) NOT NULL,
        "permission_code" character varying(80) NOT NULL,
        "scope" character varying(10) NOT NULL DEFAULT 'none',
        CONSTRAINT "PK_role_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_role_permissions_role_code" UNIQUE ("role_id", "permission_code")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_role_permissions_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("code") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // ─── Seed the 4 default roles (editable, not special-cased anywhere in code) ──
    await queryRunner.query(`
      INSERT INTO "roles" ("code", "name", "description", "color", "is_system") VALUES
      ('admin', 'Administrador', 'Acesso total ao sistema.', 'red', true),
      ('manager', 'Gestor', 'Gerencia a própria área: formulários, respostas, solicitações e integrações.', 'purple', true),
      ('editor', 'Editor', 'Cria e edita os próprios formulários e conteúdo.', 'blue', true),
      ('viewer', 'Visualizador', 'Acesso de leitura a conteúdo publicado e itens atribuídos.', 'gray', true)
    `);

    // ─── Seed role_permissions reproducing today's exact behavior ──────────────
    // Format: (role, permission_code, scope). Rows omitted below are implicitly 'none'.
    const grants: Array<[string, string, string]> = [
      // admin — everything, scope 'all'
      ...[
        'forms.view', 'forms.create', 'forms.edit', 'forms.publish',
        'responses.view', 'responses.export', 'responses.view_sensitive',
        'solicitations.view', 'solicitations.manage',
        'comments.view_internal',
        'flows.view', 'flows.manage',
        'analytics.view',
        'approvals.decide', 'approvals.manage',
        'areas.manage', 'users.manage', 'roles.manage', 'settings.manage',
        'attachments.manage_all',
        'integrations.manage', 'integrations.view_logs',
        'automations.manage', 'audit.view', 'reports.view',
        'dashboard.view_org', 'kanban_phases.manage',
      ].map((code): [string, string, string] => ['admin', code, 'all']),

      // manager — area-scoped for record-heavy modules, 'all' for the org-wide
      // capabilities it already has today, 'none' for strictly-admin modules
      ['manager', 'forms.view', 'area'],
      ['manager', 'forms.create', 'all'],
      ['manager', 'forms.edit', 'area'],
      ['manager', 'forms.publish', 'area'],
      ['manager', 'responses.view', 'area'],
      ['manager', 'responses.export', 'all'],
      ['manager', 'responses.view_sensitive', 'all'],
      ['manager', 'solicitations.view', 'area'],
      ['manager', 'solicitations.manage', 'area'],
      ['manager', 'comments.view_internal', 'all'],
      ['manager', 'flows.view', 'all'], // flows never had an area filter — 'all' reproduces that gap intentionally
      ['manager', 'flows.manage', 'all'],
      ['manager', 'analytics.view', 'all'], // analytics never had an area filter either
      ['manager', 'approvals.decide', 'all'],
      ['manager', 'approvals.manage', 'all'],
      ['manager', 'attachments.manage_all', 'all'],
      ['manager', 'integrations.view_logs', 'all'],
      ['manager', 'reports.view', 'all'],
      ['manager', 'dashboard.view_org', 'all'],
      ['manager', 'kanban_phases.manage', 'all'],

      // editor — own records (own-created, plus assignment which is always
      // handled as a separate bypass leg outside the scope engine, per the
      // form/solicitation assignment work from the previous session)
      ['editor', 'forms.view', 'own'],
      ['editor', 'forms.create', 'all'],
      ['editor', 'forms.edit', 'own'],
      ['editor', 'forms.publish', 'own'],
      ['editor', 'responses.view', 'own'],
      ['editor', 'solicitations.view', 'own'],
      ['editor', 'solicitations.manage', 'own'],
      ['editor', 'flows.view', 'own'],
      ['editor', 'flows.manage', 'own'],
      ['editor', 'analytics.view', 'own'],
      ['editor', 'approvals.decide', 'assigned'],
      ['editor', 'kanban_phases.manage', 'all'],

      // viewer — read-only, assignment-gated where "own" doesn't apply
      ['viewer', 'forms.view', 'area'], // published-only status filter applied separately, not via scope
      ['viewer', 'responses.view', 'assigned'],
      ['viewer', 'solicitations.view', 'assigned'],
      ['viewer', 'flows.view', 'assigned'],
      ['viewer', 'analytics.view', 'assigned'],
      ['viewer', 'approvals.decide', 'assigned'],
    ];

    const values = grants
      .map(([role, code, scope]) => `('${role}', '${code}', '${scope}')`)
      .join(',\n      ');
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_code", "scope") VALUES
      ${values}
    `);

    // ─── users.role → roles.code FK (zero data rewrite: values already match) ──
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_role_code" FOREIGN KEY ("role") REFERENCES "roles"("code") ON DELETE NO ACTION ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_role_code"`);
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permissions_role_id"`,
    );
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}
