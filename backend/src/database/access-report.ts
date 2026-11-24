import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { DataSource, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { PermissionScope } from '../common/constants/permission-catalog';
import type { ProcessPermissionScope } from '../common/constants/process-permission-catalog';
import { convertAccess } from '../modules/access/access-conversion';
import { ProcessAccessService, ProcessGrants } from '../modules/access/process-access.service';
import { AppDataSource } from './data-source';
import { SolicitationEntity } from './entities';

/**
 * Relatório "antes × depois" da troca do perfil global pelo vínculo pessoa × processo. Só lê.
 *
 * Para cada pessoa ativa: os processos e a quantidade de cards que ela vê pela regra antiga (perfil +
 * atribuição) e pela nova (vínculo). Sem a tabela form_members (antes da migration), o "depois" é a
 * prévia da conversão; com ela, o que está gravado.
 *
 *   npm run access:report                 (texto)
 *   npm run access:report -- saida.json   (também grava o detalhe em JSON)
 *   em produção: node dist/database/access-report.js
 */

interface PersonReport {
  email: string;
  role: string;
  fullAccess: boolean;
  processesBefore: number;
  processesAfter: number;
  processesLost: string[];
  processesGained: string[];
  cardsBefore: number;
  cardsAfter: number;
  cardsLost: string[];
}

async function main(): Promise<void> {
  // O DataSource do CLI liga o log de SQL; aqui ele só polui o relatório.
  const ds = await new DataSource({ ...AppDataSource.options, logging: false }).initialize();
  try {
    const q = <T>(sql: string, params: unknown[] = []): Promise<T[]> => ds.query(sql, params) as Promise<T[]>;
    const tableExists = async (table: string): Promise<boolean> =>
      (await q<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${table}`]))[0]?.exists === true;

    // A atribuição antiga: a tabela original antes da conversão; depois dela, a cópia que a migration
    // DropFormAssignees guarda para desfazer o deploy. Sem nenhuma das duas, não há atribuição.
    const assigneesTable = (await tableExists('form_assignees'))
      ? 'form_assignees'
      : (await tableExists('form_assignees_rollback'))
        ? 'form_assignees_rollback'
        : null;

    const [grantsRows, users, forms, assignees] = await Promise.all([
      q<{ role_id: string; permission_code: string; scope: PermissionScope }>(
        `SELECT role_id, permission_code, scope FROM role_permissions`,
      ),
      q<{ id: string; email: string; role: string; area_id: string | null }>(
        `SELECT id, email, role, area_id FROM users WHERE is_active = true ORDER BY email`,
      ),
      q<{ id: string; name: string; created_by: string | null; area_id: string | null; status: string }>(
        `SELECT id, name, created_by, area_id, status FROM forms`,
      ),
      assigneesTable
        ? q<{ form_id: string; user_id: string }>(`SELECT form_id, user_id FROM "${assigneesTable}"`)
        : Promise.resolve([]),
    ]);

    const roleGrants = new Map<string, Map<string, PermissionScope>>();
    for (const row of grantsRows) {
      const byCode = roleGrants.get(row.role_id) ?? new Map<string, PermissionScope>();
      byCode.set(row.permission_code, row.scope);
      roleGrants.set(row.role_id, byCode);
    }
    const scopeOf = (role: string, code: string): PermissionScope => roleGrants.get(role)?.get(code) ?? 'none';
    const assigneesByForm = new Map<string, Set<string>>();
    for (const row of assignees) {
      const set = assigneesByForm.get(row.form_id) ?? new Set<string>();
      set.add(row.user_id);
      assigneesByForm.set(row.form_id, set);
    }
    const formName = new Map(forms.map((f) => [f.id, f.name]));

    // ── "Depois": o gravado, ou a prévia da conversão ──────────────────────
    const hasTable = await tableExists('form_members');
    const membership = new Map<string, Map<string, Map<string, ProcessPermissionScope>>>();
    let fullAccessRoles: Set<string>;
    if (hasTable) {
      const rows = await q<{ user_id: string; form_id: string; code: string | null; scope: ProcessPermissionScope | null }>(
        `SELECT m.user_id, m.form_id, p.permission_code AS code, p.scope
           FROM form_members m LEFT JOIN form_member_permissions p ON p.member_id = m.id`,
      );
      for (const row of rows) {
        const byForm = membership.get(row.user_id) ?? new Map();
        const perms = byForm.get(row.form_id) ?? new Map();
        if (row.code && row.scope) perms.set(row.code, row.scope);
        byForm.set(row.form_id, perms);
        membership.set(row.user_id, byForm);
      }
      fullAccessRoles = new Set([...roleGrants.keys()].filter((r) => scopeOf(r, 'processes.full_access') !== 'none'));
    } else {
      const preview = convertAccess({
        roleGrants,
        users: users.map((u) => ({ id: u.id, role: u.role, areaId: u.area_id })),
        forms: forms.map((f) => ({ id: f.id, createdBy: f.created_by, areaId: f.area_id, status: f.status })),
        assignees: assigneesByForm,
      });
      for (const m of preview.memberships) {
        const byForm = membership.get(m.userId) ?? new Map();
        byForm.set(m.formId, new Map(Object.entries(m.grants)));
        membership.set(m.userId, byForm);
      }
      fullAccessRoles = new Set(preview.fullAccessRoles);
    }

    // Só para usar a regra de lista do serviço (não toca o banco).
    const access = new ProcessAccessService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const cardIds = async (build: (qb: SelectQueryBuilder<ObjectLiteral>) => void): Promise<Set<string>> => {
      const qb = ds
        .getRepository(SolicitationEntity)
        .createQueryBuilder('solicitation')
        .leftJoin('solicitation.form', 'form')
        .select('solicitation.id', 'id');
      build(qb as unknown as SelectQueryBuilder<ObjectLiteral>);
      return new Set((await qb.getRawMany<{ id: string }>()).map((r) => r.id));
    };

    const report: PersonReport[] = [];
    for (const user of users) {
      // Antes: processos pelo perfil (criador/área/tudo), atribuição e criação; cards pelo escopo.
      const before = new Set<string>();
      for (const form of forms) {
        const reaches = (scope: PermissionScope): boolean =>
          scope === 'all' ||
          (scope === 'own' && form.created_by === user.id) ||
          (scope === 'area' &&
            (!user.area_id ? user.role === 'manager' || !form.area_id : !form.area_id || form.area_id === user.area_id));
        if (
          form.created_by === user.id ||
          assigneesByForm.get(form.id)?.has(user.id) ||
          (reaches(scopeOf(user.role, 'forms.view')) && !(user.role === 'viewer' && form.status !== 'published')) ||
          reaches(scopeOf(user.role, 'solicitations.view'))
        ) {
          before.add(form.id);
        }
      }
      const cardsBefore = await cardIds((qb) =>
        applyLegacyCardScope(qb, scopeOf(user.role, 'solicitations.view'), user, assigneesTable),
      );

      // Depois: vínculo (ou acesso total).
      const fullAccess = fullAccessRoles.has(user.role);
      const grants = new ProcessGrants(user.id, fullAccess, membership.get(user.id) ?? new Map());
      const after = new Set(fullAccess ? forms.map((f) => f.id) : [...(membership.get(user.id)?.keys() ?? [])]);
      const cardsAfter = await cardIds((qb) => access.applySolicitationScopeWith(qb, grants, 'solicitation'));

      report.push({
        email: user.email,
        role: user.role,
        fullAccess,
        processesBefore: before.size,
        processesAfter: after.size,
        processesLost: [...before].filter((id) => !after.has(id)).map((id) => formName.get(id) ?? id),
        processesGained: [...after].filter((id) => !before.has(id)).map((id) => formName.get(id) ?? id),
        cardsBefore: cardsBefore.size,
        cardsAfter: cardsAfter.size,
        cardsLost: [...cardsBefore].filter((id) => !cardsAfter.has(id)),
      });
    }

    console.log(`Origem do "depois": ${hasTable ? 'vínculos gravados (form_members)' : 'prévia da conversão (migration ainda não rodou)'}`);
    console.log(`Perfis com acesso total: ${[...fullAccessRoles].join(', ') || '(nenhum)'}\n`);
    console.log('pessoa | perfil | processos antes→depois | cards antes→depois | perde');
    for (const r of report) {
      const lost = [
        r.processesLost.length ? `${r.processesLost.length} processo(s): ${r.processesLost.join(', ')}` : '',
        r.cardsLost.length ? `${r.cardsLost.length} card(s)` : '',
      ]
        .filter(Boolean)
        .join('; ');
      console.log(
        `${r.email} | ${r.role}${r.fullAccess ? ' (acesso total)' : ''} | ${r.processesBefore}→${r.processesAfter} | ${r.cardsBefore}→${r.cardsAfter} | ${lost || '—'}`,
      );
    }
    const losing = report.filter((r) => r.processesLost.length || r.cardsLost.length);
    console.log(`\n${report.length} pessoa(s) ativa(s); ${losing.length} perde(m) algum acesso.`);

    const out = process.argv[2];
    if (out) {
      writeFileSync(out, JSON.stringify(report, null, 2));
      console.log(`Detalhe gravado em ${out}`);
    }
  } finally {
    await ds.destroy();
  }
}

/**
 * A regra antiga dos cards (perfil + área + atribuição), congelada aqui para o "antes" do relatório: os
 * helpers que a aplicavam no sistema (scope-filter, area-filter, form-access) saíram junto com o modelo
 * antigo. Inclui a exceção do perfil `manager` sem área, que via tudo.
 */
function applyLegacyCardScope(
  qb: SelectQueryBuilder<ObjectLiteral>,
  scope: PermissionScope,
  user: { id: string; role: string; area_id: string | null },
  assigneesTable: string | null,
): void {
  if (scope === 'all') return;
  if (scope === 'area' && user.role === 'manager' && !user.area_id) return;
  let base: string;
  if (scope === 'own') {
    base = '(solicitation.created_by = :legacyUser OR solicitation.assignee_id = :legacyUser OR form.created_by = :legacyUser)';
  } else if (scope === 'assigned') {
    base = 'solicitation.assignee_id = :legacyUser';
  } else if (scope === 'area') {
    base = user.area_id
      ? '(solicitation.area_id = :legacyArea OR solicitation.area_id IS NULL)'
      : 'solicitation.area_id IS NULL';
  } else {
    base = '1 = 0';
  }
  const assigned = assigneesTable
    ? ` OR EXISTS (SELECT 1 FROM "${assigneesTable}" fa WHERE fa.form_id = form.id AND fa.user_id = :legacyUser)`
    : '';
  qb.andWhere(`(${base}${assigned})`, { legacyUser: user.id, legacyArea: user.area_id });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
