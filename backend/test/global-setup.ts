import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { Client } from 'pg';

async function ensureTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, '').split('?')[0];
  url.pathname = '/postgres';

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV ??= 'test';
  process.env.ENABLE_EMAILS ??= 'false';
  process.env.JWT_SECRET ??=
    'e2e-jwt-secret-key-at-least-32-characters';
  process.env.DATABASE_URL ??=
    'postgresql://postgres:postgres@localhost:5432/edupay_test?schema=public';

  await ensureTestDatabase(process.env.DATABASE_URL);

  const backendRoot = path.resolve(__dirname, '..');
  execSync('npx prisma migrate deploy', {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
  });
}
