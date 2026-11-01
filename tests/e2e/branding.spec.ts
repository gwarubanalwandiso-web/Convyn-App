import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';

const databaseUrl = new URL(process.env.DATABASE_URL!);
databaseUrl.pathname = '/convyn_test';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.toString() }),
});
const portals = [
  'customer',
  'provider',
  'admin',
  'business',
  'enterprise',
] as const;
const created: string[] = [];
test.afterAll(async () => {
  await db.providerProfile.deleteMany({ where: { userId: { in: created } } });
  await db.user.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

test('all public portals preserve monochrome, accessible responsive account access', async ({
  page,
}, testInfo) => {
  for (const [index, portal] of portals.entries()) {
    await page.goto(`http://localhost:${3000 + index}`);
    await expect(page).toHaveTitle(/CONVYN/);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator('input[name="email"]')
          .first()
          .evaluate((el) => getComputedStyle(el).borderRadius),
      ).toBe('0px');
      expect(
        await page
          .locator('body')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe('rgb(255, 255, 255)');
      const family = await page
        .locator('body')
        .evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family.toLowerCase()).toContain('lato');
      expect(
        await page.evaluate(() =>
          [...document.images].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
        ),
      ).toBe(true);
      if (portal === 'customer' && width !== 768)
        await page.screenshot({
          path: testInfo.outputPath(`customer-auth-${width}.png`),
        });
    }
    await page.goto(`http://localhost:${3000 + index}`);
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Skip to account access' }),
    ).toBeFocused();
    const missing = await page.goto(
      `http://localhost:${3000 + index}/missing-brand-review`,
    );
    expect(missing?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Let’s get you back on track.' }),
    ).toBeVisible();
  }
});

test('all authenticated portals retain navigation and fit mobile and desktop', async ({
  page,
}, testInfo) => {
  const password = 'Synthetic-brand-review-' + randomUUID();
  const passwordHash = await hash(password);
  for (const [index, portal] of portals.entries()) {
    const email = `brand-${portal}-${randomUUID()}@example.invalid`;
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'Brand review',
        lastName: 'Synthetic',
        mobile: '+27820000000',
        consentAt: new Date(),
        role:
          portal === 'admin'
            ? 'ADMIN'
            : portal === 'provider'
              ? 'PROVIDER'
              : 'CUSTOMER',
        ...(portal === 'provider' ? { provider: { create: {} } } : {}),
      },
    });
    created.push(user.id);
    await page.goto(`http://localhost:${3000 + index}`);
    const login = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Sign in', exact: true }),
    });
    await login.getByLabel('Email', { exact: true }).fill(email);
    await login.getByLabel('Password', { exact: true }).fill(password);
    await login.getByRole('button', { name: 'Sign in', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
    await expect(nav).toBeVisible();
    await expect(page.locator('.metrics-strip').first()).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const link of await nav.getByRole('link').all()) {
        const href = await link.getAttribute('href');
        expect(
          await page.locator(href!).count(),
          `Missing target ${portal} ${href}`,
        ).toBe(1);
      }
      await nav.getByRole('link', { name: 'Help & support' }).click();
      await expect(
        nav.getByRole('link', { name: 'Help & support' }),
      ).toHaveAttribute('aria-current', 'location');
      if (portal === 'admin' && width !== 768) {
        await nav.getByRole('link', { name: 'Overview' }).click();
        await page.screenshot({
          path: testInfo.outputPath(`admin-workspace-${width}.png`),
        });
      }
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Sign in', exact: true }),
    ).toBeVisible();
  }
});
