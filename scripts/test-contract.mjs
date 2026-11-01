import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
if (process.env.NODE_ENV === 'production')
  throw new Error('Contract tests refuse production');
const db = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(db.hostname))
  throw new Error('Contract tests require local PostgreSQL');
const admin = new URL(db);
admin.pathname = '/postgres';
db.pathname = '/convyn_contract_test';
const client = new Client({ connectionString: admin.toString() });
await client.connect();
try {
  if (
    !(
      await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [
        'convyn_contract_test',
      ])
    ).rowCount
  )
    await client.query('CREATE DATABASE convyn_contract_test');
} finally {
  await client.end();
}
for (const script of [
  'scripts/migrate.mjs',
  'tests/integration/contract.mjs',
]) {
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, DATABASE_URL: db.toString() },
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
