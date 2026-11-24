import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Approvals1778871596749 implements MigrationInterface {
    name = 'Approvals1778871596749'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitation_history" DROP CONSTRAINT "FK_solicitation_history_solicitation_id"`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" DROP CONSTRAINT "FK_solicitation_history_actor_id"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_form_id"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_submission_id"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_created_by"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_solicitations_assignee_id"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_flows_created_by_name"`);
        await queryRunner.query(`CREATE TABLE "approvals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "solicitation_id" uuid NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'pending', "title" character varying(255) NOT NULL, "description" text, "required_decisions" integer NOT NULL DEFAULT '1', "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_690417aaefa84d18b1a59e2a499" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "approval_steps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approval_id" uuid NOT NULL, "assigned_user_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'pending', "order" integer NOT NULL DEFAULT '1', "decided_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_31089858f2c75f4648107ae5280" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "approval_decisions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approval_step_id" uuid NOT NULL, "decided_by_user_id" uuid, "decision" character varying(20) NOT NULL, "comment" text, "decided_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_5d6364197541b2608fff7b0aee" UNIQUE ("approval_step_id"), CONSTRAINT "PK_1ab59e2a6ef9cbc15372cf232e4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" ADD CONSTRAINT "FK_19f44c857574e2fc009f7f93a1d" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" ADD CONSTRAINT "FK_bc8605f875a917283aa024a3257" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_2a61022ea8cebbd3a6c6b603975" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_49324e39b9537dd38a56d0501ed" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_92a0d1da08dcce384eebffa2b18" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_d2c202af1f2ca7c9ce01964c006" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approvals" ADD CONSTRAINT "FK_13caa5984775aa3815d19a9c59b" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approvals" ADD CONSTRAINT "FK_3d217f7783d6e05635cdfc96091" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approval_steps" ADD CONSTRAINT "FK_39e1a7b7c882d881fed098ccd72" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approval_steps" ADD CONSTRAINT "FK_e07d693ce836742d7349fc962ea" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approval_decisions" ADD CONSTRAINT "FK_5d6364197541b2608fff7b0aee8" FOREIGN KEY ("approval_step_id") REFERENCES "approval_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approval_decisions" ADD CONSTRAINT "FK_8c5074f035752f3a5367c820a91" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "approval_decisions" DROP CONSTRAINT "FK_8c5074f035752f3a5367c820a91"`);
        await queryRunner.query(`ALTER TABLE "approval_decisions" DROP CONSTRAINT "FK_5d6364197541b2608fff7b0aee8"`);
        await queryRunner.query(`ALTER TABLE "approval_steps" DROP CONSTRAINT "FK_e07d693ce836742d7349fc962ea"`);
        await queryRunner.query(`ALTER TABLE "approval_steps" DROP CONSTRAINT "FK_39e1a7b7c882d881fed098ccd72"`);
        await queryRunner.query(`ALTER TABLE "approvals" DROP CONSTRAINT "FK_3d217f7783d6e05635cdfc96091"`);
        await queryRunner.query(`ALTER TABLE "approvals" DROP CONSTRAINT "FK_13caa5984775aa3815d19a9c59b"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_d2c202af1f2ca7c9ce01964c006"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_92a0d1da08dcce384eebffa2b18"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_49324e39b9537dd38a56d0501ed"`);
        await queryRunner.query(`ALTER TABLE "solicitations" DROP CONSTRAINT "FK_2a61022ea8cebbd3a6c6b603975"`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" DROP CONSTRAINT "FK_bc8605f875a917283aa024a3257"`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" DROP CONSTRAINT "FK_19f44c857574e2fc009f7f93a1d"`);
        await queryRunner.query(`DROP TABLE "approval_decisions"`);
        await queryRunner.query(`DROP TABLE "approval_steps"`);
        await queryRunner.query(`DROP TABLE "approvals"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_flows_created_by_name" ON "flows" ("created_by") `);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_assignee_id" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_submission_id" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitations" ADD CONSTRAINT "FK_solicitations_form_id" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" ADD CONSTRAINT "FK_solicitation_history_actor_id" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitation_history" ADD CONSTRAINT "FK_solicitation_history_solicitation_id" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
