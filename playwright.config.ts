import 'dotenv/config';
import { defineConfig } from '@playwright/test';
const db = new URL(process.env.DATABASE_URL!);
db.pathname = '/convyn_test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  use: {
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath:
        process.env.USE_PLAYWRIGHT_BROWSER === '1'
          ? undefined
          : (process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'),
    },
  },
  webServer: [
    {
      command: 'node --env-file=.env apps/api/dist/main.js',
      url: 'http://localhost:4000/v1/ready',
      env: { DATABASE_URL: db.toString() },
      reuseExistingServer: false,
    },
    ...['customer', 'provider', 'admin', 'business', 'enterprise'].map(
      (role, i) => ({
        command: `pnpm --filter @convyn/${role}-web exec next start -p ${3000 + i}`,
        url: `http://localhost:${3000 + i}`,
        reuseExistingServer: false,
      }),
    ),
  ],
});
