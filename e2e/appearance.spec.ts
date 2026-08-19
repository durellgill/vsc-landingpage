import { expect, test } from '@playwright/test';
import { openBoard } from './board';

/**
 * Does the board still look the same?
 *
 * This is the only layer that catches a colour token drifting, spacing changing, or type
 * shifting - none of which an aria snapshot or a geometry assertion can see. It is also the
 * layer that is easiest to make meaningless, in two ways worth stating:
 *
 *   1. **Baselines are platform-specific.** Font rasterization differs between macOS and Linux,
 *      so a baseline generated on a laptop will never match a runner. `snapshotPathTemplate`
 *      carries `{platform}` so the two can coexist, and only the Linux set is generated and
 *      checked in the pinned container. See `npm run test:e2e:docker`.
 *   2. **Tolerance is not a dial to turn until the failure stops.** `maxDiffPixels` is 100 in
 *      `playwright.config.ts`. If a run fails, look at the diff image before touching it; the
 *      whole value of this file is that it fails when the page changes.
 *
 * `toHaveScreenshot` disables animations and hides the caret by default, and waits until two
 * consecutive screenshots agree before comparing, so a page still settling does not fail a run.
 */

// Tagged so CI can exclude it until Linux baselines exist. Everything else in `e2e/` is
// platform-independent and runs everywhere.
test.describe('appearance @visual', () => {
  test('the default board', async ({ page }) => {
    await openBoard(page);
    await expect(page).toHaveScreenshot('board-default.png');
  });

  test('the light theme', async ({ page }) => {
    await openBoard(page, '?theme=light');
    await expect(page).toHaveScreenshot('board-light.png');
  });

  test('the empty board', async ({ page }) => {
    await openBoard(page, '?empty');
    await expect(page).toHaveScreenshot('board-empty.png');
  });

  test('a focused card draws a closed ring', async ({ page }) => {
    await openBoard(page);

    // D019, as pixels rather than geometry. The bug this replaces drew two horizontal strokes
    // with no ends, which a rect assertion can describe but a reviewer cannot picture. Scoped to
    // the one card so the rest of the board's churn cannot mask it.
    const card = page.locator('.content .project').nth(1);
    await card.focus();

    await expect(card).toHaveScreenshot('card-focused.png');
  });

  test('a group in grid layout', async ({ page }) => {
    await openBoard(page);

    // The first grid card is the one flush with the container's left edge, which is where the
    // D019 clipping showed up in grid rather than list.
    await expect(page.locator('.projects.grid').first()).toHaveScreenshot('group-grid.png');
  });
});
