/**
 * Jest globalSetup — runs once before all e2e test suites.
 * Creates the afterlight_test database if it doesn't exist.
 * TypeORM's migrationsRun:true handles schema setup when the app boots.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Client } from 'pg';

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.join(__dirname, '..', '.env.test'), override: true });

  const dbUrl = process.env['DATABASE_URL'] ?? '';
  // Connect to the postgres maintenance database to run CREATE DATABASE
  const maintenanceUrl = dbUrl.replace(/\/[^/]+$/, '/postgres');

  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();

  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT 1 AS exists FROM pg_database WHERE datname = 'afterlight_test'`,
  );

  if (rows.length === 0) {
    await client.query('CREATE DATABASE afterlight_test');
    console.log('[globalSetup] Created database afterlight_test');
  }

  await client.end();
}
