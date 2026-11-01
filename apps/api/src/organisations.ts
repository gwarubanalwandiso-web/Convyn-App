import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrganisationRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from './database';
import { Actor, AuthRequest, parse, requireRole, SessionGuard } from './auth';
const uuid = (value: string) => parse(z.uuid(), value);
@Controller('v1/organisations')
@UseGuards(SessionGuard)
export class OrganisationsController {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async member(
    actor: Actor,
    organisationId: string,
    roles?: OrganisationRole[],
  ) {
    uuid(organisationId);
    const membership = await this.db.organisationMember.findFirst({
      where: {
        organisationId,
        userId: actor.id,
        ...(roles ? { role: { in: roles } } : {}),
      },
      include: { organisation: true },
    });
    if (!membership)
      throw new NotFoundException(
        'Organisation not found or permission unavailable',
      );
    return membership;
  }
  @Get() list(@Req() req: AuthRequest) {
    return this.db.organisationMember.findMany({
      where: { userId: req.actor.id },
      select: { role: true, organisation: true },
      take: 100,
    });
  }
  @Post() async create(@Req() req: AuthRequest, @Body() body: unknown) {
    requireRole(req.actor, 'CUSTOMER');
    const input = parse(
      z
        .object({
          name: z.string().trim().min(2).max(200),
          kind: z.enum(['BUSINESS', 'ENTERPRISE']).default('BUSINESS'),
          spendingLimitMinor: z
            .number()
            .int()
            .min(1)
            .max(100000000)
            .default(10000000),
        })
        .strict(),
      body,
    );
    return this.db.organisation.create({
      data: {
        ...input,
        spendingLimitMinor: BigInt(input.spendingLimitMinor),
        members: { create: { userId: req.actor.id, role: 'OWNER' } },
      },
    });
  }
  @Get(':organisationId') async detail(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
  ) {
    await this.member(req.actor, organisationId);
    return this.db.organisation.findUnique({
      where: { id: organisationId },
      include: {
        members: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        locations: true,
        costCentres: true,
        departments: true,
        contracts: true,
      },
    });
  }
  @Post(':organisationId/members') async addMember(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    const membership = await this.member(req.actor, organisationId, [
      'OWNER',
      'ADMIN',
    ]);
    const input = parse(
      z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          role: z.enum(['ADMIN', 'APPROVER', 'MEMBER']).default('MEMBER'),
        })
        .strict(),
      body,
    );
    if (membership.role !== 'OWNER' && input.role !== 'MEMBER')
      throw new BadRequestException(
        'Only the owner can grant elevated organisation roles',
      );
    const user = await this.db.user.findUnique({
      where: { email: input.email },
    });
    if (!user || user.role !== 'CUSTOMER')
      throw new BadRequestException(
        'A registered customer account is required',
      );
    try {
      return await this.db.$transaction(async (tx) => {
        const added = await tx.organisationMember.create({
          data: { organisationId, userId: user.id, role: input.role },
        });
        await tx.auditLog.create({
          data: {
            actorId: req.actor.id,
            subjectId: organisationId,
            action: 'ORGANISATION_MEMBER_ADDED',
          },
        });
        return added;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Already a member');
      throw error;
    }
  }
  @Post(':organisationId/departments') async department(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    await this.member(req.actor, organisationId, ['OWNER', 'ADMIN']);
    const input = parse(
      z.object({ name: z.string().trim().min(2).max(100) }).strict(),
      body,
    );
    return this.db.department.create({ data: { organisationId, ...input } });
  }
  @Post(':organisationId/cost-centres') async costCentre(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    await this.member(req.actor, organisationId, ['OWNER', 'ADMIN']);
    const input = parse(
      z
        .object({
          code: z.string().trim().min(2).max(30),
          name: z.string().trim().min(2).max(100),
        })
        .strict(),
      body,
    );
    return this.db.costCentre.create({ data: { organisationId, ...input } });
  }
  @Post(':organisationId/locations') async location(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    await this.member(req.actor, organisationId, ['OWNER', 'ADMIN']);
    const input = parse(
      z
        .object({
          name: z.string().trim().min(2).max(100),
          address: z.string().trim().min(10).max(500),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        })
        .strict(),
      body,
    );
    return this.db.organisationLocation.create({
      data: { organisationId, ...input },
    });
  }
  @Get(':organisationId/requests') async requests(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
  ) {
    await this.member(req.actor, organisationId);
    return this.db.serviceRequest.findMany({
      where: { organisationId },
      include: { approval: true, booking: { include: { invoice: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post(':organisationId/requests') async createRequest(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    const membership = await this.member(req.actor, organisationId);
    const input = parse(
      z
        .object({
          categoryId: z.uuid(),
          locationId: z.uuid(),
          costCentreId: z.uuid(),
          description: z.string().trim().min(20).max(5000),
          budgetMinor: z.number().int().min(1).max(100000000),
          purchaseOrder: z.string().trim().min(3).max(80),
          urgency: z
            .enum(['STANDARD', 'URGENT', 'EMERGENCY'])
            .default('STANDARD'),
        })
        .strict(),
      body,
    );
    if (BigInt(input.budgetMinor) > membership.organisation.spendingLimitMinor)
      throw new BadRequestException(
        'Request exceeds organisation spending limit',
      );
    return this.db.$transaction(async (tx) => {
      const [location, costCentre, category] = await Promise.all([
        tx.organisationLocation.findFirst({
          where: { id: input.locationId, organisationId },
        }),
        tx.costCentre.findFirst({
          where: { id: input.costCentreId, organisationId },
        }),
        tx.category.findUnique({ where: { id: input.categoryId } }),
      ]);
      if (!location || !costCentre || !category)
        throw new BadRequestException(
          'Location, cost centre and category must be valid for this organisation',
        );
      return tx.serviceRequest.create({
        data: {
          customerId: req.actor.id,
          organisationId,
          categoryId: input.categoryId,
          description: input.description,
          urgency: input.urgency,
          latitude: location.latitude,
          longitude: location.longitude,
          publishedAt: null,
          approval: {
            create: {
              costCentreId: costCentre.id,
              budgetMinor: BigInt(input.budgetMinor),
              purchaseOrder: input.purchaseOrder,
            },
          },
        },
        include: { approval: true },
      });
    });
  }
  @Post(':organisationId/approvals/:approvalId') async decide(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: unknown,
  ) {
    await this.member(req.actor, organisationId, [
      'OWNER',
      'ADMIN',
      'APPROVER',
    ]);
    uuid(approvalId);
    const input = parse(
      z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const approval = await tx.organisationApproval.findFirst({
        where: { id: approvalId, request: { organisationId } },
      });
      if (!approval) throw new NotFoundException();
      const changed = await tx.organisationApproval.updateMany({
        where: { id: approvalId, status: 'PENDING' },
        data: {
          status: input.decision,
          decidedBy: req.actor.id,
          decidedAt: new Date(),
        },
      });
      if (!changed.count)
        throw new ConflictException('Approval already decided');
      await tx.serviceRequest.update({
        where: { id: approval.requestId },
        data:
          input.decision === 'APPROVED'
            ? { publishedAt: new Date() }
            : { cancelledAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          subjectId: approval.requestId,
          action: 'PROCUREMENT_' + input.decision,
        },
      });
      return { id: approvalId, status: input.decision };
    });
  }
  @Post(':organisationId/contracts') async contract(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    await this.member(req.actor, organisationId, ['OWNER', 'ADMIN']);
    const input = parse(
      z
        .object({
          name: z.string().trim().min(3).max(200),
          terms: z.string().trim().min(20).max(10000),
          startsAt: z.iso.datetime().transform((v) => new Date(v)),
          endsAt: z.iso.datetime().transform((v) => new Date(v)),
          responseMinutes: z.number().int().min(5).max(10080),
          escalationEmail: z.email(),
        })
        .strict(),
      body,
    );
    if (input.endsAt <= input.startsAt)
      throw new BadRequestException('Contract end must follow start');
    return this.db.serviceContract.create({
      data: { organisationId, ...input },
    });
  }
  @Get(':organisationId/report') async report(
    @Req() req: AuthRequest,
    @Param('organisationId') organisationId: string,
  ) {
    await this.member(req.actor, organisationId, [
      'OWNER',
      'ADMIN',
      'APPROVER',
    ]);
    const [requests, approved, invoices] = await Promise.all([
      this.db.serviceRequest.count({ where: { organisationId } }),
      this.db.organisationApproval.aggregate({
        where: { status: 'APPROVED', request: { organisationId } },
        _sum: { budgetMinor: true },
      }),
      this.db.invoice.findMany({
        where: { booking: { request: { organisationId } } },
        select: { id: true, number: true, totalMinor: true, status: true },
      }),
    ]);
    return {
      organisationId,
      requestCount: requests,
      approvedBudgetMinor: approved._sum.budgetMinor ?? 0n,
      invoicedMinor: invoices.reduce((sum, row) => sum + row.totalMinor, 0n),
      currency: 'ZAR',
      invoices,
      settlement: 'NOT_INTEGRATED',
    };
  }
}
