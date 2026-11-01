import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function seed() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Development seed refused in production');
  for (const name of ['Plumbing', 'Electrical', 'Cleaning', 'Automotive'])
    await db.category.upsert({ where: { name }, create: { name }, update: {} });
}
seed().finally(() => db.$disconnect());
