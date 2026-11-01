import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthRequest, parse, SessionGuard } from './auth';
import { ContractErrorFilter } from './contract';
import { Database } from './database';
@Controller('v1/marketplace/legacy')
@UseGuards(SessionGuard)
@UseFilters(ContractErrorFilter)
export class ContractLegacyController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get() async history(@Req() req: AuthRequest) {
    const admin = req.actor.role === 'ADMIN';
    const [requests, bookings] = await Promise.all([
      this.db.serviceRequest.findMany({
        where: admin ? {} : { customerId: req.actor.id },
        include: {
          category: true,
          booking: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.db.booking.findMany({
        where: admin
          ? {}
          : {
              OR: [
                { request: { customerId: req.actor.id } },
                { bid: { provider: { userId: req.actor.id } } },
              ],
            },
        include: {
          request: { include: { category: true } },
          bid: {
            include: {
              provider: {
                select: {
                  userId: true,
                  verification: true,
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
          events: true,
          review: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { requests, bookings };
  }
  @Get('requests/:id/quotes') async quotes(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    parse(z.uuid(), id);
    if (
      !(await this.db.serviceRequest.findFirst({
        where: {
          id,
          ...(req.actor.role === 'ADMIN' ? {} : { customerId: req.actor.id }),
        },
      }))
    )
      throw new NotFoundException('Request not found or access denied');
    return this.db.bid.findMany({
      where: {
        requestId: id,
        withdrawnAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        totalMinor: true,
        arrivalMinutes: true,
        comment: true,
        expiresAt: true,
        provider: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { totalMinor: 'asc' },
    });
  }
}
