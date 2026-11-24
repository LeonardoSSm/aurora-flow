import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { entities } from './entities';

dotenv.config();

/**
 * Standalone DataSource used by the TypeORM CLI for generating and running migrations.
 * This is separate from the NestJS app DataSource to support CLI usage without bootstrapping NestJS.
 *
 * Usage:
 *   npx typeorm -d src/database/data-source.ts migration:generate src/database/migrations/MigrationName
 *   npx typeorm -d src/database/data-source.ts migration:run
 *   npx typeorm -d src/database/data-source.ts migration:revert
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'formhub',
  password: process.env.DB_PASSWORD ?? 'formhub',
  database: process.env.DB_NAME ?? 'formhub',
  entities,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
