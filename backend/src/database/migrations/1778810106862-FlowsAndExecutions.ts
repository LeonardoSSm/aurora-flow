import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowsAndExecutions1778810106862 implements MigrationInterface {
  name = 'FlowsAndExecutions1778810106862';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "flows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "nodes" jsonb NOT NULL DEFAULT '[]', "edges" jsonb NOT NULL DEFAULT '[]', "viewport" jsonb, "created_by" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c346955f4318ef565e6928462fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_flows_form_id" ON "flows" ("form_id") `);
    await queryRunner.query(
      `CREATE TABLE "flow_executions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "flow_id" uuid NOT NULL, "submission_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'pending', "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "node_results" jsonb NOT NULL DEFAULT '[]', "error_message" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3f6404db5c4ffc05cc0564fbe8d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_flow_executions_flow_id" ON "flow_executions" ("flow_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "form_connectors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" uuid NOT NULL, "type" character varying(30) NOT NULL, "name" character varying(150) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "config" jsonb NOT NULL DEFAULT '{}', "last_sync_at" TIMESTAMP WITH TIME ZONE, "last_sync_status" character varying(255), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_228bd37636352d29e4a009eeed4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_form_connectors_form_id" ON "form_connectors" ("form_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "flows" ADD CONSTRAINT "FK_78c84e9a33aa04e2a8c10b50659" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flows" ADD CONSTRAINT "FK_c591ee53519ac5640f926ca97dd" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "flow_executions" ADD CONSTRAINT "FK_c88b525120ae8a8c7a3c6c93858" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_connectors" ADD CONSTRAINT "FK_7a4f2cc5f7c704f2ac3a540c132" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_connectors" DROP CONSTRAINT "FK_7a4f2cc5f7c704f2ac3a540c132"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flow_executions" DROP CONSTRAINT "FK_c88b525120ae8a8c7a3c6c93858"`,
    );
    await queryRunner.query(`ALTER TABLE "flows" DROP CONSTRAINT "FK_c591ee53519ac5640f926ca97dd"`);
    await queryRunner.query(`ALTER TABLE "flows" DROP CONSTRAINT "FK_78c84e9a33aa04e2a8c10b50659"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_connectors_form_id"`);
    await queryRunner.query(`DROP TABLE "form_connectors"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_flow_executions_flow_id"`);
    await queryRunner.query(`DROP TABLE "flow_executions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_flows_form_id"`);
    await queryRunner.query(`DROP TABLE "flows"`);
  }
}
