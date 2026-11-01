import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { spawnSync } from 'node:child_process';
// Explicitly restricted to this isolated Compose deployment, never a public host.
const envFile = 'infrastructure/deployment/.runtime/marketplace-test.env';
const config = await readFile(envFile, 'utf8');
if (!/^COMPOSE_PROJECT_NAME=convyn_marketplace_test$/m.test(config))
  throw new Error('Isolated deployment required');
const ca = await readFile(
  'infrastructure/deployment/.runtime/marketplace-ca.crt',
);
const password = 'Container-check-' + randomUUID();
const email = 'container-admin-' + randomUUID() + '@example.invalid';
const env = { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
const admin = spawnSync(
  'docker',
  [
    '--host=unix:///var/run/docker.sock',
    'compose',
    '--env-file',
    envFile,
    '-f',
    'infrastructure/deployment/compose.yml',
    '-f',
    'infrastructure/deployment/.runtime/marketplace-test.yml',
    '--profile',
    'tools',
    'run',
    '--rm',
    '--no-deps',
    '-T',
    '--env',
    'ADMIN_EMAIL',
    '--env',
    'ADMIN_PASSWORD',
    'tools',
    'node',
    'scripts/create-admin.mjs',
  ],
  { env, encoding: 'utf8', timeout: 120000 },
);
assert.equal(admin.status, 0, 'Isolated admin provisioning succeeds');
let checks = 0;
async function call(
  path,
  { token, body, method, host = 'customer.localhost', headers = {} } = {},
  expected = 200,
) {
  const bytes =
    body === undefined
      ? undefined
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body));
  const response = await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: host,
        port: 19443,
        path,
        method: method ?? (bytes ? 'POST' : 'GET'),
        ca,
        lookup: (_host, options, cb) =>
          options.all
            ? cb(null, [{ address: '127.0.0.1', family: 4 }])
            : cb(null, '127.0.0.1', 4),
        headers: {
          'X-Convyn-Client': '1',
          ...(bytes
            ? {
                'Content-Type': 'application/json',
                'Content-Length': bytes.length,
              }
            : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...headers,
        },
      },
      (r) => {
        const chunks = [];
        r.on('data', (x) => chunks.push(x));
        r.on('end', () =>
          resolve({
            status: r.statusCode,
            headers: r.headers,
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(bytes);
  });
  assert.equal(
    response.status,
    expected,
    path + ' returned ' + response.status,
  );
  checks++;
  return response.headers['content-type']?.includes('application/json')
    ? JSON.parse(response.bytes)
    : response;
}
for (const host of [
  'customer.localhost',
  'provider.localhost',
  'admin.localhost',
  'business.localhost',
  'enterprise.localhost',
])
  await call('/v1/ready', { host });
await call('/requests/new');
await call('/provider/onboarding', { host: 'provider.localhost' });
await call('/admin', { host: 'admin.localhost' });
const a = (await call('/v1/auth/login', { body: { email, password } }, 201))
  .accessToken;
async function register(role) {
  return call(
    '/v1/marketplace/auth/register',
    {
      body: {
        email: role.toLowerCase() + '-' + randomUUID() + '@example.invalid',
        password,
        firstName: 'Container',
        lastName: 'Synthetic',
        mobile: '+27821234567',
        consent: true,
        role,
      },
    },
    201,
  );
}
const c = (await register('CUSTOMER')).accessToken,
  p = (await register('PROVIDER')).accessToken;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO1sAAAAASUVORK5CYII=',
  'base64',
);
const boundary = 'convyn-' + randomUUID();
const multipart = Buffer.concat([
  Buffer.from(
    '--' +
      boundary +
      '\r\nContent-Disposition: form-data; name="files"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n',
  ),
  png,
  Buffer.from('\r\n--' + boundary + '--\r\n'),
]);
const [file] = await call(
  '/v1/marketplace/files/requests',
  {
    token: c,
    body: multipart,
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
  },
  201,
);
assert.deepEqual(
  (await call('/v1/marketplace/files/' + file.id, { token: c })).bytes,
  png,
);
await call('/v1/marketplace/files/' + file.id, {}, 401);
const profile = await call(
  '/v1/marketplace/entities/ProviderProfile',
  {
    token: p,
    body: {
      display_name: 'Container plumber',
      bio: 'Synthetic local deployment validation profile.',
      category_slugs: ['plumbing'],
      city: 'Gqeberha',
      suburb: 'Central',
      latitude: -33.96,
      longitude: 25.6,
      service_radius_km: 30,
      verification_status: 'submitted',
      availability: 'offline',
    },
  },
  201,
);
await call(
  '/v1/marketplace/functions/reviewProviderVerification',
  {
    token: a,
    body: {
      provider_profile_id: profile.id,
      decision: 'approve',
      notes: 'Synthetic container validation only.',
    },
  },
  201,
);
const request = await call(
  '/v1/marketplace/entities/ServiceRequest',
  {
    token: c,
    body: {
      category_slug: 'plumbing',
      description: 'Repair a synthetic leaking pipe for container validation.',
      address: 'Synthetic address',
      city: 'Gqeberha',
      suburb: 'Central',
      latitude: -33.96,
      longitude: 25.6,
      customer_phone: '+27821234567',
      urgency: 'standard',
      status: 'open',
      attachments: [file.uri],
    },
  },
  201,
);
const bid = await call(
  '/v1/marketplace/functions/submitBid',
  {
    token: p,
    body: {
      request_id: request.id,
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
      comments: 'Synthetic quote.',
    },
  },
  201,
);
const { booking } = await call(
  '/v1/marketplace/functions/acceptBid',
  { token: c, body: { bid_id: bid.id } },
  201,
);
assert.equal(booking.commission_cents, 12120);
assert.equal(booking.payout_cents, 88881);
for (const next_status of ['en_route', 'arrived', 'in_progress', 'completed'])
  await call(
    '/v1/marketplace/functions/completeBooking',
    {
      token: p,
      body: { booking_id: booking.id, action: 'advance', status: next_status },
    },
    201,
  );
await call(
  '/v1/marketplace/functions/completeBooking',
  { token: c, body: { booking_id: booking.id, action: 'close' } },
  201,
);
await call(
  '/v1/marketplace/functions/createReview',
  {
    token: c,
    body: {
      booking_id: booking.id,
      rating: 5,
      comment: 'Synthetic successful container journey.',
    },
  },
  201,
);
const restarted = spawnSync(
  'docker',
  [
    '--host=unix:///var/run/docker.sock',
    'restart',
    'convyn_marketplace_test-api-1',
  ],
  { env, encoding: 'utf8', timeout: 30000 },
);
assert.equal(restarted.status, 0);
for (let i = 0; i < 60; i++) {
  try {
    await call('/v1/ready');
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
assert.deepEqual(
  (await call('/v1/marketplace/files/' + file.id, { token: c })).bytes,
  png,
);
console.log(
  `PASS: ${checks} certificate-verified HTTPS assertions, restricted database role, private upload persistence and full booking/review journey.`,
);
