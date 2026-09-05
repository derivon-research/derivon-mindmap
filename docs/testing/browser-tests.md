# Browser module tests

`npm test` runs two Vitest projects, then the initial JavaScript budget checker's tests:

- `node`: existing `src/**/*.test.ts` and `.test.tsx` files, excluding browser tests.
- `browser`: `src/**/*.browser.test.ts` and `.browser.test.tsx` files in headless Chromium,
  driven by `@vitest/browser-playwright`.

Install dependencies and the browser before the first run:

```sh
npm ci
npx playwright install chromium
npm test
```

On Linux CI, use `npx playwright install --with-deps chromium`. Every workflow calling
`npm test` installs Chromium first. Node and browser projects can also run independently:

```sh
npm run test:node
npm run test:browser
```

Configuration lives in `vitest.config.ts`. The Node project inherits the application's
Vite configuration. The browser project does not: it mounts the tested module directly,
without booting either application entry or scanning the legacy application's dependencies.
It uses real browser DOM and Canvas facilities, not jsdom or a fake renderer. Browser tests
import browser locators from `vitest/browser`.

`src/testing/browserHarness.browser.test.tsx` verifies isolated React mounting, real user
clicks, the single-mode top bar, and real G6 Canvas pixels. It is a harness smoke test, not
the rendering module's acceptance suite. Issue #45 adds that suite through the rendering
module's own interface, using the same browser project. No rendering interface or extra
adapter is introduced by this setup.

Each test must clean up mounted React roots, G6 instances, DOM containers and global stubs.
Keep fixed rendering dimensions for pixel checks; the presence of an empty Canvas element
is not evidence that the graph rendered. Vitest's polling assertions can wait for G6's
asynchronous paint without fixed sleeps.

These module tests complement the application-level Playwright workflows and performance
budgets; they do not replace them or require a separately running application dev server.
