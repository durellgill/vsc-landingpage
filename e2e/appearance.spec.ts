import { expect, test } from '@playwright/test';
import { openBoard } from './board';

/**
 * Does the board still look the same?
 *
 * This is the only layer that catches a color token drifting, spacing changing, or type
 * shifting - none of which an aria snapshot or a geometry assertion can see. It is also the
 * layer that is easiest to make meaningless, in two ways worth stating:
 *
 *   1. **Baselines are platform-specific.** Font rasterization differs between macOS and Linux,
 *      so a baseline generated on a laptop will never match a runner. `snapshotPathTemplate`
 *      carries `{platform}` so the two can coexist, and only the Linux set is generated and
 *      checked in the pinned container. See `npm run test:e2e:docker`.
 *   2. **Tolerance is not a dial to turn until the failure stops.** `maxDiffPixels` is 0 in
 *      `playwright.config.ts`, and that is not pedantry: it started at 100, and a deliberate
 *      shade-token change from green to blue passed every spec here without failing one. This
 *      board draws its accent as a 4px by 20px capsule (D017), so the whole mark is 80 pixels -
 *      the tolerance was larger than the thing it was meant to protect. If a run fails, look at
 *      the diff image before touching it; the whole value of this file is that it fails when
 *      the page changes.
 *
 * `toHaveScreenshot` disables animations and hides the caret by default, and waits until two
 * consecutive screenshots agree before comparing, so a page still settling does not fail a run.
 */

// Tagged so CI can exclude it until Linux baselines exist. Everything else in `e2e/` is
// platform-independent and runs everywhere.
test.describe('appearance @visual', () => {
  test('the empty board', async ({ page }) => {
    await openBoard(page, '?empty');
    await expect(page).toHaveScreenshot('board-empty.png');
  });
});
