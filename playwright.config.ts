import { defineConfig } from '@playwright/test';

const webPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const desktopPort = Number(process.env.PLAYWRIGHT_DESKTOP_PORT ?? 4174);
const webBaseURL = `http://127.0.0.1:${webPort}`;
const desktopBaseURL = `http://127.0.0.1:${desktopPort}`;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  /**
   * These are eventual states — the application booted, the graph settled — not latency
   * budgets; those are measured by the separate performance configurations, alone on the
   * machine. Five seconds made the verdict depend on how loaded the machine was, because
   * the graph-heavy specs saturate every worker in parallel.
   */
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web',
      use: { baseURL: webBaseURL },
      testIgnore: '**/*.desktop.spec.ts',
    },
    {
      // The desktop host is a separate build, not a runtime flag, so it needs its own server.
      name: 'desktop',
      use: { baseURL: desktopBaseURL },
      testMatch: '**/*.desktop.spec.ts',
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort}`,
      url: webBaseURL,
      reuseExistingServer: true,
    },
    {
      command: `npm run dev:desktop -- --host 127.0.0.1 --port ${desktopPort}`,
      url: desktopBaseURL,
      reuseExistingServer: true,
    },
  ],
});
