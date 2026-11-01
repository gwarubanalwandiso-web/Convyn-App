import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BookingStatus, Prisma, Verification } from '@prisma/client';
import { z } from 'zod';
import { Database } from './database';
import { AuthRequest, parse, requireRole, SessionGuard } from './auth';
const uuid = z.uuid();
const id = (value: string) => parse(uuid, value);
const coordinates = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
const distance = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const rad = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * rad,
    dlng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};
const bidSelect = {
  id: true,
  totalMinor: true,
  currency: true,
  pricingVersion: true,
  arrivalMinutes: true,
  comment: true,
  expiresAt: true,
  provider: {
    select: {
      id: true,
      verification: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;
@Controller('v1')
@UseGuards(SessionGuard)
export class MarketplaceController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get('categories') categories() {
    return this.db.category.findMany({ orderBy: { name: 'asc' } });
  }
  @Get('notifications') notifications(@Req() req: AuthRequest) {
    return this.db.notification.findMany({
      where: { userId: req.actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Get('providers/me') async provider(@Req() req: AuthRequest) {
    requireRole(req.actor, 'PROVIDER');
    return this.db.providerProfile.findUniqueOrThrow({
      where: { userId: req.actor.id },
    });
  }
  @Post('providers/verification') async submit(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'PROVIDER');
    const input = parse(
      z
        .object({
          qualification: z.string().trim().min(20).max(2000),
          categories: z.array(uuid).min(1).max(20),
          radiusKm: z.number().int().min(1).max(200),
          ...coordinates,
        })
        .strict(),
      body,
    );
    if (
      (await this.db.category.count({
        where: { id: { in: input.categories } },
      })) !== new Set(input.categories).size
    )
      throw new BadRequestException('Unknown category');
    const changed = await this.db.providerProfile.updateMany({
      where: {
        userId: req.actor.id,
        verification: {
          in: ['DRAFT', 'MORE_INFORMATION_REQUIRED', 'REJECTED'],
        },
      },
      data: {
        ...input,
        categories: [...new Set(input.categories)],
        verification: 'SUBMITTED',
        available: false,
        submittedAt: new Date(),
      },
    });
    if (!changed.count)
      throw new ConflictException(
        'Verification cannot be submitted in current state',
      );
    return this.provider(req);
  }
  @Patch('providers/availability') async availability(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'PROVIDER');
    const input = parse(z.object({ available: z.boolean() }).strict(), body);
    const result = await this.db.providerProfile.updateMany({
      where: { userId: req.actor.id, verification: 'APPROVED' },
      data: input,
    });
    if (!result.count)
      throw new ForbiddenException('Approved verification required');
    return input;
  }
  @Get('admin/verifications') verifications(@Req() req: AuthRequest) {
    requireRole(req.actor, 'ADMIN');
    return this.db.providerProfile.findMany({
      where: { verification: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      select: {
        id: true,
        qualification: true,
        categories: true,
        verification: true,
        submittedAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      take: 100,
    });
  }
  @Post('admin/verifications/:providerId') async verifyProvider(
    @Req() req: AuthRequest,
    @Param('providerId') providerId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'ADMIN');
    id(providerId);
    const input = parse(
      z
        .object({
          status: z.enum([
            'UNDER_REVIEW',
            'MORE_INFORMATION_REQUIRED',
            'APPROVED',
            'REJECTED',
            'SUSPENDED',
          ]),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const allowed: Verification[] =
        input.status === 'SUSPENDED'
          ? ['APPROVED']
          : input.status === 'UNDER_REVIEW'
            ? ['SUBMITTED']
            : ['SUBMITTED', 'UNDER_REVIEW'];
      const updated = await tx.providerProfile.updateMany({
        where: { id: providerId, verification: { in: allowed } },
        data: { verification: input.status, available: false },
      });
      if (!updated.count)
        throw new ConflictException('Invalid verification transition');
      const provider = await tx.providerProfile.findUniqueOrThrow({
        where: { id: providerId },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: providerId,
          action: 'VERIFICATION_' + input.status,
        },
      });
      await tx.notification.create({
        data: {
          userId: provider.userId,
          event: 'VERIFICATION_' + input.status,
        },
      });
      return { id: providerId, verification: input.status };
    });
  }
  @Post('service-requests') async createRequest(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    const input = parse(
      z
        .object({
          categoryId: uuid,
          description: z.string().trim().min(20).max(5000),
          scheduledAt: z.iso
            .datetime()
            .transform((value) => new Date(value))
            .optional(),
          instructions: z.string().trim().max(2000).default(''),
          urgency: z
            .enum(['STANDARD', 'URGENT', 'EMERGENCY'])
            .default('STANDARD'),
          ...coordinates,
        })
        .strict(),
      body,
    );
    if (
      !(await this.db.category.findUnique({ where: { id: input.categoryId } }))
    )
      throw new BadRequestException('Unknown category');
    if (input.scheduledAt && input.scheduledAt <= new Date())
      throw new BadRequestException('Scheduled time must be in the future');
    return this.db.serviceRequest.create({
      data: { ...input, customerId: req.actor.id, publishedAt: new Date() },
    });
  }
  @Get('service-requests') requests(@Req() req: AuthRequest) {
    requireRole(req.actor, 'CUSTOMER');
    return this.db.serviceRequest.findMany({
      where: { customerId: req.actor.id },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Get('opportunities') async opportunities(@Req() req: AuthRequest) {
    await this.assertNotSuspended(req.actor.id);
    requireRole(req.actor, 'PROVIDER');
    const provider = await this.db.providerProfile.findUniqueOrThrow({
      where: { userId: req.actor.id },
    });
    if (provider.verification !== 'APPROVED' || !provider.available)
      throw new ForbiddenException('Approved and available provider required');
    if (provider.categories.length === 0) return [];
    return this.db.$queryRaw(Prisma.sql`
      SELECT r.id,r."categoryId",r.description,r.urgency,r."createdAt",r."scheduledAt",
        round(ST_Distance(ST_SetSRID(ST_MakePoint(r.longitude,r.latitude),4326)::geography,
          ST_SetSRID(ST_MakePoint(${provider.longitude},${provider.latitude}),4326)::geography)/1000)::int AS "distanceKm"
      FROM "ServiceRequest" r LEFT JOIN "Booking" b ON b."requestId"=r.id
      WHERE r."categoryId" IN (${Prisma.join(provider.categories)}) AND r."publishedAt" IS NOT NULL
        AND r."cancelledAt" IS NULL AND b.id IS NULL
        AND ST_DWithin(ST_SetSRID(ST_MakePoint(r.longitude,r.latitude),4326)::geography,
          ST_SetSRID(ST_MakePoint(${provider.longitude},${provider.latitude}),4326)::geography,${provider.radiusKm * 1000})
      ORDER BY r."createdAt" DESC LIMIT 100
    `);
  }
  @Post('service-requests/:requestId/bids') async bid(
    @Req() req: AuthRequest,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'PROVIDER');
    id(requestId);
    const input = parse(
      z
        .object({
          totalMinor: z.number().int().min(1).max(100000000),
          arrivalMinutes: z.number().int().min(1).max(10080),
          comment: z.string().trim().min(5).max(2000),
          expiresAt: z.iso.datetime().transform((v) => new Date(v)),
        })
        .strict(),
      body,
    );
    if (
      input.expiresAt <= new Date() ||
      input.expiresAt.getTime() > Date.now() + 7 * 86400000
    )
      throw new BadRequestException('Bid validity must be within seven days');
    return this.atomic(async (tx) => {
      await this.assertNotSuspended(req.actor.id, tx);
      const provider = await tx.providerProfile.findUniqueOrThrow({
        where: { userId: req.actor.id },
      });
      const request = await tx.serviceRequest.findUnique({
        where: { id: requestId },
        include: { booking: true },
      });
      if (
        !request ||
        !request.publishedAt ||
        request.booking ||
        request.cancelledAt
      )
        throw new NotFoundException('Open request not found');
      if (
        provider.verification !== 'APPROVED' ||
        !provider.available ||
        !provider.categories.includes(request.categoryId) ||
        distance(provider, request) > provider.radiusKm
      )
        throw new ForbiddenException('Provider not eligible');
      const bid = await tx.bid.create({
        data: {
          ...input,
          totalMinor: BigInt(input.totalMinor),
          requestId,
          providerId: provider.id,
          pricingVersion: 'provider-quote-v1',
        },
        select: bidSelect,
      });
      await tx.notification.create({
        data: { userId: request.customerId, event: 'NEW_BID:' + bid.id },
      });
      return bid;
    });
  }
  @Get('service-requests/:requestId/bids') async bids(
    @Req() req: AuthRequest,
    @Param('requestId') requestId: string,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    id(requestId);
    if (
      !(await this.db.serviceRequest.findFirst({
        where: { id: requestId, customerId: req.actor.id },
      }))
    )
      throw new NotFoundException();
    return this.db.bid.findMany({
      where: { requestId, withdrawnAt: null, expiresAt: { gt: new Date() } },
      select: bidSelect,
      orderBy: { totalMinor: 'asc' },
    });
  }
  @Post('bids/:bidId/accept') async accept(
    @Req() req: AuthRequest,
    @Param('bidId') bidId: string,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    id(bidId);
    return this.atomic(async (tx) => {
      const bid = await tx.bid.findUnique({
        where: { id: bidId },
        include: { provider: true, request: { include: { booking: true } } },
      });
      if (!bid || bid.request.customerId !== req.actor.id)
        throw new NotFoundException();
      if (bid.request.booking) {
        if (bid.request.booking.bidId === bidId) return bid.request.booking;
        throw new ConflictException('Request already booked');
      }
      if (
        bid.expiresAt <= new Date() ||
        bid.withdrawnAt ||
        bid.request.cancelledAt
      )
        throw new ConflictException('Bid expired or withdrawn');
      await this.assertNotSuspended(bid.provider.userId, tx);
      if (bid.provider.verification !== 'APPROVED' || !bid.provider.available)
        throw new ConflictException('Provider no longer eligible');
      const eligibility = await tx.providerProfile.updateMany({
        where: {
          id: bid.providerId,
          verification: 'APPROVED',
          available: true,
        },
        data: { available: true },
      });
      if (eligibility.count !== 1)
        throw new ConflictException('Provider no longer eligible');
      const active = await tx.booking.count({
        where: {
          bid: { providerId: bid.providerId },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      });
      if (active > 0)
        throw new ConflictException('Provider already has an active booking');
      if (bid.request.organisationId) {
        const approval = await tx.organisationApproval.findUnique({
          where: { requestId: bid.requestId },
        });
        if (
          !approval ||
          approval.status !== 'APPROVED' ||
          bid.totalMinor > approval.budgetMinor
        )
          throw new ConflictException(
            'Approved organisation budget required and bid must be within budget',
          );
      }
      const booking = await tx.booking.create({
        data: {
          requestId: bid.requestId,
          bidId,
          events: { create: { actorId: req.actor.id, status: 'CONFIRMED' } },
        },
      });
      await tx.notification.createMany({
        data: [req.actor.id, bid.provider.userId].map((userId) => ({
          userId,
          event: 'BOOKING_CONFIRMED:' + booking.id,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: booking.id,
          action: 'BID_ACCEPTED',
        },
      });
      return booking;
    });
  }
  @Get('bookings') bookings(@Req() req: AuthRequest) {
    requireRole(req.actor, 'CUSTOMER', 'PROVIDER');
    return this.db.booking.findMany({
      where:
        req.actor.role === 'CUSTOMER'
          ? { request: { customerId: req.actor.id } }
          : { bid: { provider: { userId: req.actor.id } } },
      include: {
        request: true,
        bid: { select: bidSelect },
        events: true,
        review: true,
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  }
  @Post('bookings/:bookingId/status') async status(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    id(bookingId);
    const input = parse(
      z
        .object({
          status: z.nativeEnum(BookingStatus),
          completionNote: z.string().trim().min(10).max(2000).optional(),
        })
        .strict(),
      body,
    );
    return this.atomic(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { request: true, bid: { include: { provider: true } } },
      });
      if (
        !booking ||
        ![booking.request.customerId, booking.bid.provider.userId].includes(
          req.actor.id,
        )
      )
        throw new NotFoundException();
      const next: Partial<Record<BookingStatus, BookingStatus>> = {
        CONFIRMED: 'EN_ROUTE',
        EN_ROUTE: 'ARRIVED',
        ARRIVED: 'IN_PROGRESS',
        IN_PROGRESS: 'AWAITING_CONFIRMATION',
      };
      const customer = req.actor.id === booking.request.customerId;
      const permitted = customer
        ? booking.status === 'AWAITING_CONFIRMATION' &&
          input.status === 'COMPLETED'
        : booking.bid.provider.verification === 'APPROVED' &&
          next[booking.status] === input.status;
      if (!permitted) throw new ConflictException('Invalid booking transition');
      if (input.status === 'AWAITING_CONFIRMATION' && !input.completionNote)
        throw new BadRequestException('Completion note required');
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: booking.status },
        data: {
          status: input.status,
          ...(input.status === 'AWAITING_CONFIRMATION'
            ? { completionNote: input.completionNote }
            : {}),
        },
      });
      if (!updated.count)
        throw new ConflictException('Booking changed concurrently');
      await tx.bookingEvent.create({
        data: { bookingId, actorId: req.actor.id, status: input.status },
      });
      await tx.notification.create({
        data: {
          userId: customer
            ? booking.bid.provider.userId
            : booking.request.customerId,
          event: input.status + ':' + bookingId,
        },
      });
      return { id: bookingId, status: input.status };
    });
  }
  @Post('bookings/:bookingId/reviews') async review(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    id(bookingId);
    const input = parse(
      z
        .object({
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().min(5).max(2000),
        })
        .strict(),
      body,
    );
    return this.atomic(async (tx) => {
      if (
        !(await tx.booking.findFirst({
          where: {
            id: bookingId,
            status: 'COMPLETED',
            request: { customerId: req.actor.id },
          },
        }))
      )
        throw new NotFoundException('Completed booking not found');
      return tx.review.create({
        data: { ...input, bookingId, authorId: req.actor.id },
      });
    });
  }
  @Get('admin/audit') audit(@Req() req: AuthRequest) {
    requireRole(req.actor, 'ADMIN');
    return this.db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  private async assertNotSuspended(
    userId: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const result = await tx.$queryRaw<
      { suspended: boolean }[]
    >`SELECT marketplace.provider_is_suspended(${userId}::uuid) AS suspended`;
    if (result[0].suspended)
      throw new ForbiddenException('Provider account is suspended');
  }
  private async atomic<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Concurrent or duplicate operation; reload and retry',
        );
      throw error;
    }
  }
}
