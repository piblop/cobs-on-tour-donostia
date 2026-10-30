import { defineConfig, devices } from '@playwright/test';

/** Smoke tests run against a production build served under a repository-style subpath. */
export const SUBPATH = '/cobs-on-tour-donostia/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:4174${SUBPATH}`,
    viewport: { width: 1280, height: 760 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 760 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4174 --strictPort',
    url: `http://localhost:4174${SUBPATH}`,
    env: { BASE_PATH: SUBPATH },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
