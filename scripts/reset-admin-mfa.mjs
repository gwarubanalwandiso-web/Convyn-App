import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { verify } from '@node-rs/argon2';
import { authenticator } from 'otplib';

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_MFA_SECRET, ADMIN_MFA_CODE } =
  process.env;
if (
  !ADMIN_EMAIL ||
  !ADMIN_PASSWORD ||
  !/^[A-Z2-7]{32,}$/.test(ADMIN_MFA_SECRET || '') ||
  !/^\d{6}$/.test(ADMIN_MFA_CODE || '')
)
  throw new Error(
    'Provide admin email, current password, new base32 secret and new authenticator code through environment variables.',
  );

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: ADMIN_EMAIL.toLowerCase() },
      });
      if (
        !user ||
        user.role !== 'ADMIN' ||
        !(await verify(user.passwordHash, ADMIN_PASSWORD))
      )
        throw new Error(
          'Administrator credentials were not verified; no changes made.',
        );
      if (!authenticator.check(ADMIN_MFA_CODE, ADMIN_MFA_SECRET))
        throw new Error('New authenticator code is invalid; no changes made.');
      await tx.user.update({
        where: { id: user.id },
        data: { mfaSecret: ADMIN_MFA_SECRET },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  console.log(
    'Administrator MFA replaced and existing sessions revoked. Sign in with the new authenticator.',
  );
} finally {
  await db.$disconnect();
}
