import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hash } from '@node-rs/argon2';
const dbUrl = new URL(process.env.DATABASE_URL!);
dbUrl.pathname = '/convyn_contract_test';
const db = new Client({ connectionString: dbUrl.toString() });
const suffix = randomUUID(),
  password = 'Browser-contract-' + suffix,
  adminEmail = 'ui-admin-' + suffix + '@example.invalid',
  providerName = 'Provider ' + suffix;
let requestPath = '';
const categoryIds: string[] = [];
test.beforeAll(async () => {
  await db.connect();
  await db.query(
    'INSERT INTO public."User"(id,email,"passwordHash","firstName","lastName",mobile,"consentAt",role) VALUES($1,$2,$3,\'Browser\',\'Administrator\',\'+27821234567\',now(),\'ADMIN\')',
    [randomUUID(), adminEmail, await hash(password)],
  );
});
test.afterAll(async () => {
  for (const id of categoryIds)
    await db.query('DELETE FROM marketplace."ServiceCategory" WHERE id=$1', [
      id,
    ]);
  await db.end();
});
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function register(page: Page, kind: string) {
  await page.goto('/register');
  await page.getByLabel('First name', { exact: true }).fill(kind);
  await page.getByLabel('Last name', { exact: true }).fill(suffix);
  await page.getByLabel('Mobile (+27…)', { exact: true }).fill('+27821234567');
  await page
    .getByLabel('Account type')
    .selectOption(kind === 'provider' ? 'PROVIDER' : 'CUSTOMER');
  await page
    .getByLabel('Email', { exact: true })
    .fill(kind + '-' + suffix + '@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Create your account', exact: true })
    .click();
}

test('public routes retain CONVYN branding at mobile, tablet and desktop sizes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const route of [
    '/',
    '/providers',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/missing-page',
  ]) {
    await page.goto(route);
    await expect(page).toHaveTitle('CONVYN');
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route + ' ' + width,
      ).toBe(true);
      expect(
        await page
          .locator('body')
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toContain('Lato');
      if (route === '/' && width === 1440)
        await page.screenshot({ path: info.outputPath('home-desktop.png') });
    }
  }
  expect(errors).toEqual([]);
});

test('customer registration, four-step wizard, provider quote, atomic booking and review work end to end', async ({
  browser,
}, info) => {
  const customer = await browser.newPage(),
    provider = await browser.newPage(),
    admin = await browser.newPage();
  const errors: string[] = [];
  for (const page of [customer, provider, admin])
    page.on('pageerror', (e) => errors.push(e.message));
  await register(customer, 'customer');
  await expect(
    customer.getByRole('heading', { name: 'Your next move, handled.' }),
  ).toBeVisible();
  await customer.goto('/requests/new');
  await customer.getByRole('button', { name: /Plumbing/ }).click();
  await customer.getByRole('button', { name: 'Continue', exact: true }).click();
  await customer
    .getByLabel('Description', { exact: true })
    .fill('Repair a leaking kitchen pipe with clear quote details. ' + suffix);
  await customer.getByRole('button', { name: 'Continue', exact: true }).click();
  await customer
    .getByLabel('Address', { exact: true })
    .fill('Synthetic browser test address');
  await customer.getByLabel('Suburb', { exact: true }).fill('Central');
  await customer
    .getByLabel('Contact number', { exact: true })
    .fill('+27821234567');
  await customer
    .getByLabel('Budget guidance (R, optional)', { exact: true })
    .fill('1500');
  await customer.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    customer.getByRole('group', { name: 'Review your request' }),
  ).toBeVisible();
  await customer
    .getByRole('button', { name: 'Publish request', exact: true })
    .click();
  await expect(customer).toHaveURL(/\/requests\/[a-f0-9-]+/);
  requestPath = new URL(customer.url()).pathname;
  await expect(customer.getByText('open', { exact: true })).toBeVisible();
  await register(provider, 'provider');
  await expect(
    provider.getByRole('heading', { name: 'Make your experience count.' }),
  ).toBeVisible();
  await provider.getByLabel('Display name', { exact: true }).fill(providerName);
  await provider
    .getByLabel('About your work', { exact: true })
    .fill(
      'Demonstration provider profile for local browser acceptance testing.',
    );
  await provider.getByLabel('Plumbing', { exact: true }).check();
  await provider.getByLabel('Suburb', { exact: true }).fill('Central');
  await provider.getByLabel('Hourly rate (R)', { exact: true }).fill('420');
  await provider.getByLabel('Callout fee (R)', { exact: true }).fill('590');
  await provider
    .getByRole('button', { name: 'Submit verification', exact: true })
    .click();
  await expect(
    provider.getByText('Verification submitted.', { exact: false }),
  ).toBeVisible();
  await login(admin, adminEmail);
  await admin.getByRole('tab', { name: 'Providers', exact: true }).click();
  const card = admin.locator('article').filter({
    has: admin.getByRole('heading', { name: providerName, exact: true }),
  });
  await card
    .getByLabel('Review notes', { exact: true })
    .fill('Reviewed this synthetic browser-test submission.');
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);
  await provider.goto('/provider');
  const opportunity = provider.locator('article').filter({
    has: provider.getByRole('heading', {
      name: 'Repair a leaking kitchen pipe with clear quote details. ' + suffix,
      exact: true,
    }),
  });
  await opportunity.getByText('Prepare a quote', { exact: true }).click();
  await opportunity.getByLabel('Labour (R)', { exact: true }).fill('420.01');
  await opportunity
    .getByRole('button', { name: 'Submit quote', exact: true })
    .click();
  await expect(opportunity).toHaveCount(0);
  await customer.goto(requestPath);
  const quote = customer.locator('.quote-card');
  await expect(quote.getByText('R 1 010.01', { exact: true })).toBeVisible();
  await expect(quote.locator('.quote-score')).toBeVisible();
  await quote
    .getByRole('button', { name: 'Accept quote', exact: true })
    .click();
  await expect(customer.getByRole('dialog')).toContainText('R 1 010.01');
  await customer
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(
    customer.getByRole('link', { name: 'View booking', exact: true }),
  ).toBeVisible();
  await provider.goto('/bookings');
  for (const status of ['en route', 'arrived', 'in progress', 'completed']) {
    await provider
      .getByRole('button', { name: 'Mark ' + status, exact: true })
      .click();
  }
  await customer.goto('/bookings');
  await customer
    .getByRole('button', { name: 'Confirm completion', exact: true })
    .click();
  await customer
    .getByLabel('Your review', { exact: true })
    .fill('The work was completed carefully with clear communication.');
  await customer
    .getByRole('button', { name: 'Submit review', exact: true })
    .click();
  await expect(
    customer.getByText('Customer review recorded: 5 / 5.'),
  ).toBeVisible();
  await provider.goto('/provider');
  await provider.getByRole('tab', { name: 'Earnings', exact: true }).click();
  await expect(provider.getByText('R 1 010.01', { exact: true })).toBeVisible();
  await expect(provider.getByText('R 121.20', { exact: true })).toBeVisible();
  await expect(provider.getByText('R 888.81', { exact: true })).toBeVisible();
  for (const page of [customer, provider]) {
    await page.setViewportSize({ width: 375, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await customer.goto('/admin');
  await expect(
    customer.getByRole('heading', { name: 'Administrator access required' }),
  ).toBeVisible();
  await provider.screenshot({ path: info.outputPath('provider-mobile.png') });
  expect(errors).toEqual([]);
  await Promise.all([customer.close(), provider.close(), admin.close()]);
});

test('admin tabs stay responsive and service changes appear on home and in the wizard', async ({
  page,
}, info) => {
  await login(page, adminEmail);
  for (const name of [
    'Overview',
    'Requests',
    'Bookings',
    'Providers',
    'Services',
    'Reviews',
    'People',
    'Messages',
    'Audit log',
    'Account',
    'Rules & fees',
  ]) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(
      page.getByRole('tabpanel', { name, exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await page.getByRole('tab', { name: 'Services', exact: true }).click();
  const name = 'Synthetic service ' + suffix,
    slug = 'synthetic-' + suffix;
  await page.getByLabel('Service name', { exact: true }).fill(name);
  await page.getByLabel('Slug', { exact: true }).fill(slug);
  await page.getByLabel('Callout fee (R)', { exact: true }).fill('250');
  await page.getByLabel('Hourly rate (R)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Save service', exact: true }).click();
  await expect(
    page.getByText('Service saved.', { exact: false }),
  ).toBeVisible();
  const rows = await db.query(
    'SELECT id FROM marketplace."ServiceCategory" WHERE slug=$1',
    [slug],
  );
  categoryIds.push(rows.rows[0].id);
  await page.goto('/');
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto('/requests/new');
  await expect(
    page.getByRole('button', { name: new RegExp(name) }),
  ).toBeVisible();
  await page.goto('/admin');
  await page.screenshot({ path: info.outputPath('admin-desktop.png') });
});
