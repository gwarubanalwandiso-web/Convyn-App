import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  rank,
  defaultWeights,
  type Candidate,
  type Weights,
} from '@convyn/matching-engine/engine';
import { Database } from './database';
import { AuthRequest, parse, requireRole, SessionGuard } from './auth';
const feature = z.number().min(0).max(100);
const weightSchema = z
  .object({
    skills: feature,
    ratings: feature,
    jobs: feature,
    credentials: feature,
    reliability: feature,
    proximity: feature,
    response: feature,
    recommendations: feature,
  })
  .strict();
@Controller('v1')
@UseGuards(SessionGuard)
export class IntelligenceController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @Get('admin/scoring') async configuration(@Req() req: AuthRequest) {
    requireRole(req.actor, 'ADMIN');
    return (
      (await this.db.scoringRule.findFirst({ where: { active: true } })) ?? {
        version: 'weighted-v1',
        weights: defaultWeights,
      }
    );
  }
  @Post('admin/scoring') async configure(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    requireRole(req.actor, 'ADMIN');
    const input = parse(z.object({ weights: weightSchema }).strict(), body);
    if (
      Math.abs(
        Object.values(input.weights).reduce((sum, v) => sum + v, 0) - 100,
      ) > 1e-9
    )
      throw new BadRequestException('Weights must total 100');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2147483645)`;
      await tx.scoringRule.updateMany({
        where: { active: true },
        data: { active: false },
      });
      const rule = await tx.scoringRule.create({
        data: { version: 'weighted-' + randomUUID(), weights: input.weights },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: rule.id,
          action: 'SCORING_CONFIGURATION_UPDATED',
        },
      });
      return rule;
    });
  }
  @Get('service-requests/:requestId/recommendations') async recommendations(
    @Req() req: AuthRequest,
    @Param('requestId') requestId: string,
  ) {
    requireRole(req.actor, 'CUSTOMER');
    parse(z.uuid(), requestId);
    const request = await this.db.serviceRequest.findFirst({
      where: { id: requestId, customerId: req.actor.id },
    });
    if (!request) throw new NotFoundException();
    const rule = await this.db.scoringRule.findFirst({
      where: { active: true },
    });
    const weights = rule
      ? (parse(weightSchema, rule.weights) as Weights)
      : { ...defaultWeights };
    const version = rule?.version ?? 'weighted-v1';
    const providers = await this.db.providerProfile.findMany({
      where: {
        verification: 'APPROVED',
        available: true,
        categories: { has: request.categoryId },
        bids: {
          some: { requestId, withdrawnAt: null, expiresAt: { gt: new Date() } },
        },
      },
      take: 100,
      include: {
        user: { select: { firstName: true, lastName: true } },
        bids: {
          where: { booking: { isNot: null } },
          select: {
            booking: {
              select: { status: true, review: { select: { rating: true } } },
            },
          },
        },
      },
    });
    const candidates: Candidate[] = providers.map((provider) => {
      const reviews = provider.bids.flatMap((bid) =>
        bid.booking?.review ? [bid.booking.review.rating] : [],
      );
      const completed = provider.bids.filter(
        (bid) => bid.booking?.status === 'COMPLETED',
      ).length;
      const cancelled = provider.bids.filter(
        (bid) => bid.booking?.status === 'CANCELLED',
      ).length;
      const rad = Math.PI / 180,
        dlat = (provider.latitude - request.latitude) * rad,
        dlng = (provider.longitude - request.longitude) * rad;
      const h =
        Math.sin(dlat / 2) ** 2 +
        Math.cos(provider.latitude * rad) *
          Math.cos(request.latitude * rad) *
          Math.sin(dlng / 2) ** 2;
      const distanceKm = 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
      return {
        id: provider.id,
        verification: provider.verification,
        available: provider.available,
        suspended: false,
        categories: provider.categories,
        distanceKm,
        radiusKm: provider.radiusKm,
        capacity: provider.bids.some(
          (bid) =>
            bid.booking &&
            !['COMPLETED', 'CANCELLED'].includes(bid.booking.status),
        )
          ? 0
          : 1,
        features: {
          skills: 1,
          credentials: 1,
          proximity: Math.max(0, 1 - distanceKm / provider.radiusKm),
          ...(reviews.length
            ? {
                ratings:
                  (reviews.reduce((a, b) => a + b, 0) / reviews.length - 1) / 4,
              }
            : {}),
          ...(completed ? { jobs: Math.min(completed / 50, 1) } : {}),
          ...(completed + cancelled > 0
            ? { reliability: completed / (completed + cancelled) }
            : {}),
        },
      };
    });
    const ranked = rank(candidates, request.categoryId, weights);
    const explanation =
      'Advisory weighted ranking using category eligibility, platform approval, location and recorded completed/cancelled bookings and reviews. Missing history contributes zero; response and recommendation evidence is unavailable. Approval does not assert an externally verified professional licence. No provider is selected automatically.';
    await this.db.recommendation.createMany({
      data: ranked.map((result) => ({
        requestId,
        providerId: result.id,
        version,
        input: JSON.parse(
          JSON.stringify(
            candidates.find((candidate) => candidate.id === result.id),
          ),
        ) as Prisma.InputJsonObject,
        components: result.components,
        score: result.score,
        explanation,
      })),
    });
    return {
      version,
      weights,
      explanation,
      providers: ranked.map((result) => ({
        ...result,
        version,
        explanation,
        name: providers.find((provider) => provider.id === result.id)?.user,
      })),
    };
  }
}
