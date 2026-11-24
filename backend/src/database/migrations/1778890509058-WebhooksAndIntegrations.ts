import type { MigrationInterface, QueryRunner } from "typeorm";

export class WebhooksAndIntegrations1778890509058 implements MigrationInterface {
    name = 'WebhooksAndIntegrations1778890509058'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."inbound_webhook_events_status_enum" AS ENUM('received', 'processed', 'failed', 'ignored')`);
        await queryRunner.query(`CREATE TABLE "inbound_webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "endpoint_token" character varying(128) NOT NULL, "source_identifier" character varying(255), "headers" jsonb, "payload" jsonb, "raw_body" text, "signature_valid" boolean, "status" "public"."inbound_webhook_events_status_enum" NOT NULL DEFAULT 'received', "processed_at" TIMESTAMP WITH TIME ZONE, "error_message" text, "flow_execution_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_78213140fafe2e593bc7c8deb34" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_inbound_webhook_events_flow_execution_id" ON "inbound_webhook_events" ("flow_execution_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_inbound_webhook_events_status_created_at" ON "inbound_webhook_events" ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_inbound_webhook_events_endpoint_token" ON "inbound_webhook_events" ("endpoint_token") `);
        await queryRunner.query(`CREATE TYPE "public"."webhook_deliveries_status_enum" AS ENUM('pending', 'success', 'failed', 'retrying')`);
        await queryRunner.query(`CREATE TABLE "webhook_deliveries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "connector_id" uuid, "flow_execution_id" uuid, "url" character varying(2048) NOT NULL, "method" character varying(10) NOT NULL, "request_headers" jsonb, "request_body" text, "response_status" integer, "response_body" text, "status" "public"."webhook_deliveries_status_enum" NOT NULL DEFAULT 'pending', "attempt_count" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '3', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "error_message" text, "duration" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_535dd409947fb6d8fc6dfc0112a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_status_next_attempt" ON "webhook_deliveries" ("status", "next_attempt_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_flow_execution_id" ON "webhook_deliveries" ("flow_execution_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_connector_id" ON "webhook_deliveries" ("connector_id") `);
        await queryRunner.query(`CREATE TABLE "webhook_endpoints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "token" character varying(128) NOT NULL, "signing_secret" character varying(255), "is_active" boolean NOT NULL DEFAULT true, "description" text, "flow_trigger_enabled" boolean NOT NULL DEFAULT true, "created_by" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_054c4cfb95223732f5939d2d546" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_webhook_endpoints_created_by" ON "webhook_endpoints" ("created_by") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_webhook_endpoints_token" ON "webhook_endpoints" ("token") `);
        await queryRunner.query(`ALTER TABLE "inbound_webhook_events" ADD CONSTRAINT "FK_bb7f0b273eb30fe81dc989c249d" FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "FK_f5d975afb59decfa332983061fc" FOREIGN KEY ("connector_id") REFERENCES "form_connectors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "FK_9e88c31b73db8c2b6e9f7a9d829" FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "FK_32d6f53e9bba5f1ae847c082edc" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "webhook_endpoints" DROP CONSTRAINT "FK_32d6f53e9bba5f1ae847c082edc"`);
        await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "FK_9e88c31b73db8c2b6e9f7a9d829"`);
        await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP CONSTRAINT "FK_f5d975afb59decfa332983061fc"`);
        await queryRunner.query(`ALTER TABLE "inbound_webhook_events" DROP CONSTRAINT "FK_bb7f0b273eb30fe81dc989c249d"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_webhook_endpoints_token"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_endpoints_created_by"`);
        await queryRunner.query(`DROP TABLE "webhook_endpoints"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_deliveries_connector_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_deliveries_flow_execution_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_webhook_deliveries_status_next_attempt"`);
        await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
        await queryRunner.query(`DROP TYPE "public"."webhook_deliveries_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_inbound_webhook_events_endpoint_token"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_inbound_webhook_events_status_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_inbound_webhook_events_flow_execution_id"`);
        await queryRunner.query(`DROP TABLE "inbound_webhook_events"`);
        await queryRunner.query(`DROP TYPE "public"."inbound_webhook_events_status_enum"`);
    }

}
