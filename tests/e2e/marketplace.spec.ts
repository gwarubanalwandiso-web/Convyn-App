import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
const dbUrl = new URL(process.env.DATABASE_URL!);
dbUrl.pathname = '/convyn_test';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl.toString() }),
});
test.afterAll(() => db.$disconnect());
test('customer, provider and MFA administrator complete a real booking through the portals', async ({
  browser,
}) => {
  const suffix = randomUUID(),
    password = 'Browser-test-only-' + randomUUID();
  const customer = await browser.newPage(),
    provider = await browser.newPage(),
    admin = await browser.newPage();
  async function register(page: Page, role: string, port: number) {
    await page.goto(`http://localhost:${port}`);
    const form = page.locator('article').filter({
      has: page.getByRole('heading', { name: `Create ${role} account` }),
    });
    await form.getByLabel('First name').fill(role);
    await form.getByLabel('Last name').fill(suffix);
    await form
      .getByLabel('Email', { exact: true })
      .fill(`${role}-${suffix}@example.invalid`);
    await form.getByLabel('Mobile').fill('+27821234567');
    await form.getByLabel('Password').fill(password);
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByRole('heading', { name: `Welcome, ${role}` }),
    ).toBeVisible();
  }
  await register(customer, 'customer', 3000);
  await register(provider, 'provider', 3001);
  const qualification = provider.locator('article').filter({
    has: provider.getByRole('heading', { name: 'Provider verification' }),
  });
  await qualification
    .getByLabel('Qualification details')
    .fill('Synthetic qualification for browser integration verification.');
  await qualification
    .getByLabel('Category', { exact: true })
    .selectOption({ label: 'Plumbing' });
  await qualification
    .getByRole('button', { name: 'Submit for review' })
    .click();
  await expect(
    qualification.getByText('Status: SUBMITTED', { exact: true }),
  ).toBeVisible();
  const mfaSecret = authenticator.generateSecret();
  await db.user.create({
    data: {
      email: `admin-${suffix}@example.invalid`,
      passwordHash: await hash(password),
      firstName: 'Admin',
      lastName: suffix,
      mobile: '+27821234567',
      consentAt: new Date(),
      role: 'ADMIN',
      mfaSecret,
    },
  });
  await admin.goto('http://localhost:3002');
  await admin
    .getByLabel('Email', { exact: true })
    .fill(`admin-${suffix}@example.invalid`);
  await admin.getByLabel('Password', { exact: true }).fill(password);
  await admin
    .getByLabel('Authenticator code')
    .fill(authenticator.generate(mfaSecret));
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click();
  const verification = admin.locator('article').filter({
    has: admin.getByRole('heading', { name: `provider ${suffix}` }),
  });
  await expect(verification).toBeVisible();
  await verification
    .getByRole('button', { name: 'APPROVED', exact: true })
    .click();
  await expect(verification).toHaveCount(0);
  await provider.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    qualification.getByText('Status: APPROVED', { exact: true }),
  ).toBeVisible();
  await qualification
    .getByRole('button', { name: 'Go online', exact: true })
    .click();
  await expect(provider.getByRole('status')).toHaveText('You are online');
  const request = customer.locator('article').filter({
    has: customer.getByRole('heading', { name: 'Request a service' }),
  });
  await request
    .getByLabel('Category', { exact: true })
    .selectOption({ label: 'Plumbing' });
  const description = 'Browser verified leaking pipe request ' + suffix;
  await request.getByLabel('Describe the work').fill(description);
  await request.getByRole('button', { name: 'Publish request' }).click();
  await expect(customer.getByRole('status')).toHaveText(
    'Service request published',
  );
  await provider.getByRole('button', { name: 'Refresh', exact: true }).click();
  const opportunity = provider
    .locator('article')
    .filter({ has: provider.getByRole('heading', { name: description }) });
  await opportunity.getByLabel('Total quote').fill('25000');
  await opportunity.getByLabel('Arrival in minutes').fill('25');
  await opportunity
    .getByLabel('Quote explanation')
    .fill('Callout and labour included for the repair.');
  await opportunity.getByRole('button', { name: 'Submit bid' }).click();
  await expect(provider.getByRole('status')).toHaveText(
    'Bid submitted, valid for one hour',
  );
  const customerRequest = customer
    .locator('article')
    .filter({ has: customer.getByRole('heading', { name: description }) });
  await customerRequest.getByRole('button', { name: 'Compare bids' }).click();
  await customer.getByRole('button', { name: 'Accept quotation' }).click();
  await expect(customer.getByRole('status')).toContainText('Booking created');
  for (let i = 0; i < 4; i++) {
    await provider
      .getByRole('button', { name: 'Refresh', exact: true })
      .click();
    const job = provider
      .locator('article')
      .filter({ has: provider.getByRole('heading', { name: description }) })
      .filter({ has: provider.getByRole('button', { name: 'Advance job' }) });
    if (i === 3)
      await job
        .getByLabel('Completion details')
        .fill('Repair completed and tested; ready for customer inspection.');
    await job.getByRole('button', { name: 'Advance job' }).click();
    await expect(provider.getByRole('main').getByRole('alert')).toBeEmpty();
    await expect(
      provider
        .locator('article')
        .filter({ has: provider.getByRole('heading', { name: description }) })
        .getByText(
          ['EN ROUTE', 'ARRIVED', 'IN PROGRESS', 'AWAITING CONFIRMATION'][i],
          { exact: true },
        ),
    ).toBeVisible();
  }
  await customer.getByRole('button', { name: 'Refresh', exact: true }).click();
  await customer.getByRole('button', { name: 'Confirm completion' }).click();
  await customer
    .getByLabel('Review', { exact: true })
    .fill('The repair is complete and everything works.');
  await customer.getByRole('button', { name: 'Submit review' }).click();
  await expect(customer.getByLabel('Review', { exact: true })).toHaveCount(0);
  await customer
    .getByRole('button', {
      name: 'Messages, tracking and support',
      exact: true,
    })
    .click();
  const tools = customer.locator('article').filter({
    has: customer.getByRole('button', { name: 'Close booking tools' }),
  });
  await tools
    .getByLabel('Message', { exact: true })
    .fill('Browser verified booking conversation ' + suffix);
  await tools
    .getByRole('button', { name: 'Send message', exact: true })
    .click();
  await expect(
    tools.getByText('Browser verified booking conversation ' + suffix, {
      exact: false,
    }),
  ).toBeVisible();
  const downloadEvent = customer.waitForEvent('download');
  await tools
    .getByRole('button', { name: 'Download unpaid service invoice' })
    .click();
  expect((await downloadEvent).suggestedFilename()).toBe('convyn-invoice.pdf');
  await customer
    .getByRole('button', { name: 'Support requests', exact: true })
    .click();
  const support = customer.locator('article').filter({
    has: customer.getByRole('heading', { name: 'Help and support' }),
  });
  const subject = 'Browser support ' + suffix;
  await support.getByLabel('Subject', { exact: true }).fill(subject);
  await support
    .getByLabel('How can we help?', { exact: true })
    .fill(
      'This synthetic support request checks the connected support workflow.',
    );
  await support.getByRole('button', { name: 'Submit support request' }).click();
  await expect(support.getByText(subject, { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Refresh operations' }).click();
  const ticket = admin.locator('article').filter({
    has: admin.getByRole('heading', { name: subject, exact: true }),
  });
  await ticket
    .getByLabel('Support response')
    .fill('The synthetic browser support request has been reviewed.');
  await ticket.locator('select[name="status"]').selectOption('RESOLVED');
  await ticket.getByRole('button', { name: 'Update support ticket' }).click();
  await expect(
    ticket.locator('p').filter({ hasText: /^RESOLVED$/ }),
  ).toBeVisible();
  await customer.close();
  await provider.close();
  await admin.close();
});

for (const [portal, port] of [
  ['business', 3003],
  ['enterprise', 3004],
] as const) {
  test(`${portal} portal persists organisation locations, cost centres, procurement approval and reports`, async ({
    page,
  }) => {
    const suffix = randomUUID(),
      password = 'Organisation-browser-' + randomUUID(),
      email = `${portal}-${suffix}@example.invalid`;
    await db.user.create({
      data: {
        email,
        passwordHash: await hash(password),
        firstName: 'Organisation',
        lastName: suffix,
        mobile: '+27821234567',
        consentAt: new Date(),
        role: 'CUSTOMER',
      },
    });
    await page.goto(`http://localhost:${port}`);
    const login = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Sign in', exact: true }),
    });
    await login.getByLabel('Email', { exact: true }).fill(email);
    await login.getByLabel('Password', { exact: true }).fill(password);
    await login.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome, Organisation' }),
    ).toBeVisible();
    const create = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: 'Create organisation',
        exact: true,
      }),
    });
    const organisation = 'Browser ' + portal + ' ' + suffix;
    await create.getByLabel('Organisation name').fill(organisation);
    await create
      .getByRole('button', { name: 'Create organisation', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: organisation, exact: true }),
    ).toBeVisible();
    const centre = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: 'Create cost centre',
        exact: true,
      }),
    });
    await centre.getByLabel('Cost centre code').fill('OPS');
    await centre.getByLabel('Cost centre name').fill('Operations');
    await centre
      .getByRole('button', { name: 'Create cost centre', exact: true })
      .click();
    const location = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: 'Add service location',
        exact: true,
      }),
    });
    await location.getByLabel('Location name').fill('Gqeberha office');
    await location
      .getByLabel('Street address')
      .fill('Synthetic 10 Browser Street, Gqeberha');
    await location
      .getByRole('button', { name: 'Add service location', exact: true })
      .click();
    const request = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: 'Create procurement request',
        exact: true,
      }),
    });
    await expect(request).toBeVisible();
    await request
      .locator('select[name="categoryId"]')
      .selectOption({ label: 'Plumbing' });
    const description = 'Browser procurement request ' + suffix;
    await request.getByLabel('Service description').fill(description);
    await request.getByLabel('Maximum approved quote').fill('20000');
    await request.getByLabel('Purchase order reference').fill('PO-BROWSER');
    await request.getByRole('button', { name: 'Submit for approval' }).click();
    const approval = page.locator('article').filter({
      has: page.getByRole('heading', { name: description, exact: true }),
    });
    await expect(approval).toContainText('PENDING');
    await approval
      .getByRole('button', { name: 'Approve request', exact: true })
      .click();
    await expect(approval).toContainText('APPROVED');
    await page
      .getByRole('button', { name: 'Load organisation report' })
      .click();
    await expect(
      page.getByRole('definition').filter({ hasText: '20000' }),
    ).toBeVisible();
  });
}
