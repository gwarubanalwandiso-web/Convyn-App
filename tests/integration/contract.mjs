import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { hash } from '@node-rs/argon2';
import { createServer } from 'node:http';
import { smtpSink, decodeMail } from '../helpers/smtp.mjs';
const url = new URL(process.env.DATABASE_URL);
if (url.pathname !== '/convyn_contract_test')
  throw new Error('An isolated contract database is required');
const client = new Client({ connectionString: url.toString() });
await client.connect();
// Retire previous isolated fixtures before enabling this run's SMTP transport.
await client.query('SELECT marketplace.expire_quotes()');
await client.query(
  "UPDATE marketplace.\"EmailDelivery\" SET status='failed' WHERE status IN ('queued','processing')",
);
const smtp = await smtpSink();
const ai = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    const input = JSON.parse(body);
    assert.ok(input.messages[0].content.includes('plumbing'));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category_slug: 'not-a-service',
                urgency: 'urgent',
                summary:
                  'A kitchen pipe needs attention. A professional can inspect the connection.',
                questions: ['Where is the leak?'],
              }),
            },
          },
        ],
      }),
    );
  });
});
await new Promise((resolve) => ai.listen(4621, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: {
    ...process.env,
    PORT: '4021',
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:4173',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '2527',
    SMTP_FROM: 'support@example.invalid',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_REQUIRE_TLS: 'false',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    OPENAI_API_KEY: 'local-test-only',
    OPENAI_MODEL: 'local-test-only',
    TEST_AI_ENDPOINT: 'http://127.0.0.1:4621/chat',
    WEB_ORIGINS: 'http://localhost:4173',
    FILE_UPLOAD_ROOT: '.runtime/contract-test-uploads',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (b) => {
  output += b;
});
child.stderr.on('data', (b) => {
  output += b;
});
const base = 'http://127.0.0.1:4021/v1',
  password = 'Contract-test-' + randomUUID(),
  suffix = randomUUID();
let checks = 0;
async function request(
  path,
  { token, body, method, headers = {} } = {},
  expected = 200,
) {
  const form = body instanceof FormData;
  const r = await fetch(base + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(!form ? { 'Content-Type': 'application/json' } : {}),
      'X-Convyn-Client': '1',
      ...headers,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  assert.equal(r.status, expected, path + ' ' + JSON.stringify(value));
  checks++;
  if (expected >= 400) assert.ok(value.error || value.message);
  return value;
}
async function account(kind) {
  const email = kind + '-' + suffix + '@example.invalid';
  return request(
    '/marketplace/auth/register',
    {
      body: {
        email,
        password,
        firstName: kind,
        lastName: 'Synthetic',
        mobile: '+27821234567',
        consent: true,
        role: kind.startsWith('provider') ? 'PROVIDER' : 'CUSTOMER',
      },
    },
    201,
  );
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/ready')).ok) break;
    } catch {}
    if (i === 99) throw new Error('API not ready: ' + output);
    await new Promise((r) => setTimeout(r, 100));
  }
  const categories = await request('/marketplace/entities/ServiceCategory');
  assert.equal(categories.length, 9);
  assert.deepEqual(
    categories.map((c) => c.slug),
    [
      'electrical',
      'plumbing',
      'locksmith',
      'appliance-repair',
      'hvac',
      'handyman',
      'cleaning',
      'towing-recovery',
      'it-support',
    ],
  );
  const cfg = (await request('/marketplace/entities/PlatformSetting'))[0];
  assert.equal(cfg.commission_pct, 12);
  const customer = await account('customer'),
    other = await account('other'),
    provider = await account('provider'),
    second = await account('provider-two');
  const adminId = randomUUID(),
    adminEmail = 'admin-' + suffix + '@example.invalid';
  await client.query(
    'INSERT INTO public."User"(id,email,"passwordHash","firstName","lastName",mobile,"consentAt",role) VALUES($1,$2,$3,\'Admin\',\'Synthetic\',\'+27821234567\',now(),\'ADMIN\')',
    [adminId, adminEmail, await hash(password)],
  );
  const admin = await request(
      '/auth/login',
      { body: { email: adminEmail, password } },
      201,
    ),
    c = customer.accessToken,
    o = other.accessToken,
    p = provider.accessToken,
    p2 = second.accessToken,
    a = admin.accessToken;
  const profileData = {
    display_name: 'Synthetic plumber',
    bio: 'Experienced plumbing repairs for the local test community.',
    category_slugs: ['plumbing'],
    latitude: -33.96,
    longitude: 25.6,
    city: 'Gqeberha',
    suburb: 'Central',
    service_radius_km: 30,
    verification_status: 'submitted',
    availability: 'offline',
    emergency_available: true,
  };
  const profile = await request(
      '/marketplace/entities/ProviderProfile',
      { token: p, body: profileData },
      201,
    ),
    profile2 = await request(
      '/marketplace/entities/ProviderProfile',
      {
        token: p2,
        body: { ...profileData, display_name: 'Second test plumber' },
      },
      201,
    );
  await request(
    '/marketplace/entities/ProviderProfile/' + profile.id,
    { token: p, method: 'PATCH', body: { verification_status: 'approved' } },
    403,
  );
  const req = await request(
    '/marketplace/entities/ServiceRequest',
    {
      token: c,
      body: {
        category_slug: 'plumbing',
        description:
          'Repair a leaking kitchen pipe and inspect the connection.',
        address: 'Synthetic test address',
        suburb: 'Central',
        city: 'Gqeberha',
        latitude: -33.96,
        longitude: 25.6,
        customer_phone: '+27821234567',
        urgency: 'standard',
        status: 'open',
      },
    },
    201,
  );
  await request(
    '/marketplace/entities/ServiceRequest/' + req.id,
    { token: o },
    404,
  );
  await request(
    '/marketplace/entities/ServiceRequest/' + req.id,
    { token: p },
    404,
  );
  await request(
    '/marketplace/functions/listOpportunities',
    { token: p, body: { provider_profile_id: profile.id } },
    403,
  );
  const quote = {
    request_id: req.id,
    price_cents: 101001,
    callout_fee_cents: 59000,
    labour_cents: 42001,
    materials_cents: 0,
    travel_cents: 0,
    after_hours_cents: 0,
    eta_minutes: 30,
    duration_minutes: 60,
    warranty_days: 30,
    valid_until: new Date(Date.now() + 3600000).toISOString(),
    comments: 'Includes the stated callout and labour.',
  };
  await request(
    '/marketplace/functions/submitBid',
    { token: p, body: quote },
    403,
  );
  await request(
    '/marketplace/functions/reviewProviderVerification',
    {
      token: c,
      body: {
        provider_profile_id: profile.id,
        decision: 'approve',
        notes: 'Reviewed synthetic evidence.',
      },
    },
    403,
  );
  for (const profileId of [profile.id, profile2.id])
    await request(
      '/marketplace/functions/reviewProviderVerification',
      {
        token: a,
        body: {
          provider_profile_id: profileId,
          decision: 'approve',
          notes: 'Reviewed synthetic test profile.',
        },
      },
      201,
    );
  const publicProviders = await request(
    '/marketplace/entities/ProviderProfile',
  );
  assert.ok(publicProviders.some((x) => x.id === profile.id));
  assert.ok(
    publicProviders.every(
      (x) =>
        !('documents' in x) && !('user_email' in x) && !('payout_method' in x),
    ),
  );
  const opportunities = await request(
    '/marketplace/functions/listOpportunities',
    { token: p, body: { provider_profile_id: profile.id } },
    201,
  );
  assert.ok(opportunities.some((x) => x.id === req.id));
  assert.ok(
    opportunities.every(
      (x) =>
        !('customer_phone' in x) &&
        !('address' in x) &&
        !('customer_email' in x),
    ),
  );
  await request(
    '/marketplace/functions/submitBid',
    { token: p, body: { ...quote, price_cents: 100000 } },
    422,
  );
  await request(
    '/marketplace/functions/submitBid',
    {
      token: p,
      body: {
        ...quote,
        price_cents: 58999,
        callout_fee_cents: 58999,
        labour_cents: 0,
      },
    },
    422,
  );
  await request(
    '/marketplace/functions/submitBid',
    {
      token: p,
      body: {
        ...quote,
        valid_until: new Date(Date.now() - 10000).toISOString(),
      },
    },
    422,
  );
  const bid = await request(
      '/marketplace/functions/submitBid',
      { token: p, body: quote },
      201,
    ),
    updated = await request(
      '/marketplace/functions/submitBid',
      { token: p, body: quote },
      201,
    );
  assert.equal(updated.id, bid.id);
  const competing = await request(
    '/marketplace/functions/submitBid',
    { token: p2, body: { ...quote, price_cents: 105000, labour_cents: 46000 } },
    201,
  );
  const own = await request('/marketplace/entities/Bid?request_id=' + req.id, {
    token: p,
  });
  assert.equal(own.length, 1);
  assert.equal(own[0].id, bid.id);
  assert.equal(
    (
      await request('/marketplace/entities/Bid?request_id=' + req.id, {
        token: o,
      })
    ).length,
    0,
  );
  assert.equal(
    (
      await request('/marketplace/entities/ServiceRequest/' + req.id, {
        token: c,
      })
    ).bid_count,
    2,
  );
  const ranked = await request(
    '/marketplace/functions/scoreBids',
    { token: c, body: { request_id: req.id } },
    201,
  );
  assert.equal(ranked.length, 2);
  assert.ok(
    ranked.every(
      (b) =>
        b.score >= 0 &&
        b.score <= 100 &&
        b.score_explanation &&
        b.scoring_version,
    ),
  );
  await request(
    '/marketplace/functions/acceptBid',
    { token: o, body: { bid_id: bid.id } },
    403,
  );
  await request(
    '/marketplace/functions/acceptBid',
    {
      token: c,
      body: { bid_id: bid.id },
      headers: { 'X-Convyn-Quoted-Amount': String(bid.price_cents - 1) },
    },
    409,
  );
  const results = await Promise.all([
    fetch(base + '/marketplace/functions/acceptBid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + c,
      },
      body: JSON.stringify({ bid_id: bid.id }),
    }),
    fetch(base + '/marketplace/functions/acceptBid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + c,
      },
      body: JSON.stringify({ bid_id: competing.id }),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  checks += 2;
  const job = (await results.find((r) => r.status === 201).json()).booking;
  assert.equal(
    BigInt(job.commission_cents) + BigInt(job.payout_cents),
    BigInt(job.amount_cents),
  );
  assert.equal(
    job.commission_cents,
    Math.floor((job.amount_cents * 12 + 50) / 100),
  );
  assert.equal(job.members.length, 2);
  const assigned = job.provider_profile_id === profile.id ? p : p2;
  await request(
    '/marketplace/functions/completeBooking',
    { token: o, body: { booking_id: job.id, action: 'advance' } },
    403,
  );
  await request(
    '/marketplace/functions/createReview',
    {
      token: c,
      body: { booking_id: job.id, rating: 5, comment: 'Too early to review.' },
    },
    422,
  );
  for (const status of ['en_route', 'arrived', 'in_progress', 'completed'])
    await request(
      '/marketplace/functions/completeBooking',
      {
        token: assigned,
        body: { booking_id: job.id, action: 'advance', status },
      },
      201,
    );
  await request(
    '/marketplace/functions/completeBooking',
    { token: c, body: { booking_id: job.id, action: 'close' } },
    201,
  );
  await request(
    '/marketplace/functions/completeBooking',
    { token: c, body: { booking_id: job.id, action: 'close' } },
    422,
  );
  await request(
    '/marketplace/functions/createReview',
    {
      token: c,
      body: {
        booking_id: job.id,
        rating: 5,
        comment: 'The repair was completed carefully and clearly.',
        tags: ['clear communication'],
      },
    },
    201,
  );
  await request(
    '/marketplace/functions/createReview',
    {
      token: c,
      body: {
        booking_id: job.id,
        rating: 4,
        comment: 'Duplicate review is not allowed.',
      },
    },
    409,
  );
  const updatedProfile = (
    await request('/marketplace/entities/ProviderProfile?mine=true', {
      token: assigned,
    })
  )[0];
  assert.equal(updatedProfile.rating_avg, 5);
  assert.equal(updatedProfile.reviews_count, 1);
  assert.equal(updatedProfile.jobs_completed, 1);
  assert.equal(
    (
      await request('/marketplace/entities/ServiceRequest/' + req.id, {
        token: c,
      })
    ).status,
    'completed',
  );
  assert.ok(
    (await request('/marketplace/entities/Notification', { token: c })).length >
      0,
  );
  assert.equal(
    (await request('/marketplace/entities/AuditLog', { token: o })).length,
    0,
  );
  assert.ok(
    (await request('/marketplace/entities/AuditLog', { token: a })).length > 0,
  );
  await request(
    '/marketplace/entities/AuditLog',
    { token: a, body: { action: 'fake' } },
    403,
  );
  await request(
    '/marketplace/entities/PlatformSetting/' + cfg.id,
    { token: c, method: 'PATCH', body: { commission_pct: 0 } },
    404,
  );
  const fileForm = new FormData();
  fileForm.append(
    'files',
    new Blob(['not an image'], { type: 'image/png' }),
    'fake.png',
  );
  await request(
    '/marketplace/files/requests',
    { token: c, body: fileForm },
    400,
  );
  // Private media uses verified contents and the same ownership/booking policies.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=',
    'base64',
  );
  const mediaForm = new FormData();
  mediaForm.append(
    'files',
    new Blob([png], { type: 'image/png' }),
    'private-test.png',
  );
  const media = (
    await request(
      '/marketplace/files/requests',
      { token: c, body: mediaForm },
      201,
    )
  )[0];
  const baseRequest = {
    category_slug: 'plumbing',
    description: 'Inspect a burst pipe leaking in the synthetic kitchen area.',
    address: 'Synthetic private address',
    suburb: 'Central',
    city: 'Gqeberha',
    latitude: -33.96,
    longitude: 25.6,
    customer_phone: '+27821234567',
    urgency: 'standard',
    status: 'open',
  };
  const mediaRequest = await request(
    '/marketplace/entities/ServiceRequest',
    { token: c, body: { ...baseRequest, attachments: [media.uri] } },
    201,
  );
  for (const token of [c, p, a]) {
    const response = await fetch(base + '/marketplace/files/' + media.id, {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    checks++;
  }
  await request('/marketplace/files/' + media.id, { token: o }, 404);
  await request('/marketplace/files/' + media.id, {}, 401);
  await request(
    '/marketplace/entities/ServiceRequest',
    { token: o, body: { ...baseRequest, attachments: [media.uri] } },
    403,
  );
  const docsForm = new FormData();
  docsForm.append(
    'files',
    new Blob([png], { type: 'image/png' }),
    'private-document.png',
  );
  const document = (
    await request(
      '/marketplace/files/documents',
      { token: p, body: docsForm },
      201,
    )
  )[0];
  await request('/marketplace/files/' + document.id, { token: c }, 404);
  const adminFile = await fetch(base + '/marketplace/files/' + document.id, {
    headers: { Authorization: 'Bearer ' + a },
  });
  assert.equal(adminFile.status, 200);
  await adminFile.arrayBuffer();
  checks++;
  await request(
    '/marketplace/entities/ServiceRequest',
    {
      token: c,
      body: { ...baseRequest, description: { unexpected: 'object' } },
    },
    400,
  );
  await request(
    '/marketplace/entities/ServiceRequest',
    { token: c, body: { ...baseRequest, customer_phone: 'not-a-phone' } },
    422,
  );
  await request(
    '/marketplace/entities/ServiceRequest',
    { token: c, body: { ...baseRequest, created_by_id: other.user.id } },
    400,
  );
  await request(
    '/marketplace/entities/ProviderProfile/' + profile.id,
    { token: p, method: 'PATCH', body: { skills: { unexpected: 'object' } } },
    400,
  );
  const wrongCategory = await request(
    '/marketplace/entities/ProviderProfile',
    {
      token: o,
      body: {
        ...profileData,
        display_name: 'Different category',
        category_slugs: ['electrical'],
      },
    },
    201,
  );
  await request(
    '/marketplace/functions/reviewProviderVerification',
    {
      token: a,
      body: {
        provider_profile_id: wrongCategory.id,
        decision: 'approve',
        notes: 'Synthetic separate-category profile.',
      },
    },
    201,
  );
  const unrelated = await request(
    '/marketplace/functions/listOpportunities',
    { token: o, body: { provider_profile_id: wrongCategory.id } },
    201,
  );
  assert.ok(!unrelated.some((r) => r.id === mediaRequest.id));
  await request('/marketplace/files/' + media.id, { token: o }, 404);
  await request(
    '/marketplace/entities/ProviderProfile/' + profile2.id,
    { token: p2, method: 'PATCH', body: { latitude: 0, longitude: 0 } },
    200,
  );
  const distant = await request(
    '/marketplace/functions/listOpportunities',
    { token: p2, body: { provider_profile_id: profile2.id } },
    201,
  );
  assert.ok(!distant.some((r) => r.id === mediaRequest.id));
  await request(
    '/marketplace/functions/submitBid',
    { token: p2, body: { ...quote, request_id: mediaRequest.id } },
    403,
  );
  await request(
    '/marketplace/entities/ProviderProfile/' + profile2.id,
    { token: p2, method: 'PATCH', body: { latitude: -33.96, longitude: 25.6 } },
    200,
  );
  const emergency = await request(
    '/marketplace/entities/ServiceRequest',
    { token: c, body: { ...baseRequest, urgency: 'emergency' } },
    201,
  );
  await request(
    '/marketplace/functions/submitBid',
    {
      token: p,
      body: {
        ...quote,
        request_id: emergency.id,
        price_cents: 300000,
        labour_cents: 241000,
      },
    },
    422,
  );
  await request(
    '/marketplace/functions/submitBid',
    {
      token: p,
      body: { ...quote, request_id: emergency.id, price_cents: 101001.5 },
    },
    400,
  );
  const withdrawn = await request(
    '/marketplace/functions/submitBid',
    { token: p, body: { ...quote, request_id: mediaRequest.id } },
    201,
  );
  await request(
    '/marketplace/functions/withdrawBid',
    { token: p, body: { bid_id: withdrawn.id } },
    201,
  );
  const resubmitted = await request(
    '/marketplace/functions/submitBid',
    { token: p, body: { ...quote, request_id: mediaRequest.id } },
    201,
  );
  assert.equal(resubmitted.id, withdrawn.id);
  // A bid that expires after submission cannot be accepted, even with a stale browser.
  await client.query(
    'UPDATE marketplace."Bid" SET valid_until=now()-interval \'1 second\' WHERE id=$1',
    [withdrawn.id],
  );
  await request(
    '/marketplace/functions/acceptBid',
    { token: c, body: { bid_id: withdrawn.id } },
    422,
  );
  const legacyCategory = randomUUID(),
    legacyRequest = randomUUID(),
    legacyBid = randomUUID(),
    legacyBooking = randomUUID();
  await client.query('INSERT INTO public."Category"(id,name) VALUES($1,$2)', [
    legacyCategory,
    'Legacy-' + suffix,
  ]);
  const oldProfile = (
    await client.query(
      'UPDATE public."ProviderProfile" SET verification=\'APPROVED\',available=true,categories=ARRAY[$2::text] WHERE "userId"=$1 RETURNING id',
      [provider.user.id, legacyCategory],
    )
  ).rows[0];
  await client.query(
    'INSERT INTO public."ServiceRequest"(id,"customerId","categoryId",description,latitude,longitude,"publishedAt") VALUES($1,$2,$3,\'Synthetic retained job for compatibility testing.\',-33.96,25.6,now())',
    [legacyRequest, customer.user.id, legacyCategory],
  );
  await client.query(
    'INSERT INTO public."Bid"(id,"requestId","providerId","totalMinor","pricingVersion","arrivalMinutes",comment,"expiresAt") VALUES($1,$2,$3,101000,\'pricing-v1\',30,\'Synthetic retained quote.\',now()+interval \'1 hour\')',
    [legacyBid, legacyRequest, oldProfile.id],
  );
  await client.query(
    'INSERT INTO public."Booking"(id,"requestId","bidId") VALUES($1,$2,$3)',
    [legacyBooking, legacyRequest, legacyBid],
  );
  const capacityRequest = await request(
      '/marketplace/entities/ServiceRequest',
      { token: c, body: baseRequest },
      201,
    ),
    capacityBid = await request(
      '/marketplace/functions/submitBid',
      { token: p, body: { ...quote, request_id: capacityRequest.id } },
      201,
    );
  await request(
    '/marketplace/functions/acceptBid',
    { token: c, body: { bid_id: capacityBid.id } },
    409,
  );
  const ownHistory = await request('/marketplace/legacy', { token: c });
  assert.ok(ownHistory.bookings.some((b) => b.id === legacyBooking));
  const unrelatedHistory = await request('/marketplace/legacy', { token: o });
  assert.ok(!unrelatedHistory.bookings.some((b) => b.id === legacyBooking));
  await request(
    '/marketplace/legacy/requests/' + legacyRequest + '/quotes',
    { token: o },
    404,
  );
  await client.query(
    'UPDATE public."Booking" SET status=\'CANCELLED\' WHERE id=$1',
    [legacyBooking],
  );
  const capacityJob = (
    await request(
      '/marketplace/functions/acceptBid',
      { token: c, body: { bid_id: capacityBid.id } },
      201,
    )
  ).booking;
  await assert.rejects(
    client.query(
      'UPDATE public."Booking" SET status=\'CONFIRMED\' WHERE id=$1',
      [legacyBooking],
    ),
    (error) => error.code === '23505',
  );
  await request(
    '/marketplace/functions/cancelBooking',
    { token: c, body: { booking_id: capacityJob.id } },
    201,
  );
  await client.query(
    'UPDATE public."Booking" SET status=\'CONFIRMED\' WHERE id=$1',
    [legacyBooking],
  );
  // Retained job completion and review update the current provider's real history.
  await request(
    '/bookings/' + legacyBooking + '/status',
    { token: p, body: { status: 'EN_ROUTE' } },
    201,
  );
  await request(
    '/bookings/' + legacyBooking + '/status',
    { token: p, body: { status: 'ARRIVED' } },
    201,
  );
  await request(
    '/bookings/' + legacyBooking + '/status',
    { token: p, body: { status: 'IN_PROGRESS' } },
    201,
  );
  await request(
    '/bookings/' + legacyBooking + '/status',
    {
      token: p,
      body: {
        status: 'AWAITING_CONFIRMATION',
        completionNote: 'The retained synthetic repair is complete and tested.',
      },
    },
    201,
  );
  await request(
    '/bookings/' + legacyBooking + '/status',
    { token: c, body: { status: 'COMPLETED' } },
    201,
  );
  await request(
    '/bookings/' + legacyBooking + '/reviews',
    {
      token: c,
      body: {
        rating: 4,
        comment: 'A retained completed job with clear communication.',
      },
    },
    201,
  );
  const carried = (
    await request('/marketplace/entities/ProviderProfile?mine=true', {
      token: p,
    })
  )[0];
  const newWon = job.provider_profile_id === profile.id;
  assert.equal(carried.jobs_completed, newWon ? 2 : 1);
  assert.equal(carried.reviews_count, newWon ? 2 : 1);
  assert.equal(carried.rating_avg, newWon ? 4.5 : 4);
  await request(
    '/marketplace/entities/ProviderProfile/' + profile.id,
    {
      token: a,
      method: 'PATCH',
      body: { verification_status: 'suspended', availability: 'offline' },
    },
    200,
  );
  await request('/opportunities', { token: p }, 403);
  await request(
    '/marketplace/functions/submitBid',
    { token: p, body: { ...quote, request_id: emergency.id } },
    403,
  );
  await request(
    '/marketplace/functions/reviewProviderVerification',
    {
      token: a,
      body: {
        provider_profile_id: profile.id,
        decision: 'approve',
        notes: 'Synthetic suspension review completed.',
      },
    },
    201,
  );
  await client.query(
    'UPDATE public."ProviderProfile" SET verification=\'SUSPENDED\' WHERE id=$1',
    [oldProfile.id],
  );
  await request(
    '/marketplace/functions/listOpportunities',
    { token: p, body: { provider_profile_id: profile.id } },
    403,
  );
  await client.query(
    'UPDATE public."ProviderProfile" SET verification=\'APPROVED\' WHERE id=$1',
    [oldProfile.id],
  );
  const suggestion = await request(
    '/marketplace/functions/suggestService',
    {
      token: c,
      body: {
        description:
          'A burst pipe is leaking in the kitchen and needs a plumbing repair.',
      },
    },
    201,
  );
  assert.equal(suggestion.category_slug, 'plumbing');
  assert.equal(suggestion.questions.length, 1);
  assert.equal((suggestion.summary.match(/[.!?](?:\s|$)/g) || []).length, 2);
  await request('/marketplace/auth/google/start', {}, 503);
  await request('/marketplace/people', { token: o }, 403);
  await request(
    '/marketplace/people/' + other.user.id,
    { token: a, method: 'PATCH', body: { role: 'PROVIDER' } },
    200,
  );
  await request('/marketplace/entities/Notification', { token: o }, 401);
  const relogged = await request(
    '/auth/login',
    { body: { email: other.user.email, password } },
    201,
  );
  assert.equal(relogged.user.role, 'PROVIDER');
  const notifications = await request('/marketplace/entities/Notification', {
    token: c,
  });
  if (notifications[0])
    await request(
      '/marketplace/entities/Notification/' + notifications[0].id,
      { token: relogged.accessToken, method: 'PATCH', body: { read: true } },
      404,
    );
  await request(
    '/marketplace/entities/PlatformSetting/' + cfg.id,
    { token: a, method: 'PATCH', body: { weights: { skills: 99 } } },
    400,
  );
  // Actual local SMTP transport: reset links are single-use and revoke old sessions.
  const forgot = await request(
    '/marketplace/auth/forgot-password',
    { body: { email: customer.user.email } },
    201,
  );
  const unknown = await request(
    '/marketplace/auth/forgot-password',
    { body: { email: 'missing-' + suffix + '@example.invalid' } },
    201,
  );
  assert.deepEqual(forgot, unknown);
  const resetMail = smtp.messages
    .map(decodeMail)
    .findLast(
      (text) =>
        text.includes('Reset your CONVYN password') &&
        text.includes(customer.user.email),
    );
  assert.ok(resetMail, 'SMTP captured a reset message');
  const resetToken = resetMail.match(/#token=([A-Za-z0-9_-]{43})/)[1],
    newPassword = 'Changed-contract-' + randomUUID();
  await request(
    '/marketplace/auth/reset-password',
    { body: { token: resetToken, password: newPassword } },
    201,
  );
  await request(
    '/marketplace/auth/reset-password',
    { body: { token: resetToken, password: newPassword } },
    400,
  );
  await request('/marketplace/entities/Booking', { token: c }, 401);
  await request(
    '/auth/login',
    { body: { email: customer.user.email, password: newPassword } },
    201,
  );
  const inviteEmail = 'invited-' + suffix + '@example.invalid';
  await request(
    '/marketplace/invites',
    { token: a, body: { email: inviteEmail, role: 'ADMIN' } },
    201,
  );
  const inviteMail = smtp.messages
    .map(decodeMail)
    .findLast(
      (text) =>
        text.includes('Your CONVYN invitation') && text.includes(inviteEmail),
    );
  assert.ok(inviteMail);
  const inviteToken = inviteMail.match(/#invite=([A-Za-z0-9_-]{43})/)[1];
  const invited = await request(
    '/marketplace/auth/register',
    {
      body: {
        email: inviteEmail,
        password,
        firstName: 'Invited',
        lastName: 'Synthetic',
        mobile: '+27821234567',
        consent: true,
        role: 'CUSTOMER',
        invite: inviteToken,
      },
    },
    201,
  );
  assert.equal(invited.user.role, 'ADMIN');
  // Prioritise this run's recipient over accumulated synthetic administrator notifications.
  await client.query(
    `UPDATE marketplace."EmailDelivery" d SET next_attempt_at=now()-interval '1 day' FROM marketplace."Notification" n WHERE n.id=d.notification_id AND n.user_email=$1 AND d.status='queued'`,
    [customer.user.email],
  );
  for (let i = 0; i < 65; i++) {
    if (
      (
        await client.query(
          'SELECT count(*) FROM marketplace."EmailDelivery" d JOIN marketplace."Notification" n ON n.id=d.notification_id WHERE n.user_email=$1 AND d.status=\'sent\'',
          [customer.user.email],
        )
      ).rows[0].count > 0
    )
      break;
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(
    Number(
      (
        await client.query(
          'SELECT count(*) FROM marketplace."EmailDelivery" d JOIN marketplace."Notification" n ON n.id=d.notification_id WHERE n.user_email=$1 AND d.status=\'sent\'',
          [customer.user.email],
        )
      ).rows[0].count,
    ) > 0,
    'Notification worker delivered through local SMTP',
  );
  const broadcast = await request(
    '/marketplace/messages',
    {
      token: a,
      body: {
        recipient: 'all',
        title: 'Synthetic platform update',
        body: 'Local integration test only.',
        link: '/dashboard',
      },
    },
    201,
  );
  assert.equal(
    broadcast.sent,
    Number(
      (await client.query('SELECT count(*) FROM public."User"')).rows[0].count,
    ),
  );
  // Local clusters may not have the deployment role; do not change an existing password.
  await client.query(
    `DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='convyn_app') THEN CREATE ROLE convyn_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`,
  );
  await client.query(await readFile('prisma/contract-grants.sql', 'utf8'));
  // Simulate the restricted production database role, including worker visibility.
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE convyn_app');
  assert.ok(
    (await client.query('SELECT count(*) FROM marketplace."Notification"'))
      .rows[0].count > 0,
  );
  await client.query('SET LOCAL ROLE convyn_marketplace');
  await client.query("SELECT set_config('convyn.actor_id',$1,true)", [
    provider.user.id,
  ]);
  const limited = await client.query(
    'SELECT * FROM marketplace."ServiceRequest" WHERE id=$1',
    [req.id],
  );
  assert.equal(limited.rowCount, 0);
  await client.query('ROLLBACK');

  // Direct application-role queries must also enforce row isolation.
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE convyn_marketplace');
  await client.query("SELECT set_config('convyn.actor_id',$1,true)", [
    other.user.id,
  ]);
  assert.equal(
    (
      await client.query(
        'SELECT * FROM marketplace."ServiceRequest" WHERE id=$1',
        [req.id],
      )
    ).rows.length,
    0,
  );
  await client.query('ROLLBACK');
  console.log(
    `PASS: ${checks} contract HTTP assertions, exact category seed, RLS, atomic acceptance race, integer commission, lifecycle and rating aggregation.`,
  );
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => {});
  }
  await client.end();
  await smtp.close();
  ai.closeAllConnections();
  await new Promise((resolve) => ai.close(resolve));
}
