import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.WEB_E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    ...devices['Desktop Chrome'],
  },
  /* Fail fast with a clear signal when the app is not up. */
  webServer: undefined,
})
