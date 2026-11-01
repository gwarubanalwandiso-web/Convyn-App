import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
if (process.env.NODE_ENV === 'production')
  throw new Error('Development setup refuses production');
if (!existsSync('.env')) {
  const password = randomBytes(24).toString('hex');
  writeFileSync(
    '.env',
    `DATABASE_URL=postgresql://convyn:${password}@localhost:5432/convyn\nLOCAL_DB_PASSWORD=${password}\nREDIS_URL=redis://localhost:6379\nPORT=4000\n`,
    { mode: 0o600 },
  );
}
config({ quiet: true });
for (const [command, args] of [
  ['docker', ['compose', 'up', '-d', '--wait']],
  ['pnpm', ['db:generate']],
  ['pnpm', ['db:migrate']],
  ['pnpm', ['db:seed']],
]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
