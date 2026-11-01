import 'dotenv/config';
import { defineConfig } from '@playwright/test';
const db = new URL(process.env.DATABASE_URL!);
db.pathname = '/convyn_contract_test';
export default defineConfig({
  testDir: 'tests/marketplace-e2e',
  outputDir: 'test-results/marketplace',
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://localhost:4173',
    timezoneId: 'Africa/Johannesburg',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath:
        process.env.USE_PLAYWRIGHT_BROWSER === '1'
          ? undefined
          : process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    },
  },
  webServer: [
    {
      command: 'node --env-file=.env apps/api/dist/main.js',
      url: 'http://127.0.0.1:4022/v1/ready',
      env: {
        PORT: '4022',
        DATABASE_URL: db.toString(),
        WEB_ORIGINS: 'http://localhost:4173',
        FILE_UPLOAD_ROOT: '.runtime/marketplace-browser-uploads',
      },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @convyn/marketplace-web preview',
      url: 'http://localhost:4173',
      env: { CONVYN_API_TARGET: 'http://127.0.0.1:4022' },
      reuseExistingServer: false,
    },
  ],
});
