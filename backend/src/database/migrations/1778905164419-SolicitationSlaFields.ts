import type { MigrationInterface, QueryRunner } from "typeorm";

export class SolicitationSlaFields1778905164419 implements MigrationInterface {
    name = 'SolicitationSlaFields1778905164419'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_started_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_paused_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_due_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_breached_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE TYPE "public"."solicitations_sla_status_enum" AS ENUM('on_track', 'warning', 'breached', 'paused', 'completed')`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_status" "public"."solicitations_sla_status_enum"`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_warning_threshold_percent" integer DEFAULT '80'`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "sla_duration_hours" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_duration_hours"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_warning_threshold_percent"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_status"`);
        await queryRunner.query(`DROP TYPE "public"."solicitations_sla_status_enum"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_breached_at"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_due_at"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_paused_at"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "sla_started_at"`);
    }

}
