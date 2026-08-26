import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level ground truth for the page.
 *
 * These specs drive the real webview through the demo, which serves the identical HTML the
 * extension inlines against a stubbed host (see `scripts/demo.mjs`). They cover what the
 * extension-host suite structurally cannot reach: accessible names, geometry, focus, drag, and
 * appearance. The layering is D016; the choice of Playwright over `agent-browser` is D020.
 *
 * Specs live in `e2e/` rather than beside a module, because a whole-page behaviour has no single
 * module to sit next to. Colocation still holds for unit tests, which is what D016 is about.
 */
export default defineConfig({
  testDir: './e2e',

  // The demo builds both bundles before it serves, so this one command covers compile and
  // serve. `reuseExistingServer` locally means an already-running demo is used as-is, which
  // keeps the loop fast; on CI it is always started fresh so a stale server cannot be inherited.
  webServer: {
    command: 'npm run demo',
    url: 'http://localhost:5599/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe'
  },

  use: {
    baseURL: 'http://localhost:5599/',

    // Fixed, because a baseline measured at a floating size means nothing. This is also the
    // size the committed screenshots in `doc/img` were taken at.
    viewport: { width: 1440, height: 640 },

    // Kept only for failures: a trace is a few hundred KB and there is no reason to write one
    // for a run that passed.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },

  // Chromium only. The product renders inside an Electron webview, so a Firefox or WebKit run
  // would prove something about a browser this page is never loaded in.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Both templates carry `{platform}`. Font rasterization differs between macOS and Linux, so a
  // baseline generated on a laptop will not match a runner - namespacing them means the two can
  // coexist instead of overwriting each other. Pixel baselines are still generated only in the
  // pinned container; see TODO.md.
  expect: {
    toHaveScreenshot: {
      // Zero, not a comfortable-sounding default. The first version of this config allowed 100
      // differing pixels, and a deliberate shade-token change slipped through green to blue
      // without failing a single spec: this board draws its accents as a 4px by 20px capsule
      // (D017), so the entire accent mark is 80 pixels - smaller than the tolerance meant to
      // protect it. On a page whose visual system is small marks, any tolerance worth the name
      // is smaller than a mark.
      maxDiffPixels: 0,
      pathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}'
    },
    toMatchAriaSnapshot: {
      // No `{platform}`: an accessibility tree is text and is identical everywhere, which is
      // exactly why these are the baselines that can be generated on any machine.
      pathTemplate: '{testDir}/__aria__/{arg}{ext}'
    }
  },

  // A retry masks a flaky test locally, where the right response is to fix it. On CI one retry
  // separates a real failure from infrastructure noise without hiding a genuinely flaky spec,
  // because the report still marks it flaky rather than passed.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']]
});
