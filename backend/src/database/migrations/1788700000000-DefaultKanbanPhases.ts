import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O board do Kanban por status foi descontinuado: todo formulário passa a ter fases, e quem não
 * tinha nenhuma recebe as três padrão (Novo / Pendente / Concluído — esta última fase final).
 *
 * As solicitações desses formulários são posicionadas pela fase equivalente ao status atual, para
 * não caírem todas em "Novo" (o board por fase põe quem não tem fase na primeira coluna):
 *   - new, open, in_analysis                                 -> Novo
 *   - completed, rejected, cancelled, resolved, canceled     -> Concluído
 *   - demais (aguardando aprovação, aprovado, em andamento…) -> Pendente
 *
 * Formulários que já tinham fases não são tocados. Valores autocontidos de propósito: a migration
 * não pode mudar se DEFAULT_KANBAN_PHASES mudar depois.
 */
export class DefaultKanbanPhases1788700000000 implements MigrationInterface {
  name = 'DefaultKanbanPhases1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT "id" FROM "forms" f
       WHERE NOT EXISTS (SELECT 1 FROM "kanban_phases" p WHERE p."form_id" = f."id")`,
    )) as Array<{ id: string }>;
    const formIds = rows.map((row) => row.id);
    if (formIds.length === 0) return;

    await queryRunner.query(
      `INSERT INTO "kanban_phases"
         ("form_id", "key", "label", "color", "description", "order", "is_terminal",
          "actor_role_code", "requires_approval", "approver_role_code")
       SELECT f."id", d."key", d."label", d."color", NULL, d."order", d."is_terminal",
              NULL, false, NULL
       FROM unnest($1::uuid[]) AS f("id")
       CROSS JOIN (VALUES
         ('novo', 'Novo', 'blue', 0, false),
         ('pendente', 'Pendente', 'amber', 1, false),
         ('concluido', 'Concluído', 'green', 2, true)
       ) AS d("key", "label", "color", "order", "is_terminal")`,
      [formIds],
    );

    await queryRunner.query(
      `UPDATE "solicitations" s
       SET "current_phase_id" = p."id"
       FROM "kanban_phases" p
       WHERE s."form_id" = ANY($1::uuid[])
         AND s."current_phase_id" IS NULL
         AND p."form_id" = s."form_id"
         AND p."key" = CASE
           WHEN s."status"::text IN ('new', 'open', 'in_analysis') THEN 'novo'
           WHEN s."status"::text IN ('completed', 'rejected', 'cancelled', 'resolved', 'canceled')
             THEN 'concluido'
           ELSE 'pendente'
         END`,
      [formIds],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Melhor esforço: remove só os conjuntos que ainda são exatamente o padrão (as três chaves,
    // nenhuma outra fase e nenhum campo de fase). O FK põe current_phase_id = NULL nas
    // solicitações, e esses formulários voltam ao board por status do código anterior.
    await queryRunner.query(
      `DELETE FROM "kanban_phases" p
       WHERE p."key" IN ('novo', 'pendente', 'concluido')
         AND (SELECT COUNT(*) FROM "kanban_phases" o WHERE o."form_id" = p."form_id") = 3
         AND NOT EXISTS (
           SELECT 1 FROM "kanban_phases" o
           WHERE o."form_id" = p."form_id" AND o."key" NOT IN ('novo', 'pendente', 'concluido')
         )
         AND NOT EXISTS (
           SELECT 1 FROM "kanban_phase_fields" kf
           JOIN "kanban_phases" o ON o."id" = kf."phase_id"
           WHERE o."form_id" = p."form_id"
         )`,
    );
  }
}
