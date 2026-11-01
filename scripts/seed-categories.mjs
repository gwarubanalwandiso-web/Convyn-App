import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const name of ['Plumbing', 'Electrical', 'Cleaning', 'Automotive'])
    await client.query(
      'INSERT INTO "Category"(id,name) VALUES ($1,$2) ON CONFLICT(name) DO NOTHING',
      [randomUUID(), name],
    );
  console.log(
    'Reference service categories are ready; no accounts or synthetic business records created.',
  );
} finally {
  await client.end();
}
