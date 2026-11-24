import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grade livre — cada bloco ganha posicao (x, y) e tamanho (w, h) proprios, em
 * vez de so uma largura de 1 ou 2 colunas empilhada por ordem.
 *
 * Convencao: grade de 12 colunas, mesma unidade que o react-grid-layout usa no
 * front. `position` deixa de decidir onde o bloco fica — quem decide agora e
 * (x, y) — mas a coluna continua existindo como criterio de desempate estavel
 * (ordem de leitura para acessibilidade, e ordem de criacao de blocos que ainda
 * nao tem layout, como os da sugestao automatica).
 *
 * O backfill dos blocos ja salvos empacota da esquerda para a direita, na
 * mesma ordem que eles apareciam na grade antiga: `width` 1 vira meia grade
 * (w=6), `width` 2 vira grade cheia (w=12), e a altura vem do formato do bloco
 * — kpi e mais baixo que grafico. Feito em JS, nao em SQL, porque e um
 * empacotamento com estado (cursor x/y por painel), e os paineis existentes em
 * qualquer ambiente sao poucos.
 */
export class DashboardWidgetLayout1787200000000 implements MigrationInterface {
  name = 'DashboardWidgetLayout1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" ADD "x" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" ADD "y" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" ADD "w" integer NOT NULL DEFAULT 6`);
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" ADD "h" integer NOT NULL DEFAULT 4`);

    const linhas: Array<{ id: string; dashboard_id: string; kind: string; width: number }> =
      await queryRunner.query(
        `SELECT id, dashboard_id, kind, width FROM "dashboard_widgets" ORDER BY dashboard_id, position, created_at`,
      );

    const cursores = new Map<string, { x: number; y: number; alturaLinha: number }>();
    const COLS = 12;

    for (const linha of linhas) {
      const w = linha.width >= 2 ? 12 : 6;
      const h = linha.kind === 'kpi' ? 3 : 5;

      const cursor = cursores.get(linha.dashboard_id) ?? { x: 0, y: 0, alturaLinha: 0 };
      if (cursor.x + w > COLS) {
        cursor.x = 0;
        cursor.y += cursor.alturaLinha;
        cursor.alturaLinha = 0;
      }

      await queryRunner.query(
        `UPDATE "dashboard_widgets" SET x = $1, y = $2, w = $3, h = $4 WHERE id = $5`,
        [cursor.x, cursor.y, w, h, linha.id],
      );

      cursor.x += w;
      cursor.alturaLinha = Math.max(cursor.alturaLinha, h);
      cursores.set(linha.dashboard_id, cursor);
    }

    await queryRunner.query(`ALTER TABLE "dashboard_widgets" DROP COLUMN "width"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dashboard_widgets" ADD "width" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `UPDATE "dashboard_widgets" SET width = CASE WHEN w >= 12 THEN 2 ELSE 1 END`,
    );
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" DROP COLUMN "h"`);
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" DROP COLUMN "w"`);
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" DROP COLUMN "y"`);
    await queryRunner.query(`ALTER TABLE "dashboard_widgets" DROP COLUMN "x"`);
  }
}
