import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowExecutionContextFields1778873522682 implements MigrationInterface {
  name = 'FlowExecutionContextFields1778873522682';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flow_executions" ADD "event_name" character varying(100)`,
    );
    await queryRunner.query(`ALTER TABLE "flow_executions" ADD "solicitation_id" uuid`);
    await queryRunner.query(`ALTER TABLE "flow_executions" ADD "approval_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "approval_id"`);
    await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "solicitation_id"`);
    await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "event_name"`);
  }
}
