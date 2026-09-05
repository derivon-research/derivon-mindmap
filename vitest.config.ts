import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.browser.test.{ts,tsx}'],
        },
      },
      {
        // Do not inherit the application's entry scanning or host composition.
        plugins: [react()],
        test: {
          name: 'browser',
          // Measure canvas budgets without competing with CPU-heavy Node layout tests.
          sequence: { groupOrder: 1 },
          // The worker-search corpus and canvas budgets must not compete for CPU.
          fileParallelism: false,
          include: ['src/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            commands: {
              async dragPointer({ page, iframe }, selector: string, from: { x: number; y: number }, to: { x: number; y: number }) {
                const bounds = await iframe.locator(selector).boundingBox();
                if (!bounds) throw new Error(`Missing pointer target: ${selector}`);
                await page.mouse.move(bounds.x + from.x, bounds.y + from.y);
                await page.mouse.down();
                await page.mouse.move(bounds.x + to.x, bounds.y + to.y, { steps: 10 });
                await page.mouse.up();
              },
            },
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
