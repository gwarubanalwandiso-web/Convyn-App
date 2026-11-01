import { cpSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const dependencies = createRequire(import.meta.url);
const destination = process.argv[2];
if (!destination) throw new Error('Destination is required');
const source = path.resolve(
  path.dirname(dependencies.resolve('@prisma/client/package.json')),
  '../../.prisma/client',
);
const deployed = createRequire(path.resolve(destination, 'package.json'));
const nearest = path.resolve(
  path.dirname(deployed.resolve('@prisma/client/package.json')),
  '../../.prisma/client',
);
// A deploy postinstall can create a nearer placeholder that shadows a root copy.
// Replace the actual client's sibling as well as the conventional root location.
for (const target of new Set([
  nearest,
  path.join(destination, 'node_modules/.prisma/client'),
]))
  cpSync(source, target, { recursive: true });
const { PrismaClient, Prisma } = deployed('@prisma/client');
const { PrismaPg } = deployed('@prisma/adapter-pg');
if (!Prisma.ModelName || !Object.hasOwn(Prisma.ModelName, 'Booking'))
  throw new Error(
    'Generated marketplace schema is absent from deployment bundle',
  );
const client = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: 'postgresql://build:unused@127.0.0.1:5432/build',
  }),
});
await client.$disconnect();
