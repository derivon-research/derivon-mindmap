import { defineConfig } from '@playwright/test';

const port = Number(process.env.PERF_PORT ?? 4180);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './benchmarks',
  outputDir: 'test-results/performance',
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
  },
  webServer: {
    command: `npx vite build --config vite.performance.config.ts && npx vite preview --config vite.performance.config.ts --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
