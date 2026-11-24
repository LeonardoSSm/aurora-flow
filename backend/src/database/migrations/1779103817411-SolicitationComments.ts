import type { MigrationInterface, QueryRunner } from "typeorm";

export class SolicitationComments1779103817411 implements MigrationInterface {
    name = 'SolicitationComments1779103817411'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "solicitation_comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "solicitation_id" uuid NOT NULL, "content" text NOT NULL, "is_internal" boolean NOT NULL DEFAULT false, "author_type" character varying(20) NOT NULL, "author_name" character varying(150), "author_email" character varying(255), "author_user_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_39db755c81adb98f2aef5ac1167" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "solicitation_comments" ADD CONSTRAINT "FK_61728e662a4c445ea28bb886df6" FOREIGN KEY ("solicitation_id") REFERENCES "solicitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "solicitation_comments" ADD CONSTRAINT "FK_7e13595a7af764cc72133750553" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "solicitation_comments" DROP CONSTRAINT "FK_7e13595a7af764cc72133750553"`);
        await queryRunner.query(`ALTER TABLE "solicitation_comments" DROP CONSTRAINT "FK_61728e662a4c445ea28bb886df6"`);
        await queryRunner.query(`DROP TABLE "solicitation_comments"`);
    }

}
