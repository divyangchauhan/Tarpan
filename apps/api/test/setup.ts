/**
 * Loaded by jest-e2e.json `setupFiles` before each test file.
 * Sets process.env from .env.test so that ConfigModule picks up test values
 * instead of the development .env.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.test'), override: true });
