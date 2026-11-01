import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_MFA_SECRET } = process.env;
if (
  !ADMIN_EMAIL ||
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.length < 16 ||
  !ADMIN_MFA_SECRET ||
  !/^[A-Z2-7]{32,}$/.test(ADMIN_MFA_SECRET)
)
  throw new Error(
    'Supply ADMIN_EMAIL, ADMIN_PASSWORD (16+ characters), and a valid ADMIN_MFA_SECRET through secure environment variables',
  );
authenticator.generate(ADMIN_MFA_SECRET);
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
      mfaSecret: ADMIN_MFA_SECRET,
    },
  });
  console.log(
    'Administrator created; sign-in requires the configured authenticator.',
  );
} finally {
  await db.$disconnect();
}
