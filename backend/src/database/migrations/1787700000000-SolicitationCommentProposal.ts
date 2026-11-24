import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SolicitationCommentProposal1787700000000 implements MigrationInterface {
  name = 'SolicitationCommentProposal1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "solicitation_comments" ADD "proposal_status" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_comments" ADD "proposal_decided_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_comments" ADD "proposal_rejection_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "solicitation_comments" DROP COLUMN "proposal_rejection_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitation_comments" DROP COLUMN "proposal_decided_at"`,
    );
    await queryRunner.query(`ALTER TABLE "solicitation_comments" DROP COLUMN "proposal_status"`);
  }
}
