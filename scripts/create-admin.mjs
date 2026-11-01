import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16)
  throw new Error(
    'Supply ADMIN_EMAIL and ADMIN_PASSWORD (16+ characters) through secure environment variables',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await db.user.create({
    data: {
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hash(ADMIN_PASSWORD, {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
      firstName: 'Administrator',
      lastName: 'CONVYN',
      mobile: '+27000000000',
      consentAt: new Date(),
      role: 'ADMIN',
    },
  });
  console.log('Administrator created; sign in with email and password.');
} finally {
  await db.$disconnect();
}
