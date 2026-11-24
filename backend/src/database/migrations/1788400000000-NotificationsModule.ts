import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de notificações do motor de fluxos (nó `action_notification`).
 *
 * Três tabelas novas — só adiciona, não altera dado nem contrato existente:
 *  - `notification_messages`   → a notificação solicitada (conteúdo renderizado, canal, origem
 *    no fluxo/execução/nó, chave de idempotência);
 *  - `notification_recipients` → um registro por destinatário: é a unidade de entrega e a fila
 *    do worker (`status` + `next_attempt_at`);
 *  - `notification_attempts`   → cada tentativa de envio (auditoria, erro sanitizado).
 *
 * E uma coluna opcional em `notifications` (a caixa de entrada in-app que já existia): `title`.
 * Nulo para tudo que já está lá — nada precisa ser migrado.
 *
 * `notification_messages.flow_id`/`flow_execution_id`/`solicitation_id` são `ON DELETE SET NULL`:
 * apagar um fluxo/solicitação não apaga o histórico de envio (que tem expurgo próprio por
 * retenção — NOTIFICATIONS_RETENTION_DAYS).
 *
 * Os nomes de FK/PK seguem exatamente os que o TypeORM calcula a partir das entidades, para que
 * `synchronize` (dev/teste) não enxergue diferença.
 */
export class NotificationsModule1788400000000 implements MigrationInterface {
  name = 'NotificationsModule1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel" character varying(20) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "priority" character varying(10) NOT NULL DEFAULT 'normal', "title" character varying(200), "body" text NOT NULL, "scheduled_for" TIMESTAMP WITH TIME ZONE, "max_attempts" smallint NOT NULL DEFAULT '3', "backoff_seconds" integer NOT NULL DEFAULT '30', "idempotency_key" character varying(100), "flow_id" uuid, "flow_execution_id" uuid, "node_id" character varying(100), "solicitation_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}', "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_025a03ac35a495f0a6d8730350d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_messages_idempotency_key" ON "notification_messages" ("idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_messages_created_at" ON "notification_messages" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_messages_flow_id_created_at" ON "notification_messages" ("flow_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_messages_flow_execution_id" ON "notification_messages" ("flow_execution_id") `,
    );

    await queryRunner.query(
      `CREATE TABLE "notification_recipients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "notification_id" uuid NOT NULL, "user_id" uuid, "source" character varying(20) NOT NULL, "display_name" character varying(150), "address" character varying(255), "recipient_key" character varying(255) NOT NULL, "status" character varying(20) NOT NULL, "priority_rank" smallint NOT NULL DEFAULT '1', "attempt_count" smallint NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL, "locked_at" TIMESTAMP WITH TIME ZONE, "provider" character varying(40), "provider_message_id" character varying(255), "last_error_category" character varying(30), "last_error" character varying(500), "sent_at" TIMESTAMP WITH TIME ZONE, "delivered_at" TIMESTAMP WITH TIME ZONE, "failed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bd5b25c456987261a38c762b223" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_recipients_message_key" ON "notification_recipients" ("notification_id", "recipient_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_recipients_processing" ON "notification_recipients" ("locked_at") WHERE "status" = 'processing'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_recipients_due" ON "notification_recipients" ("priority_rank", "next_attempt_at") WHERE "status" IN ('pending','scheduled')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_recipients_notification_id" ON "notification_recipients" ("notification_id") `,
    );

    await queryRunner.query(
      `CREATE TABLE "notification_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipient_id" uuid NOT NULL, "attempt_number" smallint NOT NULL, "status" character varying(12) NOT NULL, "provider" character varying(40), "provider_message_id" character varying(255), "error_category" character varying(30), "error_message" character varying(500), "http_status" smallint, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "finished_at" TIMESTAMP WITH TIME ZONE, "duration_ms" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f6abd34f351bbbf11c7ae8e7565" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_attempts_recipient_attempt" ON "notification_attempts" ("recipient_id", "attempt_number") `,
    );

    await queryRunner.query(`ALTER TABLE "notifications" ADD "title" character varying(150)`);

    await queryRunner.query(
      `ALTER TABLE "notification_messages" ADD CONSTRAINT "FK_ddb3f04e3f95a93aa21c3b5030b" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" ADD CONSTRAINT "FK_0ea78d855fe2488c5e9df3f71a9" FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" ADD CONSTRAINT "FK_7cee1fd2ace59ca3650629d422f" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD CONSTRAINT "FK_021580b5aa0ee301ee359752b45" FOREIGN KEY ("notification_id") REFERENCES "notification_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD CONSTRAINT "FK_3c1147687827d3dd27ebfb4a4af" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_attempts" ADD CONSTRAINT "FK_f73d33318403eed8edb732ec318" FOREIGN KEY ("recipient_id") REFERENCES "notification_recipients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_attempts" DROP CONSTRAINT "FK_f73d33318403eed8edb732ec318"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_3c1147687827d3dd27ebfb4a4af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_021580b5aa0ee301ee359752b45"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" DROP CONSTRAINT "FK_7cee1fd2ace59ca3650629d422f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" DROP CONSTRAINT "FK_0ea78d855fe2488c5e9df3f71a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" DROP CONSTRAINT "FK_ddb3f04e3f95a93aa21c3b5030b"`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "title"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_notification_attempts_recipient_attempt"`);
    await queryRunner.query(`DROP TABLE "notification_attempts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_recipients_notification_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_recipients_due"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_recipients_processing"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_notification_recipients_message_key"`);
    await queryRunner.query(`DROP TABLE "notification_recipients"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_messages_flow_execution_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_messages_flow_id_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_messages_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_notification_messages_idempotency_key"`);
    await queryRunner.query(`DROP TABLE "notification_messages"`);
  }
}
