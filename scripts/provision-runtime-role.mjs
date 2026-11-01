import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { Prisma } from '@prisma/client';
const password = process.env.APP_DATABASE_PASSWORD;
if (!password || !/^[a-f0-9]{64}$/.test(password))
  throw new Error(
    'APP_DATABASE_PASSWORD must be a generated 32-byte hex secret',
  );
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT set_config($1,$2,true)', [
    'convyn.runtime_password',
    password,
  ]);
  await client.query(`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='convyn_app') THEN CREATE ROLE convyn_app LOGIN; END IF;
 EXECUTE format('ALTER ROLE convyn_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',current_setting('convyn.runtime_password'));
 END $$;`);
  await client.query('GRANT CONNECT ON DATABASE convyn TO convyn_app');
  await client.query('GRANT USAGE ON SCHEMA public TO convyn_app');
  await client.query(
    'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM convyn_app',
  );
  for (const table of Object.values(Prisma.ModelName)) {
    const identifier = '"' + table.replaceAll('"', '""') + '"';
    await client.query(
      'GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.' +
        identifier +
        ' TO convyn_app',
    );
  }
  await client.query(
    'REVOKE ALL ON TABLE public.convyn_schema_migrations FROM convyn_app',
  );
  await client.query(
    'REVOKE UPDATE,DELETE ON TABLE public."AuditLog" FROM convyn_app',
  );
  await client.query(
    await readFile(
      new URL('../prisma/contract-grants.sql', import.meta.url),
      'utf8',
    ),
  );
  await client.query('COMMIT');
  console.log(
    'Restricted API database role provisioned; migration ledger and audit mutation privileges protected.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
