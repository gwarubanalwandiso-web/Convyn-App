import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { authenticator } from 'otplib';
const envFile = resolve(
  process.env.CONVYN_DEPLOY_ENV ??
    'infrastructure/deployment/.runtime/test.env',
);
const config = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
assert.equal(
  config.COMPOSE_PROJECT_NAME,
  'convyn_deployment_test',
  'Synthetic deployment tests are restricted to their isolated stack',
);
const domains = ['customer', 'provider', 'admin', 'business', 'enterprise'];
for (const role of domains)
  assert.equal(config[role.toUpperCase() + '_DOMAIN'], role + '.localhost');
const cert = resolve('infrastructure/deployment/.runtime/local-ca.crt');
const temporary = mkdtempSync(join(tmpdir(), 'convyn-https-'));
let checks = 0;
const compose = [
  'compose',
  '--env-file',
  envFile,
  '-f',
  'infrastructure/deployment/compose.yml',
  '-f',
  'infrastructure/deployment/compose.local-test.yml',
];
function request(
  role,
  path,
  { token, body, method, raw = false } = {},
  expected = 200,
) {
  const index = checks++,
    host = role + '.localhost',
    file = join(temporary, index + '.response'),
    headers = join(temporary, index + '.headers');
  const args = [
    '--noproxy',
    '.localhost',
    '--resolve',
    `${host}:18443:127.0.0.1`,
    '--cacert',
    cert,
    '--silent',
    '--show-error',
    '--max-time',
    '30',
    '--request',
    method ?? (body === undefined ? 'GET' : 'POST'),
    '--output',
    file,
    '--dump-header',
    headers,
    '--write-out',
    '%{http_code}',
    '--config',
    '-',
    `https://${host}:18443${path}`,
  ];
  let input = 'header = "Content-Type: application/json"\n';
  if (token) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    input += `header = "Authorization: Bearer ${token}"\n`;
  }
  if (body !== undefined) {
    const bodyFile = join(temporary, index + '.body');
    writeFileSync(bodyFile, JSON.stringify(body), { mode: 0o600 });
    input += `data-binary = "@${bodyFile}"\n`;
  }
  const result = spawnSync('curl', args, { input, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    'Verified HTTPS request failed: ' + result.stderr,
  );
  assert.equal(Number(result.stdout), expected, `${role} ${path} status`);
  const bytes = readFileSync(file);
  return {
    value: raw ? bytes : JSON.parse(bytes.toString()),
    headers: readFileSync(headers, 'utf8'),
  };
}
try {
  for (const [role, heading] of domains.map((role) => [
    role,
    role === 'customer'
      ? 'Expert help'
      : role[0].toUpperCase() + role.slice(1) + ' workspace',
  ])) {
    const page = request(role, '/', { raw: true });
    assert.ok(page.value.toString().includes(heading));
    assert.equal(request(role, '/v1/ready').value.status, 'ready');
  }
  const password = 'Container-test-only-' + randomUUID(),
    suffix = randomUUID();
  const register = (role) =>
    request(
      role.toLowerCase(),
      '/v1/auth/register',
      {
        body: {
          role,
          firstName: 'Container',
          lastName: 'Synthetic',
          email: `${role.toLowerCase()}-${suffix}@example.invalid`,
          password,
          mobile: '+27821234567',
          consent: true,
        },
      },
      201,
    );
  const customer = register('CUSTOMER'),
    provider = register('PROVIDER');
  assert.match(customer.headers, /HttpOnly/i);
  assert.match(customer.headers, /; Secure/i);
  assert.match(customer.headers, /SameSite=Strict/i);
  const c = customer.value.accessToken,
    p = provider.value.accessToken;
  const mfaSecret = authenticator.generateSecret(20),
    adminEmail = `container-admin-${suffix}@example.invalid`;
  const provision = spawnSync(
    'docker',
    [
      ...compose,
      '--profile',
      'tools',
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'ADMIN_EMAIL',
      '-e',
      'ADMIN_PASSWORD',
      '-e',
      'ADMIN_MFA_SECRET',
      'tools',
      'node',
      'scripts/create-admin.mjs',
    ],
    {
      env: {
        ...process.env,
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: password,
        ADMIN_MFA_SECRET: mfaSecret,
      },
      encoding: 'utf8',
    },
  );
  assert.equal(
    provision.status,
    0,
    'Isolated administrator provisioning failed: ' + provision.stderr,
  );
  const admin = request(
    'admin',
    '/v1/auth/login',
    {
      body: {
        email: adminEmail,
        password,
        code: authenticator.generate(mfaSecret),
      },
    },
    201,
  ).value.accessToken;
  const category = request('customer', '/v1/categories', {
    token: c,
  }).value.find((row) => row.name === 'Plumbing');
  assert.ok(category);
  const profile = request(
    'provider',
    '/v1/providers/verification',
    {
      token: p,
      body: {
        qualification:
          'Synthetic deployment qualification for local TLS tests only.',
        categories: [category.id],
        radiusKm: 30,
        latitude: -33.96,
        longitude: 25.6,
      },
    },
    201,
  ).value;
  request(
    'admin',
    '/v1/admin/verifications/' + profile.id,
    { token: admin, body: { status: 'APPROVED' } },
    201,
  );
  request('provider', '/v1/providers/availability', {
    token: p,
    method: 'PATCH',
    body: { available: true },
  });
  const service = request(
    'customer',
    '/v1/service-requests',
    {
      token: c,
      body: {
        categoryId: category.id,
        description: 'Container TLS verification leaking pipe service request.',
        latitude: -33.96,
        longitude: 25.6,
      },
    },
    201,
  ).value;
  assert.ok(
    request('provider', '/v1/opportunities', { token: p }).value.some(
      (row) => row.id === service.id,
    ),
  );
  const bid = request(
    'provider',
    '/v1/service-requests/' + service.id + '/bids',
    {
      token: p,
      body: {
        totalMinor: 25000,
        arrivalMinutes: 25,
        comment: 'Synthetic callout and labour quote.',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    },
    201,
  ).value;
  assert.equal(
    request('customer', '/v1/service-requests/' + service.id + '/bids', {
      token: c,
    }).value[0].id,
    bid.id,
  );
  assert.ok(
    request(
      'customer',
      '/v1/service-requests/' + service.id + '/recommendations',
      { token: c },
    ).value.providers.some((row) => row.id === profile.id),
  );
  const booking = request(
    'customer',
    '/v1/bids/' + bid.id + '/accept',
    { token: c, body: {} },
    201,
  ).value;
  request(
    'customer',
    '/v1/bookings/' + booking.id + '/messages',
    {
      token: c,
      body: {
        text: 'Message sent through the verified TLS reverse proxy.',
        clientId: randomUUID(),
      },
    },
    201,
  );
  assert.equal(
    request('provider', '/v1/bookings/' + booking.id + '/messages', {
      token: p,
    }).value.length,
    1,
  );
  for (const status of [
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'AWAITING_CONFIRMATION',
  ])
    request(
      'provider',
      '/v1/bookings/' + booking.id + '/status',
      {
        token: p,
        body: {
          status,
          ...(status === 'AWAITING_CONFIRMATION'
            ? {
                completionNote:
                  'Synthetic container fulfilment verification completed.',
              }
            : {}),
        },
      },
      201,
    );
  request(
    'customer',
    '/v1/bookings/' + booking.id + '/status',
    { token: c, body: { status: 'COMPLETED' } },
    201,
  );
  request(
    'customer',
    '/v1/bookings/' + booking.id + '/reviews',
    {
      token: c,
      body: { rating: 5, comment: 'Synthetic TLS container test review.' },
    },
    201,
  );
  const invoice = request(
    'customer',
    '/v1/bookings/' + booking.id + '/invoice',
    { token: c, body: {} },
    201,
  ).value;
  assert.equal(invoice.status, 'UNPAID');
  assert.equal(
    request('customer', '/v1/invoices/' + invoice.id + '/pdf', {
      token: c,
      raw: true,
    })
      .value.subarray(0, 5)
      .toString(),
    '%PDF-',
  );
  request('customer', '/v1/bookings', {}, 401);
  console.log(
    `PASS: ${checks} certificate-verified HTTPS assertions, all five portals, secure cookies, MFA and complete container marketplace journey`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
