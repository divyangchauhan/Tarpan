import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Used by TypeORM CLI (migration:generate, migration:run, etc.)
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'] ?? 'postgresql://afterlight:afterlight@localhost:5432/afterlight',
  entities: [path.resolve(__dirname, '../entities/*.{ts,js}')],
  migrations: [path.resolve(__dirname, './migrations/*.{ts,js}')],
  synchronize: false,
});
