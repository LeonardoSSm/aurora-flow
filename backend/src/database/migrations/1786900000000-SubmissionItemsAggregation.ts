import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prepara `submission_items` para agregacao — base do modulo de dashboards.
 *
 * Duas correcoes, ambas de problemas que hoje nao doem porque a base e pequena:
 *
 * 1. A tabela nao tinha indice nenhum alem da PK em `id`. As duas chaves
 *    estrangeiras nao criam indice no Postgres, entao toda agregacao por campo
 *    era varredura completa. O indice composto atende tanto a juncao por
 *    submissao quanto o filtro por codigo de campo.
 *
 * 2. Campo monetario era gravado so em `value_text` ("R$ 1.500,00"), com
 *    `value_number` nulo — apesar de o analytics classifica-lo como numerico.
 *    Na pratica, campo de moeda nunca produziu estatistica. O backfill preenche
 *    `value_number` das respostas ja existentes; a partir daqui o proprio
 *    validador grava as duas colunas.
 *
 * Todos os consumidores leem `value_text` antes de `value_number` (planilhas,
 * exportacao, fluxos, conectores), entao preencher a coluna numerica nao muda
 * nada do que ja e exibido.
 */
export class SubmissionItemsAggregation1786900000000 implements MigrationInterface {
  name = 'SubmissionItemsAggregation1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_submission_items_submission_id_field_code"
       ON "submission_items" ("submission_id", "field_code")`,
    );

    // Só converte o que sobra estritamente numérico depois da limpeza; qualquer
    // valor fora do padrão fica nulo em vez de derrubar a migração.
    await queryRunner.query(`
      UPDATE "submission_items" si
      SET "value_number" = sub.parsed
      FROM (
        SELECT
          i."id",
          CASE
            WHEN cleaned ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN cleaned::double precision
            ELSE NULL
          END AS parsed
        FROM (
          SELECT
            si2."id",
            regexp_replace(
              replace(replace(replace(si2."value_text", 'R$', ''), '.', ''), ',', '.'),
              '[^0-9.\\-]', '', 'g'
            ) AS cleaned
          FROM "submission_items" si2
          INNER JOIN "form_fields" f ON f."id" = si2."field_id"
          WHERE f."field_type" = 'currency'
            AND si2."value_text" IS NOT NULL
            AND si2."value_number" IS NULL
        ) i
      ) sub
      WHERE sub."id" = si."id" AND sub.parsed IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Devolve `value_number` dos campos monetários ao estado anterior (nulo).
    await queryRunner.query(`
      UPDATE "submission_items" si
      SET "value_number" = NULL
      FROM "form_fields" f
      WHERE f."id" = si."field_id" AND f."field_type" = 'currency'
    `);

    await queryRunner.query(`DROP INDEX "public"."IDX_submission_items_submission_id_field_code"`);
  }
}
