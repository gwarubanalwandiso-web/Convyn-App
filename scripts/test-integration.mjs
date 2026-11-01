import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
if (process.env.NODE_ENV === 'production')
  throw new Error('Integration runner refuses production');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Integration runner requires local PostgreSQL');
url.pathname = '/convyn_test';
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const exists = await client.query(
    'SELECT 1 FROM pg_database WHERE datname=$1',
    ['convyn_test'],
  );
  if (!exists.rowCount) await client.query('CREATE DATABASE convyn_test');
} finally {
  await client.end();
}
for (const file of [
  'scripts/migrate.mjs',
  'tests/integration/marketplace.mjs',
]) {
  const result = spawnSync(process.execPath, [file], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
