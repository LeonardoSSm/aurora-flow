import type { MigrationInterface, QueryRunner } from "typeorm";

export class ErpConnector1779119948237 implements MigrationInterface {
    name = 'ErpConnector1779119948237'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "erp_connectors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "base_url" character varying(500) NOT NULL, "bearer_token" character varying(1000) NOT NULL, "default_headers" jsonb, "timeout_ms" integer NOT NULL DEFAULT '15000', "is_active" boolean NOT NULL DEFAULT true, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_653fc6277e0f3227dc8d37bf507" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_erp_connectors_created_by" ON "erp_connectors" ("created_by") `);
        await queryRunner.query(`CREATE TABLE "erp_operation_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "connector_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "description" text, "method" character varying(10) NOT NULL, "endpoint_path" character varying(500) NOT NULL, "body_template" text, "success_status_codes" jsonb NOT NULL DEFAULT '[200,201]', "save_response_field" character varying(100), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_381cd1a033a6dbba03f6f4f4e2a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_erp_templates_connector_id" ON "erp_operation_templates" ("connector_id") `);
        await queryRunner.query(`CREATE TABLE "erp_operation_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "template_id" uuid, "connector_id" uuid NOT NULL, "solicitation_id" uuid, "flow_execution_id" uuid, "status" character varying(20) NOT NULL, "request_url" character varying(1000) NOT NULL, "request_body" text, "response_status" integer, "response_body" text, "error_message" text, "attempt_count" integer NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "duration_ms" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba9f8519d049dc4943eeec8dba6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_erp_logs_status_next_attempt" ON "erp_operation_logs" ("status", "next_attempt_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_erp_logs_solicitation_id" ON "erp_operation_logs" ("solicitation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_erp_logs_connector_id" ON "erp_operation_logs" ("connector_id") `);
        await queryRunner.query(`ALTER TABLE "erp_connectors" ADD CONSTRAINT "FK_e88016560df802fd10fe84ece48" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "erp_operation_templates" ADD CONSTRAINT "FK_8c021aff5d83ccf157af91b363e" FOREIGN KEY ("connector_id") REFERENCES "erp_connectors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" ADD CONSTRAINT "FK_b519b083a29c0daff91d51f0ad5" FOREIGN KEY ("template_id") REFERENCES "erp_operation_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" ADD CONSTRAINT "FK_4a6806070cf920e5d295fe79e44" FOREIGN KEY ("connector_id") REFERENCES "erp_connectors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" ADD CONSTRAINT "FK_ff0eff477347e4bb4b2cf8deaba" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" ADD CONSTRAINT "FK_2a264dcc5b64bad0b94a2d94a6d" FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" DROP CONSTRAINT "FK_2a264dcc5b64bad0b94a2d94a6d"`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" DROP CONSTRAINT "FK_ff0eff477347e4bb4b2cf8deaba"`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" DROP CONSTRAINT "FK_4a6806070cf920e5d295fe79e44"`);
        await queryRunner.query(`ALTER TABLE "erp_operation_logs" DROP CONSTRAINT "FK_b519b083a29c0daff91d51f0ad5"`);
        await queryRunner.query(`ALTER TABLE "erp_operation_templates" DROP CONSTRAINT "FK_8c021aff5d83ccf157af91b363e"`);
        await queryRunner.query(`ALTER TABLE "erp_connectors" DROP CONSTRAINT "FK_e88016560df802fd10fe84ece48"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_erp_logs_connector_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_erp_logs_solicitation_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_erp_logs_status_next_attempt"`);
        await queryRunner.query(`DROP TABLE "erp_operation_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_erp_templates_connector_id"`);
        await queryRunner.query(`DROP TABLE "erp_operation_templates"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_erp_connectors_created_by"`);
        await queryRunner.query(`DROP TABLE "erp_connectors"`);
    }

}
