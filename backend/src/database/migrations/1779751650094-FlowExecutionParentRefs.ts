import type { MigrationInterface, QueryRunner } from "typeorm";

export class FlowExecutionParentRefs1779751650094 implements MigrationInterface {
    name = 'FlowExecutionParentRefs1779751650094'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "flow_executions" ADD "parent_flow_id" uuid`);
        await queryRunner.query(`ALTER TABLE "flow_executions" ADD "parent_execution_id" uuid`);
        await queryRunner.query(`ALTER TABLE "erp_operation_templates" ALTER COLUMN "success_status_codes" SET DEFAULT '[200,201]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "erp_operation_templates" ALTER COLUMN "success_status_codes" SET DEFAULT '[200, 201]'`);
        await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "parent_execution_id"`);
        await queryRunner.query(`ALTER TABLE "flow_executions" DROP COLUMN "parent_flow_id"`);
    }

}
