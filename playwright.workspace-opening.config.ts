import { defineConfig } from '@playwright/test';

const port = Number(process.env.PERF_PORT ?? 4186);
export default defineConfig({
  testDir: './benchmarks',
  testMatch: 'workspace-opening.spec.ts',
  timeout: 300_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: process.env.PERF_BROWSER === 'webkit' ? 'webkit' : 'chromium' },
  webServer: {
    command: `npm run build:desktop && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
