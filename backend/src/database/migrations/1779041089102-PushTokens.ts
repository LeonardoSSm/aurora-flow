import type { MigrationInterface, QueryRunner } from "typeorm";

export class PushTokens1779041089102 implements MigrationInterface {
    name = 'PushTokens1779041089102'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "push_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token" character varying(255) NOT NULL, "platform" character varying(20) NOT NULL, "device_id" character varying(255), "is_active" boolean NOT NULL DEFAULT true, "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_cccfba5a4a655d21688fbebc9fb" UNIQUE ("user_id", "token"), CONSTRAINT "PK_32734e87f299c29ca3878861f4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "push_tokens" ADD CONSTRAINT "FK_94c371aff70dedeb89dae39f440" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "push_tokens" DROP CONSTRAINT "FK_94c371aff70dedeb89dae39f440"`);
        await queryRunner.query(`DROP TABLE "push_tokens"`);
    }

}
