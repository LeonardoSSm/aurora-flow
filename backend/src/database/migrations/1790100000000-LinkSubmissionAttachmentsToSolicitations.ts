import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anexos do formulário público só entravam na solicitação quando eram imagem e o formulário tinha um
 * fluxo "Anexo enviado"; os outros ficaram só com o envio e não apareciam no card. Liga esses à
 * solicitação do próprio envio. O down não desfaz: não dá para saber quais já estavam ligados.
 */
export class LinkSubmissionAttachmentsToSolicitations1790100000000 implements MigrationInterface {
  name = 'LinkSubmissionAttachmentsToSolicitations1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "attachments" a
          SET "solicitation_id" = s."id"
         FROM "solicitations" s
        WHERE a."solicitation_id" IS NULL
          AND a."submission_id" IS NOT NULL
          AND s."submission_id" = a."submission_id"`,
    );
  }

  public async down(): Promise<void> {
    // Sem volta: ver o comentário da classe.
  }
}
