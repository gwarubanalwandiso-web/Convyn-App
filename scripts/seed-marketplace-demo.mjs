import { Client } from 'pg';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO !== 'true')
  throw new Error(
    'Set SEED_DEMO=true for a local demonstration database only.',
  );
if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 16)
  throw new Error(
    'Set DEMO_PASSWORD to a private password of at least 16 characters.',
  );
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Demonstrations require local PostgreSQL');
url.pathname = '/' + (process.env.DEMO_DATABASE_NAME ?? 'convyn_demo');
if (!/_(demo|test)$/.test(url.pathname))
  throw new Error('Use a database ending in _demo or _test');
const owner = new URL(url);
owner.pathname = '/postgres';
const admin = new Client({ connectionString: owner.toString() });
await admin.connect();
try {
  if (
    !(
      await admin.query('SELECT FROM pg_database WHERE datname=$1', [
        url.pathname.slice(1),
      ])
    ).rowCount
  )
    await admin.query(
      'CREATE DATABASE "' + url.pathname.slice(1).replaceAll('"', '""') + '"',
    );
} finally {
  await admin.end();
}
const migration = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
  env: { ...process.env, DATABASE_URL: url.toString() },
  stdio: 'inherit',
});
if (migration.status !== 0) process.exit(migration.status ?? 1);
const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: {
    ...process.env,
    DATABASE_URL: url.toString(),
    PORT: '4023',
    SMTP_HOST: '',
    SMTP_FROM: '',
    OPENAI_API_KEY: '',
    APP_ORIGIN: 'http://localhost:5173',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const db = new Client({ connectionString: url.toString() });
await db.connect();
const base = 'http://127.0.0.1:4023/v1';
async function api(path, token, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ?? data.message ?? 'Demonstration operation failed',
    );
  return data;
}
try {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error('Demonstration API did not start');
    try {
      if ((await fetch(base + '/ready')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const password = process.env.DEMO_PASSWORD,
    encoded = await hash(password);
  const accounts = [
    ['admin', 'Demo', 'Administrator', 'ADMIN'],
    ['customer', 'Nandi', 'Mokoena', 'CUSTOMER'],
    ['plumber', 'Thabo', 'Dlamini', 'PROVIDER'],
    ['electrician', 'Nomsa', 'Jacobs', 'PROVIDER'],
    ['handyman', 'Coastal', 'Repairs', 'PROVIDER'],
  ];
  const users = {};
  for (const [key, first, last, role] of accounts) {
    const email = key + '@demo.example.invalid';
    await db.query(
      'INSERT INTO public."User"(id,email,"passwordHash","firstName","lastName",mobile,"consentAt",role) VALUES($1,$2,$3,$4,$5,\'+27800000000\',now(),$6) ON CONFLICT(email) DO NOTHING',
      [randomUUID(), email, encoded, first, last, role],
    );
    const auth = await api('/auth/login', null, { email, password });
    users[key] = auth;
  }
  const profiles = {};
  for (const [key, category, name] of [
    ['plumber', 'plumbing', 'Thabo Dlamini — demonstration'],
    ['electrician', 'electrical', 'Nomsa Jacobs — demonstration'],
    ['handyman', 'handyman', 'Coastal Repairs — demonstration'],
  ]) {
    const auth = users[key];
    let profile = (
      await api(
        '/marketplace/entities/ProviderProfile?mine=true',
        auth.accessToken,
      )
    )[0];
    if (!profile)
      profile = await api(
        '/marketplace/entities/ProviderProfile',
        auth.accessToken,
        {
          display_name: name,
          bio: 'Fictional demonstration profile. Not a real-world verified service listing.',
          category_slugs: [category],
          skills: [category],
          suburb: 'Central',
          city: 'Gqeberha',
          latitude: -33.96,
          longitude: 25.6,
          service_radius_km: 30,
          verification_status: 'submitted',
          availability: 'offline',
          emergency_available: true,
        },
      );
    if (profile.verification_status !== 'approved')
      profile = await api(
        '/marketplace/functions/reviewProviderVerification',
        users.admin.accessToken,
        {
          provider_profile_id: profile.id,
          decision: 'approve',
          notes:
            'Local demonstration only; this is not real-world verification.',
        },
      );
    profiles[key] = profile;
  }
  for (const [key, slug, description, target, callout, labour] of [
    [
      'plumber',
      'plumbing',
      'Demonstration: inspect a leaking kitchen pipe and replace the connection.',
      'confirmed',
      59000,
      42000,
    ],
    [
      'electrician',
      'electrical',
      'Demonstration: inspect a faulty light circuit and test the connection.',
      'in_progress',
      69000,
      48000,
    ],
    [
      'handyman',
      'handyman',
      'Demonstration: mount a small shelf and check the fixings securely.',
      'closed',
      39000,
      31000,
    ],
  ]) {
    if (
      (
        await db.query(
          'SELECT id FROM marketplace."ServiceRequest" WHERE created_by_id=$1 AND description=$2',
          [users.customer.user.id, description],
        )
      ).rowCount
    )
      continue;
    const request = await api(
      '/marketplace/entities/ServiceRequest',
      users.customer.accessToken,
      {
        category_slug: slug,
        description,
        address: 'Demonstration location',
        suburb: 'Central',
        city: 'Gqeberha',
        latitude: -33.96,
        longitude: 25.6,
        customer_phone: '+27800000000',
        urgency: 'standard',
        status: 'open',
      },
    );
    const bid = await api(
      '/marketplace/functions/submitBid',
      users[key].accessToken,
      {
        request_id: request.id,
        price_cents: callout + labour,
        callout_fee_cents: callout,
        labour_cents: labour,
        materials_cents: 0,
        travel_cents: 0,
        after_hours_cents: 0,
        eta_minutes: 30,
        duration_minutes: 60,
        warranty_days: 30,
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        comments: 'Demonstration quote with callout and one hour of labour.',
      },
    );
    await api('/marketplace/functions/scoreBids', users.customer.accessToken, {
      request_id: request.id,
    });
    const { booking } = await api(
      '/marketplace/functions/acceptBid',
      users.customer.accessToken,
      { bid_id: bid.id },
    );
    if (target !== 'confirmed')
      for (const status of target === 'closed'
        ? ['en_route', 'arrived', 'in_progress', 'completed']
        : ['en_route', 'arrived', 'in_progress'])
        await api(
          '/marketplace/functions/completeBooking',
          users[key].accessToken,
          { booking_id: booking.id, action: 'advance', status },
        );
    if (target === 'closed') {
      await api(
        '/marketplace/functions/completeBooking',
        users.customer.accessToken,
        { booking_id: booking.id, action: 'close' },
      );
      await api(
        '/marketplace/functions/createReview',
        users.customer.accessToken,
        {
          booking_id: booking.id,
          rating: 5,
          comment:
            'Demonstration review: clear communication and careful work.',
          tags: ['demonstration'],
        },
      );
    }
  }
  console.log(
    'Demonstration records created through the real marketplace functions. Database: ' +
      url.pathname.slice(1),
  );
  console.log(
    'Accounts: ' +
      accounts.map(([key]) => key + '@demo.example.invalid').join(', '),
  );
  console.log('Use your configured DEMO_PASSWORD. No password was printed.');
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => {});
  }
  await db.end();
}
