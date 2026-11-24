import type { MigrationInterface, QueryRunner } from "typeorm";

export class WhatsAppMessages1778903455470 implements MigrationInterface {
    name = 'WhatsAppMessages1778903455470'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_messages_status_enum" AS ENUM('sent', 'failed', 'queued', 'pending')`);
        await queryRunner.query(`CREATE TABLE "whatsapp_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "solicitation_id" uuid, "flow_execution_id" uuid, "to" character varying(30) NOT NULL, "message" text NOT NULL, "provider" character varying(50) NOT NULL, "external_message_id" character varying(255), "status" "public"."whatsapp_messages_status_enum" NOT NULL DEFAULT 'pending', "error_message" text, "sent_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_807bc612c6b98de7645a99805ca" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_whatsapp_messages_status_created_at" ON "whatsapp_messages" ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_whatsapp_messages_flow_execution_id" ON "whatsapp_messages" ("flow_execution_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_whatsapp_messages_solicitation_id" ON "whatsapp_messages" ("solicitation_id") `);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "requester_phone" character varying(30)`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD "responsible_phone" character varying(30)`);
        await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "FK_6b88a91a06989d53ba222e0cf16" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "FK_9bc98176399e4c410ed235bde15" FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP CONSTRAINT "FK_9bc98176399e4c410ed235bde15"`);
        await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP CONSTRAINT "FK_6b88a91a06989d53ba222e0cf16"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "responsible_phone"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP COLUMN "requester_phone"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_messages_solicitation_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_messages_flow_execution_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_whatsapp_messages_status_created_at"`);
        await queryRunner.query(`DROP TABLE "whatsapp_messages"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_messages_status_enum"`);
    }

}
