import type { Page } from '@playwright/test';

/**
 * Open the board and wait for it to be still.
 *
 * Waiting for a card to exist is not enough. The entrance animation is staggered across the
 * first eight cards, so a tree or a rect read the instant they appear is a half-finished one -
 * this is the same mistake `scripts/motion-check.mjs` documents having made, reading a spine at
 * 4.9px and a palette at 0.82 opacity. Waiting on `getAnimations()` waits for the actual thing
 * rather than for a duration someone guessed.
 *
 * `toHaveScreenshot` does its own two-frame stability check on top of this. The wait still
 * belongs here, because the aria specs do not get that for free.
 *
 * @param query Harness query string: `?empty`, `?theme=light`, `?healthy`, or nothing.
 */
export async function openBoard(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
}

/** Every bookmark card on the board, in document order. */
export const cards = (page: Page) => page.locator('.content .project');
