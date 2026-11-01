import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { Database } from './database';
import { Throttle } from '@nestjs/throttler';
export type Actor = { id: string; role: Role; sessionId: string };
export type AuthRequest = Request & { actor: Actor };
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const publicUser = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  return result.data;
}
const password = z.string().min(12).max(128);
const registration = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    mobile: z.string().regex(/^\+[1-9]\d{7,14}$/),
    password,
    consent: z.literal(true),
    role: z.enum(['CUSTOMER', 'PROVIDER']).default('CUSTOMER'),
  })
  .strict();
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9_-]{43})$/,
    )?.[1];
    if (!token) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.accessExpiresAt <= new Date() ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException();
    req.actor = {
      id: session.userId,
      role: session.user.role,
      sessionId: session.id,
    };
    return true;
  }
}
export function requireRole(actor: Actor, ...roles: Role[]) {
  if (!roles.includes(actor.role)) throw new ForbiddenException();
}
@Controller('v1/auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  constructor(@Inject(Database) private readonly db: Database) {}
  private cookie(res: Response, token: string) {
    res.cookie('convyn_refresh', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 86400000,
    });
    res.setHeader('Cache-Control', 'no-store');
  }
  private async session(userId: string, res: Response) {
    const accessToken = secret(),
      refreshToken = secret();
    await this.db.session.create({
      data: {
        userId,
        tokenHash: digest(accessToken),
        refreshHash: digest(refreshToken),
        accessExpiresAt: new Date(Date.now() + 30 * 60000),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    this.cookie(res, refreshToken);
    return {
      accessToken,
      expiresIn: 1800,
      user: await this.db.user.findUnique({
        where: { id: userId },
        select: publicUser,
      }),
    };
  }
  @Post('register') async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(registration, body);
    const passwordHash = await hash(input.password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    try {
      const user = await this.db.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          mobile: input.mobile,
          consentAt: new Date(),
          role: input.role,
          ...(input.role === 'PROVIDER' ? { provider: { create: {} } } : {}),
        },
      });
      return this.session(user.id, res);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new BadRequestException(
          'Registration unavailable for this email',
        );
      throw error;
    }
  }
  @Post('login') async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().max(128),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .strict(),
      body,
    );
    const user = await this.db.user.findUnique({
      where: { email: input.email },
    });
    if (!user || !(await verify(user.passwordHash, input.password)))
      throw new UnauthorizedException('Invalid credentials');
    if (
      user.role === 'ADMIN' &&
      (!user.mfaSecret ||
        !input.code ||
        !authenticator.check(input.code, user.mfaSecret))
    )
      throw new UnauthorizedException('Valid administrator MFA required');
    return this.session(user.id, res);
  }
  @Post('refresh') async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.headers['x-convyn-client'] !== '1') throw new ForbiddenException();
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)convyn_refresh=([A-Za-z0-9_-]{43})(?:;|$)/,
    )?.[1];
    if (!token) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { refreshHash: digest(token) },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      throw new UnauthorizedException();
    const accessToken = secret(),
      refreshToken = secret();
    const updated = await this.db.session.updateMany({
      where: {
        id: session.id,
        refreshHash: digest(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        tokenHash: digest(accessToken),
        refreshHash: digest(refreshToken),
        accessExpiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    if (updated.count !== 1) throw new UnauthorizedException();
    this.cookie(res, refreshToken);
    return {
      accessToken,
      expiresIn: 1800,
      user: await this.db.user.findUnique({
        where: { id: session.userId },
        select: publicUser,
      }),
    };
  }
  @UseGuards(SessionGuard) @Get('me') me(@Req() req: AuthRequest) {
    return this.db.user.findUnique({
      where: { id: req.actor.id },
      select: publicUser,
    });
  }
  @UseGuards(SessionGuard) @Post('logout') async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.session.update({
      where: { id: req.actor.sessionId },
      data: { revokedAt: new Date() },
    });
    res.clearCookie('convyn_refresh', { path: '/v1/auth' });
    return { revoked: true };
  }
  @UseGuards(SessionGuard) @Post('revoke-all') async revokeAll(
    @Req() req: AuthRequest,
  ) {
    await this.db.session.updateMany({
      where: { userId: req.actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }
}
