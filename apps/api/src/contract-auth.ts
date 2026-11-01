import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { hash } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from './database';
import { AuthRequest, digest, parse, SessionGuard } from './auth';
import { ContractErrorFilter } from './contract';
const jwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const opaque = () => randomBytes(32).toString('base64url');
const passwordSchema = z.string().min(16).max(128);
const publicSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;
const passwordHash = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
function origin() {
  if (!process.env.APP_ORIGIN)
    throw new ServiceUnavailableException(
      'The application origin is not configured',
    );
  return new URL(process.env.APP_ORIGIN).origin;
}
async function mail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    throw new ServiceUnavailableException(
      'Email delivery is not configured. Contact support.',
    );
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  } catch {
    throw new ServiceUnavailableException(
      'Email could not be sent. Please try again later.',
    );
  } finally {
    transport.close();
  }
}
async function issueSession(db: Database, userId: string, res: Response) {
  const accessToken = opaque(),
    refreshToken = opaque();
  await db.session.create({
    data: {
      userId,
      tokenHash: digest(accessToken),
      refreshHash: digest(refreshToken),
      accessExpiresAt: new Date(Date.now() + 30 * 60000),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  res.cookie('convyn_refresh', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: 7 * 86400000,
  });
  res.setHeader('Cache-Control', 'no-store');
  return {
    accessToken,
    expiresIn: 1800,
    user: await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: publicSelect,
    }),
  };
}
@Controller('v1/marketplace/auth')
@UseFilters(ContractErrorFilter)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class ContractAuthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Post('forgot-password') async forgot(@Body() body: unknown) {
    const { email } = parse(
      z.object({ email: z.email().transform((s) => s.toLowerCase()) }).strict(),
      body,
    );
    // Configuration failure is reported uniformly, without revealing whether the account exists.
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Contact support.',
      );
    const base = origin(),
      user = await this.db.user.findUnique({
        where: { email },
        select: { id: true },
      });
    if (user) {
      const token = opaque(),
        id = randomBytes(16).toString('hex');
      await this.db.$executeRawUnsafe(
        'INSERT INTO marketplace."PasswordRecovery"(created_by_id,token_hash,expires_at) VALUES($1::uuid,$2,now()+interval \'20 minutes\')',
        user.id,
        digest(token),
      );
      try {
        await mail(
          email,
          'Reset your CONVYN password',
          `Use this link within 20 minutes to choose a new password: ${base}/reset-password#token=${token}\nIf you did not request this, ignore this message. Reference: ${id}`,
        );
      } catch {
        await this.db.$executeRawUnsafe(
          'DELETE FROM marketplace."PasswordRecovery" WHERE token_hash=$1',
          digest(token),
        );
        console.error('Password recovery email delivery failed');
      }
    }
    return {
      message:
        'If this email matches an account, check your inbox for reset instructions.',
    };
  }
  @Post('reset-password') async reset(@Body() body: unknown) {
    const input = parse(
      z
        .object({
          token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          password: passwordSchema,
        })
        .strict(),
      body,
    );
    const encoded = await passwordHash(input.password);
    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        { id: string; created_by_id: string }[]
      >(
        'SELECT id,created_by_id FROM marketplace."PasswordRecovery" WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE',
        digest(input.token),
      );
      const recovery = rows[0];
      if (!recovery)
        throw new BadRequestException(
          'This reset link is invalid or has expired',
        );
      await tx.user.update({
        where: { id: recovery.created_by_id },
        data: { passwordHash: encoded },
      });
      await tx.session.updateMany({
        where: { userId: recovery.created_by_id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.$executeRawUnsafe(
        'UPDATE marketplace."PasswordRecovery" SET used_at=now() WHERE created_by_id=$1::uuid AND used_at IS NULL',
        recovery.created_by_id,
      );
      await tx.$queryRawUnsafe(
        "SELECT set_config('convyn.actor_id',$1,true)",
        recovery.created_by_id,
      );
      await tx.$queryRawUnsafe(
        "SELECT marketplace.record_account_audit($1::uuid,'password_reset','{}')::text",
        recovery.created_by_id,
      );
    });
    return { message: 'Password updated. Sign in with your new password.' };
  }
  @Post('register') async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z
        .object({
          email: z.email().transform((s) => s.toLowerCase()),
          firstName: z.string().trim().min(1).max(80),
          lastName: z.string().trim().min(1).max(80),
          mobile: z.string().regex(/^\+[1-9]\d{7,14}$/),
          password: z.string().min(12).max(128),
          consent: z.literal(true),
          role: z.enum(['CUSTOMER', 'PROVIDER']).default('CUSTOMER'),
          invite: z
            .string()
            .regex(/^[A-Za-z0-9_-]{43}$/)
            .optional(),
        })
        .strict(),
      body,
    );
    const encoded = await passwordHash(input.password);
    const user = await this.db.$transaction(async (tx) => {
      let role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' = input.role;
      if (input.invite) {
        const rows = await tx.$queryRawUnsafe<
          { id: string; role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' }[]
        >(
          'SELECT id,role FROM marketplace."Invitation" WHERE token_hash=$1 AND email=$2 AND expires_at>now() AND redeemed_at IS NULL FOR UPDATE',
          digest(input.invite),
          input.email,
        );
        if (!rows[0])
          throw new BadRequestException('Invitation is invalid or expired');
        role = rows[0].role;
        await tx.$executeRawUnsafe(
          'UPDATE marketplace."Invitation" SET redeemed_at=now() WHERE id=$1::uuid',
          rows[0].id,
        );
      }
      return tx.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          mobile: input.mobile,
          passwordHash: encoded,
          role,
          consentAt: new Date(),
          ...(role === 'PROVIDER' ? { provider: { create: {} } } : {}),
        },
        select: { id: true },
      });
    });
    return issueSession(this.db, user.id, res);
  }
  @Get('google/start') async googleStart(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.OAUTH_STATE_SECRET ||
      process.env.OAUTH_STATE_SECRET.length < 32
    )
      throw new ServiceUnavailableException('Google sign-in is not configured');
    if (req.get('host') !== new URL(origin()).host) {
      res.redirect(origin() + '/v1/marketplace/auth/google/start');
      return;
    }
    const state = opaque(),
      nonce = opaque(),
      verifier = opaque();
    const signed = await new SignJWT({ state, nonce, verifier })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setAudience('convyn-google-callback')
      .sign(new TextEncoder().encode(process.env.OAUTH_STATE_SECRET));
    res.cookie('convyn_oauth_state', signed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/v1/marketplace/auth/google',
      maxAge: 300000,
    });
    const redirect =
      process.env.GOOGLE_REDIRECT_URI ||
      origin() + '/v1/marketplace/auth/google/callback';
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    res.redirect(url.toString());
  }
  @Get('google/callback') async googleCallback(
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)convyn_oauth_state=([^;]+)/,
    )?.[1];
    res.clearCookie('convyn_oauth_state', {
      path: '/v1/marketplace/auth/google',
    });
    if (
      !cookie ||
      !query.code ||
      !query.state ||
      !process.env.OAUTH_STATE_SECRET
    )
      throw new BadRequestException('Google sign-in could not be verified');
    const { payload } = await jwtVerify(
      decodeURIComponent(cookie),
      new TextEncoder().encode(process.env.OAUTH_STATE_SECRET),
      { audience: 'convyn-google-callback', algorithms: ['HS256'] },
    );
    if (payload.state !== query.state || typeof payload.verifier !== 'string')
      throw new BadRequestException('Google sign-in state mismatch');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: query.code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:
          process.env.GOOGLE_REDIRECT_URI ||
          origin() + '/v1/marketplace/auth/google/callback',
        grant_type: 'authorization_code',
        code_verifier: payload.verifier,
      }),
    });
    if (!response.ok)
      throw new BadRequestException('Google sign-in was not accepted');
    const token = (await response.json()) as { id_token: string };
    const identity = await jwtVerify(token.id_token, jwks, {
      audience: process.env.GOOGLE_CLIENT_ID,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });
    if (
      identity.payload.nonce !== payload.nonce ||
      identity.payload.email_verified !== true ||
      typeof identity.payload.sub !== 'string'
    )
      throw new BadRequestException('Google identity was not verified');
    const email = parse(z.email(), identity.payload.email).toLowerCase(),
      generatedPassword = await passwordHash(opaque());
    const user = await this.db.$transaction(async (tx) => {
      const linked = await tx.$queryRawUnsafe<{ user_id: string }[]>(
        'SELECT user_id FROM marketplace."OAuthIdentity" WHERE provider=\'google\' AND subject=$1',
        identity.payload.sub,
      );
      if (linked[0]) return { id: linked[0].user_id };
      const account = await tx.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          firstName: String(
            identity.payload.given_name ?? 'CONVYN member',
          ).slice(0, 80),
          lastName: String(identity.payload.family_name ?? '').slice(0, 80),
          mobile: '+27000000000',
          passwordHash: generatedPassword,
          role: 'CUSTOMER',
          consentAt: new Date(),
        },
        select: { id: true },
      });
      await tx.$executeRawUnsafe(
        'INSERT INTO marketplace."OAuthIdentity"(provider,subject,user_id) VALUES(\'google\',$1,$2::uuid)',
        identity.payload.sub,
        account.id,
      );
      return account;
    });
    await issueSession(this.db, user.id, res);
    res.redirect(origin() + '/dashboard#signed-in');
  }
}
@Controller('v1/marketplace')
@UseGuards(SessionGuard)
@UseFilters(ContractErrorFilter)
export class ContractMailController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Post('invites') async invite(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (req.actor.role !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    const input = parse(
        z
          .object({
            email: z.email().transform((s) => s.toLowerCase()),
            role: z.enum(['CUSTOMER', 'PROVIDER', 'ADMIN']),
          })
          .strict(),
        body,
      ),
      token = opaque();
    const base = origin();
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
      throw new ServiceUnavailableException('Email delivery is not configured');
    await this.db.$executeRawUnsafe(
      'INSERT INTO marketplace."Invitation"(created_by_id,email,role,token_hash,expires_at) VALUES($1::uuid,$2,$3,$4,now()+interval \'48 hours\')',
      req.actor.id,
      input.email,
      input.role,
      digest(token),
    );
    try {
      await mail(
        input.email,
        'Your CONVYN invitation',
        `You have been invited to CONVYN. Register using this link within 48 hours: ${base}/register#invite=${token}`,
      );
    } catch (error) {
      await this.db.$executeRawUnsafe(
        'DELETE FROM marketplace."Invitation" WHERE token_hash=$1',
        digest(token),
      );
      throw error;
    }
    return { message: 'Invitation sent' };
  }
  @Post('messages') async message(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (req.actor.role !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    const input = parse(
      z
        .object({
          recipient: z.union([z.email(), z.literal('all')]),
          title: z.string().min(1).max(200),
          body: z.string().min(1).max(3000),
          link: z
            .string()
            .regex(/^\/[^/\\]/)
            .max(300)
            .default('/dashboard'),
        })
        .strict(),
      body,
    );
    const sent = await this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE convyn_marketplace');
      await tx.$queryRawUnsafe(
        "SELECT set_config('convyn.actor_id',$1,true)",
        req.actor.id,
      );
      await tx.$queryRawUnsafe(
        "SELECT set_config('convyn.email_enabled',$1,true)",
        String(
          !!(
            process.env.SMTP_HOST &&
            process.env.SMTP_FROM &&
            process.env.APP_ORIGIN
          ),
        ),
      );
      return (
        await tx.$queryRawUnsafe<{ sent: number }[]>(
          'SELECT marketplace.broadcast_message($1::jsonb) AS sent',
          JSON.stringify(input),
        )
      )[0].sent;
    });
    return { sent };
  }
}
