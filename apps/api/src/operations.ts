import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { AuthRequest, parse, requireRole, SessionGuard } from './auth';
const uuid = (v: string) => parse(z.uuid(), v);
const position = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
const requestInput = z
  .object({
    categoryId: z.uuid(),
    description: z.string().trim().max(5000),
    urgency: z.enum(['STANDARD', 'URGENT', 'EMERGENCY']).default('STANDARD'),
    ...position,
    scheduledAt: z.iso.datetime().nullable().optional(),
    instructions: z.string().trim().max(2000).default(''),
  })
  .strict();
const liveStatuses = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] as const;
async function bookingFor(db: Database, actorId: string, bookingId: string) {
  uuid(bookingId);
  const booking = await db.booking.findFirst({
    where: {
      id: bookingId,
      OR: [
        { request: { customerId: actorId } },
        { bid: { provider: { userId: actorId } } },
      ],
    },
    include: { request: true, bid: { include: { provider: true } } },
  });
  if (!booking) throw new NotFoundException();
  return booking;
}
@Controller('v1')
@UseGuards(SessionGuard)
export class OperationsController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Post('service-request-drafts') async draft(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    const input = parse(requestInput, body);
    await this.checkCategory(input.categoryId);
    return this.db.serviceRequest.create({
      data: {
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        customerId: req.actor.id,
        publishedAt: null,
      },
    });
  }
  @Patch('service-requests/:requestId') async edit(
    @Req() req: AuthRequest,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    uuid(requestId);
    const input = parse(requestInput, body);
    await this.checkCategory(input.categoryId);
    const result = await this.db.serviceRequest.updateMany({
      where: {
        id: requestId,
        customerId: req.actor.id,
        publishedAt: null,
        cancelledAt: null,
        organisationId: null,
      },
      data: {
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });
    if (!result.count)
      throw new ConflictException(
        'Only your unpublished individual draft can be edited',
      );
    return { id: requestId, saved: true };
  }
  @Post('service-requests/:requestId/publish') async publish(
    @Req() req: AuthRequest,
    @Param('requestId') requestId: string,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    uuid(requestId);
    return this.db.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findFirst({
        where: {
          id: requestId,
          customerId: req.actor.id,
          organisationId: null,
          cancelledAt: null,
          publishedAt: null,
        },
      });
      if (!request) throw new NotFoundException('Unpublished draft not found');
      if (
        request.description.length < 20 ||
        (request.scheduledAt && request.scheduledAt <= new Date())
      )
        throw new BadRequestException(
          'Complete description and a future scheduled time are required',
        );
      const result = await tx.serviceRequest.updateMany({
        where: { id: requestId, publishedAt: null, cancelledAt: null },
        data: { publishedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException();
      return { id: requestId, published: true };
    });
  }
  @Post('bookings/:bookingId/cancel') async cancel(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({ reason: z.string().trim().min(10).max(2000) }).strict(),
      body,
    );
    const booking = await bookingFor(this.db, req.actor.id, bookingId);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: { in: ['CONFIRMED', 'EN_ROUTE', 'ARRIVED'] },
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: input.reason,
          trackingConsentUntil: null,
        },
      });
      if (!changed.count)
        throw new ConflictException(
          'Cancellation is unavailable after work starts; open a dispute',
        );
      await tx.serviceRequest.update({
        where: { id: booking.requestId },
        data: { cancelledAt: new Date() },
      });
      await tx.bookingEvent.create({
        data: { bookingId, actorId: req.actor.id, status: 'CANCELLED' },
      });
      await tx.locationEvent.deleteMany({ where: { bookingId } });
      await tx.notification.createMany({
        data: [booking.request.customerId, booking.bid.provider.userId].map(
          (userId) => ({ userId, event: 'BOOKING_CANCELLED:' + bookingId }),
        ),
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: bookingId,
          action: 'BOOKING_CANCELLED',
        },
      });
      return {
        id: bookingId,
        status: 'CANCELLED',
        paymentAction: 'NONE_NO_ONLINE_PAYMENT_PROCESSED',
      };
    });
  }
  @Patch('bids/:bidId') async editBid(
    @Req() req: AuthRequest,
    @Param('bidId') bidId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'PROVIDER');
    uuid(bidId);
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
      throw new BadRequestException('Invalid validity');
    const result = await this.db.bid.updateMany({
      where: {
        id: bidId,
        provider: { userId: req.actor.id, verification: 'APPROVED' },
        withdrawnAt: null,
        request: { booking: null, cancelledAt: null },
      },
      data: { ...input, totalMinor: BigInt(input.totalMinor) },
    });
    if (!result.count) throw new ConflictException('Bid cannot be edited');
    return { id: bidId, updated: true };
  }
  @Post('bids/:bidId/withdraw') async withdraw(
    @Req() req: AuthRequest,
    @Param('bidId') bidId: string,
  ) {
    requireRole(req.actor, 'PROVIDER');
    uuid(bidId);
    const result = await this.db.bid.updateMany({
      where: {
        id: bidId,
        provider: { userId: req.actor.id },
        request: { booking: null },
      },
      data: { withdrawnAt: new Date() },
    });
    if (!result.count) throw new ConflictException('Bid cannot be withdrawn');
    return { withdrawn: true };
  }
  @Get('bookings/:bookingId/messages') async messages(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
  ) {
    await bookingFor(this.db, req.actor.id, bookingId);
    return (
      await this.db.message.findMany({
        where: { bookingId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          senderId: true,
          text: true,
          createdAt: true,
          readAt: true,
        },
      })
    ).reverse();
  }
  @Post('bookings/:bookingId/messages') async message(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    const booking = await bookingFor(this.db, req.actor.id, bookingId);
    if (booking.status === 'CANCELLED')
      throw new ConflictException('Cancelled conversation is read-only');
    const input = parse(
      z
        .object({
          text: z.string().trim().min(1).max(4000),
          clientId: z.uuid(),
        })
        .strict(),
      body,
    );
    const existing = await this.db.message.findUnique({
      where: {
        senderId_clientId: { senderId: req.actor.id, clientId: input.clientId },
      },
    });
    if (existing) {
      if (existing.bookingId !== bookingId || existing.text !== input.text)
        throw new ConflictException('Message key already used');
      return existing;
    }
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${bookingId}::uuid FOR UPDATE`;
        const current = await tx.booking.findUniqueOrThrow({
          where: { id: bookingId },
        });
        if (current.status === 'CANCELLED')
          throw new ConflictException('Cancelled conversation is read-only');
        const record = await tx.message.create({
          data: { ...input, bookingId, senderId: req.actor.id },
        });
        await tx.notification.create({
          data: {
            userId:
              booking.request.customerId === req.actor.id
                ? booking.bid.provider.userId
                : booking.request.customerId,
            event: 'NEW_MESSAGE:' + bookingId,
          },
        });
        return record;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Message was already submitted; reload');
      throw error;
    }
  }
  @Post('bookings/:bookingId/messages/read') async read(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
  ) {
    await bookingFor(this.db, req.actor.id, bookingId);
    return this.db.message.updateMany({
      where: { bookingId, senderId: { not: req.actor.id }, readAt: null },
      data: { readAt: new Date() },
    });
  }
  @Post('bookings/:bookingId/dispute') async dispute(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    await bookingFor(this.db, req.actor.id, bookingId);
    const input = parse(
      z.object({ reason: z.string().trim().min(20).max(5000) }).strict(),
      body,
    );
    try {
      return await this.db.dispute.create({
        data: { bookingId, openedBy: req.actor.id, reason: input.reason },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A dispute already exists for this booking',
        );
      throw error;
    }
  }
  @Get('bookings/:bookingId/dispute') async getDispute(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
  ) {
    await bookingFor(this.db, req.actor.id, bookingId);
    return this.db.dispute.findUnique({ where: { bookingId } });
  }
  @Post('support') ticket(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          subject: z.string().trim().min(5).max(200),
          description: z.string().trim().min(20).max(5000),
        })
        .strict(),
      body,
    );
    return this.db.supportTicket.create({
      data: { ...input, userId: req.actor.id },
    });
  }
  @Get('support') tickets(@Req() req: AuthRequest) {
    return this.db.supportTicket.findMany({
      where: { userId: req.actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Get('admin/support') adminTickets(@Req() req: AuthRequest) {
    requireRole(req.actor, 'ADMIN');
    return this.db.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post('admin/support/:ticketId') async resolveTicket(
    @Req() req: AuthRequest,
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'ADMIN');
    uuid(ticketId);
    const input = parse(
      z
        .object({
          status: z.enum(['IN_PROGRESS', 'RESOLVED', 'CLOSED']),
          response: z.string().trim().min(10).max(5000),
        })
        .strict(),
      body,
    );
    const ticket = await this.db.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      const changed = await tx.supportTicket.updateMany({
        where: { id: ticketId, status: { not: 'CLOSED' } },
        data: input,
      });
      if (!changed.count) throw new ConflictException('Ticket closed');
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: ticketId,
          action: 'SUPPORT_' + input.status,
        },
      });
      await tx.notification.create({
        data: { userId: ticket.userId, event: 'SUPPORT_UPDATED:' + ticketId },
      });
      return { updated: true };
    });
  }
  @Get('admin/disputes') adminDisputes(@Req() req: AuthRequest) {
    requireRole(req.actor, 'ADMIN');
    return this.db.dispute.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post('admin/disputes/:disputeId') async resolveDispute(
    @Req() req: AuthRequest,
    @Param('disputeId') disputeId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'ADMIN');
    uuid(disputeId);
    const input = parse(
      z.object({ resolution: z.string().trim().min(20).max(5000) }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({
        where: { id: disputeId },
        include: {
          booking: {
            include: { request: true, bid: { include: { provider: true } } },
          },
        },
      });
      if (!dispute) throw new NotFoundException();
      const result = await tx.dispute.updateMany({
        where: { id: disputeId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        data: {
          resolution: input.resolution,
          status: 'RESOLVED',
          resolvedAt: new Date(),
        },
      });
      if (!result.count)
        throw new ConflictException('Dispute already resolved');
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: disputeId,
          action: 'DISPUTE_RESOLVED',
        },
      });
      await tx.notification.createMany({
        data: [
          dispute.booking.request.customerId,
          dispute.booking.bid.provider.userId,
        ].map((userId) => ({ userId, event: 'DISPUTE_RESOLVED:' + disputeId })),
      });
      return { resolved: true, financialAction: 'NONE' };
    });
  }
  @Post('notifications/:notificationId/read') async readNotification(
    @Req() req: AuthRequest,
    @Param('notificationId') notificationId: string,
  ) {
    uuid(notificationId);
    const result = await this.db.notification.updateMany({
      where: { id: notificationId, userId: req.actor.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException();
    return { read: true };
  }
  @Post('bookings/:bookingId/tracking-consent') async consent(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'PROVIDER');
    const booking = await bookingFor(this.db, req.actor.id, bookingId);
    const input = parse(
      z
        .object({
          enabled: z.boolean(),
          durationMinutes: z.number().int().min(1).max(120).default(15),
        })
        .strict(),
      body,
    );
    if (!liveStatuses.some((s) => s === booking.status))
      throw new ConflictException(
        'Tracking only during an active journey or job',
      );
    return this.db.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: bookingId, status: { in: [...liveStatuses] } },
        data: {
          trackingConsentUntil: input.enabled
            ? new Date(Date.now() + input.durationMinutes * 60000)
            : null,
        },
      });
      if (!result.count) throw new ConflictException('Booking state changed');
      if (!input.enabled)
        await tx.locationEvent.deleteMany({ where: { bookingId } });
      return { enabled: input.enabled };
    });
  }
  @Post('bookings/:bookingId/location') async location(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'PROVIDER');
    const booking = await bookingFor(this.db, req.actor.id, bookingId);
    const input = parse(
      z
        .object({
          ...position,
          accuracyMetres: z.number().min(0).max(50000),
          observedAt: z.iso.datetime().transform((v) => new Date(v)),
        })
        .strict(),
      body,
    );
    const now = Date.now();
    if (
      input.observedAt.getTime() > now + 15000 ||
      input.observedAt.getTime() < now - 60000
    )
      throw new BadRequestException(
        'Location observation is stale or in the future',
      );
    if (
      !booking.trackingConsentUntil ||
      booking.trackingConsentUntil.getTime() <= now ||
      !liveStatuses.some((s) => s === booking.status)
    )
      throw new ConflictException('Active tracking consent required');
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${bookingId}::uuid FOR UPDATE`;
      const current = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      const timestamp = Date.now();
      if (
        !current.trackingConsentUntil ||
        current.trackingConsentUntil.getTime() <= timestamp ||
        !liveStatuses.some((status) => status === current.status)
      )
        throw new ConflictException('Active tracking consent required');
      await tx.locationEvent.create({
        data: {
          ...input,
          bookingId,
          expiresAt: new Date(
            Math.min(
              current.trackingConsentUntil.getTime(),
              timestamp + 120000,
            ),
          ),
        },
      });
    });
    return { shared: true };
  }
  @Get('bookings/:bookingId/location') async getLocation(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
  ) {
    const booking = await bookingFor(this.db, req.actor.id, bookingId);
    if (
      !booking.trackingConsentUntil ||
      booking.trackingConsentUntil <= new Date() ||
      !liveStatuses.some((s) => s === booking.status)
    )
      return { location: null };
    return {
      location: await this.db.locationEvent.findFirst({
        where: { bookingId, expiresAt: { gt: new Date() } },
        orderBy: { observedAt: 'desc' },
        select: {
          latitude: true,
          longitude: true,
          accuracyMetres: true,
          observedAt: true,
          expiresAt: true,
        },
      }),
    };
  }
  @Post('bookings/:bookingId/invoice') async issueInvoice(
    @Req() req: AuthRequest,
    @Param('bookingId') bookingId: string,
  ) {
    const booking = await bookingFor(this.db, req.actor.id, bookingId);
    if (booking.status !== 'COMPLETED')
      throw new ConflictException('Only completed bookings can be invoiced');
    return this.db.invoice.upsert({
      where: { bookingId },
      create: {
        bookingId,
        number: 'CONVYN-' + randomUUID().toUpperCase(),
        totalMinor: booking.bid.totalMinor,
        currency: booking.bid.currency,
      },
      update: {},
    });
  }
  @Get('invoices/:invoiceId/pdf') async invoicePdf(
    @Req() req: AuthRequest,
    @Param('invoiceId') invoiceId: string,
    @Res() res: Response,
  ) {
    uuid(invoiceId);
    const invoice = await this.db.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException();
    const booking = await bookingFor(this.db, req.actor.id, invoice.bookingId);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.number}.pdf"`,
    );
    doc.pipe(res);
    doc.fontSize(24).text('CONVYN — Service invoice');
    doc
      .fontSize(12)
      .text(invoice.number)
      .text('Issued: ' + invoice.issuedAt.toISOString())
      .text('Status: UNPAID — no online settlement recorded')
      .moveDown()
      .text(booking.request.description)
      .moveDown()
      .text(
        'Total: ' +
          new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: invoice.currency,
          }).format(Number(invoice.totalMinor) / 100),
      )
      .text(
        'VAT registration and tax invoice configuration are not integrated. This is not a payment receipt.',
      );
    doc.end();
  }
  @Get('providers/earnings') async earnings(@Req() req: AuthRequest) {
    requireRole(req.actor, 'PROVIDER');
    const bookings = await this.db.booking.findMany({
      where: {
        bid: { provider: { userId: req.actor.id } },
        status: 'COMPLETED',
      },
      select: { bid: { select: { totalMinor: true, currency: true } } },
    });
    return {
      currency: 'ZAR',
      completedQuotedMinor: bookings
        .reduce((sum, b) => sum + b.bid.totalMinor, 0n)
        .toString(),
      completedJobs: bookings.length,
      settlementStatus: 'NOT_INTEGRATED',
      paidMinor: null,
    };
  }
  @Get('admin/dashboard') async dashboard(@Req() req: AuthRequest) {
    requireRole(req.actor, 'ADMIN');
    const [users, providers, requests, bookings, disputes, support] =
      await Promise.all([
        this.db.user.count(),
        this.db.providerProfile.count(),
        this.db.serviceRequest.count(),
        this.db.booking.groupBy({ by: ['status'], _count: true }),
        this.db.dispute.count({
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        }),
        this.db.supportTicket.count({
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        }),
      ]);
    return {
      users,
      providers,
      requests,
      bookings,
      openDisputes: disputes,
      openSupportTickets: support,
      payments: 'NOT_INTEGRATED',
    };
  }
  private async checkCategory(categoryId: string) {
    if (!(await this.db.category.findUnique({ where: { id: categoryId } })))
      throw new BadRequestException('Unknown category');
  }
}
