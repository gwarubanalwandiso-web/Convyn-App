import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
const databaseUrl = new URL(process.env.DATABASE_URL);
if (!databaseUrl.pathname.endsWith('_test'))
  throw new Error(
    'Integration tests require an isolated database ending in _test',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.toString() }),
});
const port = 4019,
  base = `http://127.0.0.1:${port}/v1`;
const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
let checks = 0;
const password = 'Synthetic-test-only-Password!' + randomUUID();
const runId = randomUUID();
async function request(
  path,
  { token, body, method, cookie, client } = {},
  expected = 200,
) {
  const response = await fetch(base + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(client ? { 'X-Convyn-Client': '1' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(response.status),
    `${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(value)}`,
  );
  checks++;
  return {
    value,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    status: response.status,
  };
}
async function register(role) {
  return (
    await request(
      '/auth/register',
      {
        body: {
          email: `${role.toLowerCase()}-${randomUUID()}@example.invalid`,
          password,
          firstName: 'Synthetic',
          lastName: 'Tester',
          mobile: '+27821234567',
          consent: true,
          role,
        },
      },
      201,
    )
  ).value;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + '/health');
      if (response.ok) break;
    } catch {}
    if (child.exitCode !== null) throw new Error('API exited: ' + output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await request('/ready');
  await request('/categories', {}, 401);
  const customer = await register('CUSTOMER'),
    other = await register('CUSTOMER'),
    provider = await register('PROVIDER');
  const c = customer.accessToken,
    p = provider.accessToken,
    o = other.accessToken;
  await request(
    '/auth/register',
    {
      body: {
        email: 'admin@example.invalid',
        password,
        firstName: 'No',
        lastName: 'Escalation',
        mobile: '+27821234567',
        consent: true,
        role: 'ADMIN',
      },
    },
    400,
  );
  await request(
    '/auth/login',
    { body: { email: customer.user.email, password: 'incorrect-password' } },
    401,
  );
  const mfaSecret = authenticator.generateSecret();
  const admin = await db.user.create({
    data: {
      email: `admin-${runId}@example.invalid`,
      passwordHash: await hash(password),
      firstName: 'Synthetic',
      lastName: 'Admin',
      mobile: '+27821234567',
      consentAt: new Date(),
      role: 'ADMIN',
      mfaSecret,
    },
  });
  await request('/auth/login', { body: { email: admin.email, password } }, 401);
  const a = (
    await request(
      '/auth/login',
      {
        body: {
          email: admin.email,
          password,
          code: authenticator.generate(mfaSecret),
        },
      },
      201,
    )
  ).value.accessToken;
  const category = await db.category.upsert({
    where: { name: 'Plumbing' },
    create: { name: 'Plumbing' },
    update: {},
  });
  await request(
    '/providers/availability',
    { token: p, method: 'PATCH', body: { available: true } },
    403,
  );
  await request('/opportunities', { token: p }, 403);
  await request(
    '/providers/verification',
    {
      token: p,
      body: {
        qualification: 'Synthetic qualification awaiting independent review',
        categories: [category.id],
        radiusKm: 30,
        latitude: -33.96,
        longitude: 25.6,
      },
    },
    201,
  );
  const profile = await db.providerProfile.findUniqueOrThrow({
    where: { userId: provider.user.id },
  });
  await request(
    '/admin/verifications/' + profile.id,
    { token: c, body: { status: 'APPROVED' } },
    403,
  );
  await request(
    '/admin/verifications/' + profile.id,
    { token: a, body: { status: 'APPROVED' } },
    201,
  );
  await request('/providers/availability', {
    token: p,
    method: 'PATCH',
    body: { available: true },
  });
  await request(
    '/service-requests',
    {
      token: c,
      body: {
        categoryId: category.id,
        description: 'short',
        latitude: -33.96,
        longitude: 25.6,
      },
    },
    400,
  );
  async function create() {
    return (
      await request(
        '/service-requests',
        {
          token: c,
          body: {
            categoryId: category.id,
            description: 'Synthetic leaking pipe service request ' + runId,
            latitude: -33.96,
            longitude: 25.6,
          },
        },
        201,
      )
    ).value;
  }
  const service = await create();
  const opportunities = (await request('/opportunities', { token: p })).value;
  assert.ok(opportunities.some((item) => item.id === service.id));
  assert.ok(
    opportunities.every(
      (item) => !('latitude' in item) && !('customerId' in item),
    ),
  );
  await request('/service-requests/' + service.id + '/bids', { token: o }, 404);
  const quote = {
    totalMinor: 12345,
    arrivalMinutes: 20,
    comment: 'Callout and labour included. Materials separate.',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const bid = (
    await request(
      '/service-requests/' + service.id + '/bids',
      { token: p, body: quote },
      201,
    )
  ).value;
  const bids = (
    await request('/service-requests/' + service.id + '/bids', { token: c })
  ).value;
  assert.equal(bids[0].totalMinor, '12345');
  assert.ok(!JSON.stringify(bids).includes('passwordHash'));
  await request(
    '/service-requests/' + service.id + '/recommendations',
    { token: o },
    404,
  );
  await request('/admin/scoring', { token: c }, 403);
  await request(
    '/admin/scoring',
    {
      token: a,
      body: {
        weights: {
          skills: 0,
          ratings: 0,
          jobs: 0,
          credentials: 0,
          reliability: 0,
          proximity: 0,
          response: 0,
          recommendations: 0,
        },
      },
    },
    400,
  );
  const scoring = (
    await request(
      '/admin/scoring',
      {
        token: a,
        body: {
          weights: {
            skills: 20,
            ratings: 15,
            jobs: 15,
            credentials: 15,
            reliability: 15,
            proximity: 10,
            response: 5,
            recommendations: 5,
          },
        },
      },
      201,
    )
  ).value;
  const advisory = (
    await request('/service-requests/' + service.id + '/recommendations', {
      token: c,
    })
  ).value;
  assert.equal(advisory.version, scoring.version);
  assert.equal(advisory.providers[0].id, profile.id);
  assert.equal(advisory.providers[0].components.ratings.value, null);
  assert.ok(
    advisory.providers[0].score >= 0 && advisory.providers[0].score <= 100,
  );
  assert.equal(
    await db.recommendation.count({
      where: { requestId: service.id, version: scoring.version },
    }),
    1,
  );
  await request('/bids/' + bid.id + '/accept', { token: o, body: {} }, 404);
  const attempts = await Promise.all([
    request('/bids/' + bid.id + '/accept', { token: c, body: {} }, [201, 409]),
    request('/bids/' + bid.id + '/accept', { token: c, body: {} }, [201, 409]),
  ]);
  const booking = attempts.find((item) => item.status === 201)?.value;
  assert.ok(booking);
  assert.equal(await db.booking.count({ where: { requestId: service.id } }), 1);
  assert.equal(
    (await request('/bids/' + bid.id + '/accept', { token: c, body: {} }, 201))
      .value.id,
    booking.id,
  );
  assert.equal(
    await db.notification.count({
      where: { event: 'BOOKING_CONFIRMED:' + booking.id },
    }),
    2,
  );
  const otherBookings = (await request('/bookings', { token: o })).value;
  assert.equal(otherBookings.length, 0);
  await request(
    '/bookings/' + booking.id + '/status',
    { token: o, body: { status: 'COMPLETED' } },
    404,
  );
  await request(
    '/bookings/' + booking.id + '/status',
    { token: p, body: { status: 'COMPLETED' } },
    409,
  );
  for (const status of ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'])
    await request(
      '/bookings/' + booking.id + '/status',
      { token: p, body: { status } },
      201,
    );
  await request(
    '/bookings/' + booking.id + '/status',
    { token: p, body: { status: 'AWAITING_CONFIRMATION' } },
    400,
  );
  await request(
    '/bookings/' + booking.id + '/status',
    {
      token: p,
      body: {
        status: 'AWAITING_CONFIRMATION',
        completionNote:
          'Synthetic job completed; customer should inspect the work.',
      },
    },
    201,
  );
  await request(
    '/bookings/' + booking.id + '/status',
    { token: p, body: { status: 'COMPLETED' } },
    409,
  );
  await request(
    '/bookings/' + booking.id + '/status',
    { token: c, body: { status: 'COMPLETED' } },
    201,
  );
  await request(
    '/bookings/' + booking.id + '/reviews',
    { token: c, body: { rating: 6, comment: 'Invalid rating' } },
    400,
  );
  await request(
    '/bookings/' + booking.id + '/reviews',
    {
      token: c,
      body: { rating: 5, comment: 'Synthetic review of completed work.' },
    },
    201,
  );
  await request(
    '/bookings/' + booking.id + '/reviews',
    { token: c, body: { rating: 5, comment: 'Duplicate review denied.' } },
    409,
  );
  assert.equal(
    (
      await db.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: { events: true, review: true },
      })
    ).events.length,
    6,
  );
  await request('/admin/audit', { token: c }, 403);
  assert.ok(
    (await request('/admin/audit', { token: a })).value.some(
      (event) => event.subjectId === booking.id,
    ),
  );
  const expiredRequest = await create();
  const expiringBid = (
    await request(
      '/service-requests/' + expiredRequest.id + '/bids',
      { token: p, body: quote },
      201,
    )
  ).value;
  await db.bid.update({
    where: { id: expiringBid.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await request(
    '/bids/' + expiringBid.id + '/accept',
    { token: c, body: {} },
    409,
  );
  // A second eligible provider is a fixture for competing-bid concurrency.
  const rival = await register('PROVIDER');
  await db.providerProfile.update({
    where: { userId: rival.user.id },
    data: {
      verification: 'APPROVED',
      available: true,
      categories: [category.id],
    },
  });
  const competingRequest = await create();
  const originalBid = (
    await request(
      '/service-requests/' + competingRequest.id + '/bids',
      { token: p, body: quote },
      201,
    )
  ).value;
  const rivalBid = (
    await request(
      '/service-requests/' + competingRequest.id + '/bids',
      { token: rival.accessToken, body: { ...quote, totalMinor: 12000 } },
      201,
    )
  ).value;
  const competing = await Promise.all([
    request(
      '/bids/' + originalBid.id + '/accept',
      { token: c, body: {} },
      [201, 409],
    ),
    request(
      '/bids/' + rivalBid.id + '/accept',
      { token: c, body: {} },
      [201, 409],
    ),
  ]);
  assert.equal(competing.filter((result) => result.status === 201).length, 1);
  assert.equal(
    await db.booking.count({ where: { requestId: competingRequest.id } }),
    1,
  );

  // Durable conversations are booking scoped and duplicate-safe.
  const messageBody = {
    text: 'Please confirm the completed repair is working.',
    clientId: randomUUID(),
  };
  const message = (
    await request(
      '/bookings/' + booking.id + '/messages',
      { token: c, body: messageBody },
      201,
    )
  ).value;
  assert.equal(
    (
      await request(
        '/bookings/' + booking.id + '/messages',
        { token: c, body: messageBody },
        201,
      )
    ).value.id,
    message.id,
  );
  await request(
    '/bookings/' + booking.id + '/messages',
    { token: c, body: { ...messageBody, text: 'A conflicting replay' } },
    409,
  );
  await request('/bookings/' + booking.id + '/messages', { token: o }, 404);
  await request(
    '/bookings/' + booking.id + '/messages/read',
    { token: p, body: {} },
    201,
  );
  assert.ok(
    (
      await request('/bookings/' + booking.id + '/messages', { token: c })
    ).value.find((row) => row.id === message.id).readAt,
  );
  assert.equal(await db.message.count({ where: { bookingId: booking.id } }), 1);
  const ticket = (
    await request(
      '/support',
      {
        token: c,
        body: {
          subject: 'Synthetic support case',
          description: 'Please assist with this synthetic service issue.',
        },
      },
      201,
    )
  ).value;
  assert.ok(
    !(await request('/support', { token: o })).value.some(
      (row) => row.id === ticket.id,
    ),
  );
  await request(
    '/admin/support/' + ticket.id,
    {
      token: o,
      body: { status: 'RESOLVED', response: 'Not authorised to resolve.' },
    },
    403,
  );
  await request(
    '/admin/support/' + ticket.id,
    {
      token: a,
      body: {
        status: 'RESOLVED',
        response: 'We reviewed this synthetic support case.',
      },
    },
    201,
  );
  assert.equal(
    (await request('/support', { token: c })).value.find(
      (row) => row.id === ticket.id,
    ).status,
    'RESOLVED',
  );
  const dispute = (
    await request(
      '/bookings/' + booking.id + '/dispute',
      {
        token: c,
        body: {
          reason: 'The synthetic customer requests an independent review.',
        },
      },
      201,
    )
  ).value;
  await request('/bookings/' + booking.id + '/dispute', { token: o }, 404);
  await request(
    '/bookings/' + booking.id + '/dispute',
    { token: p, body: { reason: 'Duplicate dispute for the same booking.' } },
    409,
  );
  await request(
    '/admin/disputes/' + dispute.id,
    {
      token: a,
      body: {
        resolution:
          'This synthetic dispute was reviewed and resolved without a financial action.',
      },
    },
    201,
  );
  assert.equal(
    (await request('/bookings/' + booking.id + '/dispute', { token: c })).value
      .status,
    'RESOLVED',
  );
  const invoice = (
    await request(
      '/bookings/' + booking.id + '/invoice',
      { token: c, body: {} },
      201,
    )
  ).value;
  assert.equal(invoice.status, 'UNPAID');
  assert.equal(invoice.totalMinor, '12345');
  assert.equal(
    (
      await request(
        '/bookings/' + booking.id + '/invoice',
        { token: p, body: {} },
        201,
      )
    ).value.id,
    invoice.id,
  );
  const pdf = await fetch(base + '/invoices/' + invoice.id + '/pdf', {
    headers: { Authorization: 'Bearer ' + c },
  });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  );
  checks++;
  await request('/invoices/' + invoice.id + '/pdf', { token: o }, 404);
  assert.equal(
    (await request('/providers/earnings', { token: p })).value
      .completedQuotedMinor,
    '12345',
  );
  const liveBooking = competing.find((row) => row.status === 201).value;
  const liveToken =
    liveBooking.bidId === originalBid.id ? p : rival.accessToken;
  await request(
    '/bookings/' + liveBooking.id + '/status',
    { token: liveToken, body: { status: 'EN_ROUTE' } },
    201,
  );
  const gps = {
    latitude: -33.96,
    longitude: 25.6,
    accuracyMetres: 12,
    observedAt: new Date().toISOString(),
  };
  await request(
    '/bookings/' + liveBooking.id + '/location',
    { token: liveToken, body: gps },
    409,
  );
  await request(
    '/bookings/' + liveBooking.id + '/tracking-consent',
    { token: c, body: { enabled: true } },
    403,
  );
  await request(
    '/bookings/' + liveBooking.id + '/tracking-consent',
    { token: liveToken, body: { enabled: true, durationMinutes: 15 } },
    201,
  );
  await request(
    '/bookings/' + liveBooking.id + '/location',
    {
      token: liveToken,
      body: { ...gps, observedAt: new Date().toISOString() },
    },
    201,
  );
  assert.equal(
    (await request('/bookings/' + liveBooking.id + '/location', { token: c }))
      .value.location.latitude,
    -33.96,
  );
  await request('/bookings/' + liveBooking.id + '/location', { token: o }, 404);
  await db.locationEvent.updateMany({
    where: { bookingId: liveBooking.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  assert.equal(
    (await request('/bookings/' + liveBooking.id + '/location', { token: c }))
      .value.location,
    null,
  );
  await request(
    '/bookings/' + liveBooking.id + '/tracking-consent',
    { token: liveToken, body: { enabled: false } },
    201,
  );
  assert.equal(
    await db.locationEvent.count({ where: { bookingId: liveBooking.id } }),
    0,
  );
  await request(
    '/bookings/' + liveBooking.id + '/cancel',
    {
      token: o,
      body: { reason: 'An unrelated account cannot cancel this booking.' },
    },
    404,
  );
  await request(
    '/bookings/' + liveBooking.id + '/cancel',
    {
      token: c,
      body: {
        reason: 'The synthetic customer no longer requires this service.',
      },
    },
    201,
  );
  await request(
    '/bookings/' + liveBooking.id + '/invoice',
    { token: c, body: {} },
    409,
  );
  await request(
    '/bookings/' + booking.id + '/cancel',
    {
      token: c,
      body: { reason: 'Completed work cannot be cancelled directly.' },
    },
    409,
  );
  const draftInput = {
    categoryId: category.id,
    description: 'Saved unfinished draft',
    latitude: -33.96,
    longitude: 25.6,
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  };
  const draft = (
    await request(
      '/service-request-drafts',
      { token: c, body: draftInput },
      201,
    )
  ).value;
  assert.equal(draft.publishedAt, null);
  assert.ok(
    !(await request('/opportunities', { token: p })).value.some(
      (row) => row.id === draft.id,
    ),
  );
  await request(
    '/service-requests/' + draft.id,
    { token: o, method: 'PATCH', body: draftInput },
    409,
  );
  await request('/service-requests/' + draft.id, {
    token: c,
    method: 'PATCH',
    body: {
      ...draftInput,
      description: 'Edited scheduled synthetic maintenance request.',
    },
  });
  await request(
    '/service-requests/' + draft.id + '/publish',
    { token: c, body: {} },
    201,
  );
  await request(
    '/service-requests/' + draft.id,
    { token: c, method: 'PATCH', body: draftInput },
    409,
  );
  // Multi-tenant procurement: membership, row scope, approval and budget enforcement.
  const org = (
    await request(
      '/organisations',
      {
        token: c,
        body: {
          name: 'Synthetic Company ' + runId,
          kind: 'BUSINESS',
          spendingLimitMinor: 50000,
        },
      },
      201,
    )
  ).value;
  const otherOrg = (
    await request(
      '/organisations',
      {
        token: o,
        body: { name: 'Separate Tenant ' + runId, kind: 'ENTERPRISE' },
      },
      201,
    )
  ).value;
  await request('/organisations/' + otherOrg.id, { token: c }, 404);
  await request('/organisations/' + org.id, { token: p }, 404);
  await request(
    '/organisations/' + org.id + '/members',
    { token: c, body: { email: other.user.email, role: 'MEMBER' } },
    201,
  );
  await request(
    '/organisations/' + org.id + '/departments',
    { token: o, body: { name: 'Unauthorised' } },
    404,
  );
  await request(
    '/organisations/' + org.id + '/departments',
    { token: c, body: { name: 'Facilities' } },
    201,
  );
  const centre = (
    await request(
      '/organisations/' + org.id + '/cost-centres',
      { token: c, body: { name: 'Operations', code: 'OPS' } },
      201,
    )
  ).value;
  const otherCentre = (
    await request(
      '/organisations/' + otherOrg.id + '/cost-centres',
      { token: o, body: { name: 'Separate', code: 'OTHER' } },
      201,
    )
  ).value;
  const site = (
    await request(
      '/organisations/' + org.id + '/locations',
      {
        token: c,
        body: {
          name: 'Gqeberha Office',
          address: 'Synthetic 10 Test Street, Gqeberha',
          latitude: -33.96,
          longitude: 25.6,
        },
      },
      201,
    )
  ).value;
  const procurement = {
    categoryId: category.id,
    locationId: site.id,
    costCentreId: centre.id,
    description: 'Synthetic company maintenance service request.',
    budgetMinor: 10000,
    purchaseOrder: 'PO-' + runId,
  };
  await request(
    '/organisations/' + org.id + '/requests',
    { token: o, body: { ...procurement, costCentreId: otherCentre.id } },
    400,
  );
  await request(
    '/organisations/' + org.id + '/requests',
    { token: o, body: { ...procurement, budgetMinor: 60000 } },
    400,
  );
  const companyRequest = (
    await request(
      '/organisations/' + org.id + '/requests',
      { token: c, body: procurement },
      201,
    )
  ).value;
  assert.equal(companyRequest.publishedAt, null);
  await assert.rejects(
    db.organisationApproval.update({
      where: { id: companyRequest.approval.id },
      data: { costCentreId: otherCentre.id },
    }),
  );
  await request(
    '/organisations/' + org.id + '/approvals/' + companyRequest.approval.id,
    { token: o, body: { decision: 'APPROVED' } },
    404,
  );
  await request(
    '/organisations/' +
      otherOrg.id +
      '/approvals/' +
      companyRequest.approval.id,
    { token: o, body: { decision: 'APPROVED' } },
    404,
  );
  await request(
    '/organisations/' + org.id + '/approvals/' + companyRequest.approval.id,
    { token: c, body: { decision: 'APPROVED' } },
    201,
  );
  await request(
    '/organisations/' + org.id + '/approvals/' + companyRequest.approval.id,
    { token: c, body: { decision: 'APPROVED' } },
    409,
  );
  const companyBid = (
    await request(
      '/service-requests/' + companyRequest.id + '/bids',
      { token: p, body: quote },
      201,
    )
  ).value;
  await request(
    '/bids/' + companyBid.id + '/accept',
    { token: c, body: {} },
    409,
  );
  await request('/bids/' + companyBid.id, {
    token: p,
    method: 'PATCH',
    body: { ...quote, totalMinor: 9000 },
  });
  await request(
    '/bids/' + companyBid.id + '/accept',
    { token: c, body: {} },
    201,
  );
  await request('/organisations/' + org.id + '/report', { token: o }, 404);
  assert.equal(
    (await request('/organisations/' + org.id + '/report', { token: c })).value
      .approvedBudgetMinor,
    '10000',
  );
  await request(
    '/organisations/' + org.id + '/contracts',
    {
      token: c,
      body: {
        name: 'Synthetic response SLA',
        terms: 'Synthetic service response agreement for development only.',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        responseMinutes: 60,
        escalationEmail: 'operations@example.invalid',
      },
    },
    201,
  );
  await request(
    '/admin/verifications/' + profile.id,
    { token: a, body: { status: 'SUSPENDED' } },
    201,
  );
  await request('/opportunities', { token: p }, 403);
  const auth = await request(
    '/auth/login',
    { body: { email: customer.user.email, password } },
    201,
  );
  await request('/auth/refresh', { cookie: auth.cookie, body: {} }, 403);
  const rotated = await request(
    '/auth/refresh',
    { cookie: auth.cookie, client: true, body: {} },
    201,
  );
  await request(
    '/auth/refresh',
    { cookie: auth.cookie, client: true, body: {} },
    401,
  );
  await request('/auth/me', { token: auth.value.accessToken }, 401);
  await request(
    '/auth/logout',
    { token: rotated.value.accessToken, body: {} },
    201,
  );
  await request('/auth/me', { token: rotated.value.accessToken }, 401);
  console.log(
    `PASS: ${checks} HTTP assertions plus database integrity, concurrency, privacy and full marketplace lifecycle checks`,
  );
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await db.$disconnect();
}
