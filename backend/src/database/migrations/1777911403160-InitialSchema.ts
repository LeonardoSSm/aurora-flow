import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1777911403160 implements MigrationInterface {
  name = 'InitialSchema1777911403160';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "form_field_options" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "field_id" uuid NOT NULL, "internal_value" character varying(120) NOT NULL, "display_label" character varying(180) NOT NULL, "order" integer NOT NULL, CONSTRAINT "PK_b4dd7131048ba7271a2301867ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "form_fields" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_version_id" uuid NOT NULL, "section_id" uuid NOT NULL, "code" character varying(120) NOT NULL, "label" character varying(180) NOT NULL, "field_type" character varying(30) NOT NULL, "order" integer NOT NULL, "required" boolean NOT NULL DEFAULT false, "settings_json" jsonb NOT NULL DEFAULT '{}', "conditions_json" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_dc4b73290f2926c3a7d7c92d1e1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f64522783d06d588d2e09939be" ON "form_fields" ("form_version_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "form_sections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_version_id" uuid NOT NULL, "title" character varying(180) NOT NULL, "description" text, "order" integer NOT NULL, CONSTRAINT "PK_c1a1f14ff6a8f2f017e90261e2d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "submission_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "submission_id" uuid NOT NULL, "field_id" uuid NOT NULL, "field_code" character varying(120) NOT NULL, "value_text" text, "value_number" double precision, "value_boolean" boolean, "value_json" jsonb, CONSTRAINT "PK_1994165967389d779651005248e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" uuid NOT NULL, "form_version_id" uuid NOT NULL, "status" character varying(25) NOT NULL DEFAULT 'submitted', "responder_name" character varying(180), "responder_email" character varying(180), "submitted_at" TIMESTAMP WITH TIME ZONE, "submitter_ip" character varying(45), "submitter_user_agent" character varying(255), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_10b3be95b8b2fb1e482e07d706b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_submissions_form_id_submitted_at" ON "submissions" ("form_id", "submitted_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "form_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" uuid NOT NULL, "version_number" integer NOT NULL, "title_display" character varying(180) NOT NULL, "description_display" text, "is_published" boolean NOT NULL DEFAULT false, "published_at" TIMESTAMP WITH TIME ZONE, "settings_json" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_46dbd35ef6adf11a8684deae1b1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cdc3c166b14afa51ceac7f525b" ON "form_versions" ("form_id", "version_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "forms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(180) NOT NULL, "description" text, "status" character varying(25) NOT NULL DEFAULT 'draft', "category" character varying(120), "area" character varying(120), "created_by" uuid NOT NULL, "assigned_user_id" uuid, "google_sheets_enabled" boolean NOT NULL DEFAULT false, "google_sheets_auto_create" boolean NOT NULL DEFAULT false, "google_spreadsheet_id" character varying(255), "google_spreadsheet_url" text, "google_sheet_title" character varying(180), "google_linked_user_id" uuid, "google_last_synced_at" TIMESTAMP WITH TIME ZONE, "google_last_error" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba062fd30b06814a60756f233da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_forms_created_by_status" ON "forms" ("created_by", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying(150) NOT NULL, "email" character varying(180) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'editor', "is_active" boolean NOT NULL DEFAULT true, "token_version" integer NOT NULL DEFAULT '0', "google_sub" character varying(120), "google_account_email" character varying(180), "google_refresh_token" text, "google_access_token" text, "google_token_expires_at" TIMESTAMP WITH TIME ZONE, "google_connected_at" TIMESTAMP WITH TIME ZONE, "google_disconnected_at" TIMESTAMP WITH TIME ZONE, "google_last_used_at" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_68b61ba0fb359b93b517cf1073d" UNIQUE ("google_sub"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "audit_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid, "module" character varying(80) NOT NULL, "entity" character varying(120) NOT NULL, "entity_id" character varying(60) NOT NULL, "action" character varying(80) NOT NULL, "payload" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_module_created_at" ON "audit_events" ("module", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "google_sheets_sync_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" uuid NOT NULL, "submission_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'queued', "attempts" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '8', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "last_error" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3e58fecda21492ffb64786993b9" UNIQUE ("submission_id"), CONSTRAINT "PK_602e87924c4aa27503114947097" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40172e1909e12f45fca692aa2e" ON "google_sheets_sync_jobs" ("form_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7e176fa325e89d03b82e2d26ed" ON "google_sheets_sync_jobs" ("status", "next_attempt_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_token_id" uuid, "user_agent" character varying(255), "ip_address" character varying(45), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user_id_revoked_at" ON "refresh_tokens" ("user_id", "revoked_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "form_field_options" ADD CONSTRAINT "FK_4b1cd3cc470c401fb45778f8729" FOREIGN KEY ("field_id") REFERENCES "form_fields"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_fields" ADD CONSTRAINT "FK_3abcfea84755e14ddd59095677d" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_fields" ADD CONSTRAINT "FK_aba59d4fd998e34b736da0f59b3" FOREIGN KEY ("section_id") REFERENCES "form_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_sections" ADD CONSTRAINT "FK_44bb013fa4711eb511351603e16" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_items" ADD CONSTRAINT "FK_829a94d9c409078ab06a48b3667" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_items" ADD CONSTRAINT "FK_f927dec8ae39e74ececc5b92273" FOREIGN KEY ("field_id") REFERENCES "form_fields"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_82318f9579f8f3df8480d46990f" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD CONSTRAINT "FK_5388bfac87b8bf92f701730c44f" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_versions" ADD CONSTRAINT "FK_5270f702bc84ac42d6211ce4478" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "forms" ADD CONSTRAINT "FK_9d51c393dea8ee5d2751b50038a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "forms" ADD CONSTRAINT "FK_efebe6e84cb7dbcf1af2e0bb043" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "forms" ADD CONSTRAINT "FK_a544fd678700625e0cd1d27b550" FOREIGN KEY ("google_linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_04c7c044146c6632491a370fc04" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "google_sheets_sync_jobs" ADD CONSTRAINT "FK_341532d0f8a48f7b6599b763494" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "google_sheets_sync_jobs" ADD CONSTRAINT "FK_3e58fecda21492ffb64786993b9" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "google_sheets_sync_jobs" DROP CONSTRAINT "FK_3e58fecda21492ffb64786993b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "google_sheets_sync_jobs" DROP CONSTRAINT "FK_341532d0f8a48f7b6599b763494"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_04c7c044146c6632491a370fc04"`,
    );
    await queryRunner.query(`ALTER TABLE "forms" DROP CONSTRAINT "FK_a544fd678700625e0cd1d27b550"`);
    await queryRunner.query(`ALTER TABLE "forms" DROP CONSTRAINT "FK_efebe6e84cb7dbcf1af2e0bb043"`);
    await queryRunner.query(`ALTER TABLE "forms" DROP CONSTRAINT "FK_9d51c393dea8ee5d2751b50038a"`);
    await queryRunner.query(
      `ALTER TABLE "form_versions" DROP CONSTRAINT "FK_5270f702bc84ac42d6211ce4478"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_5388bfac87b8bf92f701730c44f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP CONSTRAINT "FK_82318f9579f8f3df8480d46990f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_items" DROP CONSTRAINT "FK_f927dec8ae39e74ececc5b92273"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submission_items" DROP CONSTRAINT "FK_829a94d9c409078ab06a48b3667"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_sections" DROP CONSTRAINT "FK_44bb013fa4711eb511351603e16"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_fields" DROP CONSTRAINT "FK_aba59d4fd998e34b736da0f59b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_fields" DROP CONSTRAINT "FK_3abcfea84755e14ddd59095677d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_field_options" DROP CONSTRAINT "FK_4b1cd3cc470c401fb45778f8729"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_user_id_revoked_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7e176fa325e89d03b82e2d26ed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_40172e1909e12f45fca692aa2e"`);
    await queryRunner.query(`DROP TABLE "google_sheets_sync_jobs"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_events_module_created_at"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_forms_created_by_status"`);
    await queryRunner.query(`DROP TABLE "forms"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cdc3c166b14afa51ceac7f525b"`);
    await queryRunner.query(`DROP TABLE "form_versions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_submissions_form_id_submitted_at"`);
    await queryRunner.query(`DROP TABLE "submissions"`);
    await queryRunner.query(`DROP TABLE "submission_items"`);
    await queryRunner.query(`DROP TABLE "form_sections"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f64522783d06d588d2e09939be"`);
    await queryRunner.query(`DROP TABLE "form_fields"`);
    await queryRunner.query(`DROP TABLE "form_field_options"`);
  }
}
