import { expect, type Page } from '@playwright/test';

/**
 * Open the board and wait for it to be still.
 *
 * Waiting for a card to exist is not enough. The entrance animation is staggered across the
 * first eight cards, so a tree or a rect read the instant they appear is a half-finished one -
 * a mistake this repo made twice, reading a spine at 4.9px and a palette at 0.82 opacity.
 * Waiting on `getAnimations()` waits for the actual thing rather than for a duration someone
 * guessed.
 *
 * `toHaveScreenshot` does its own two-frame stability check on top of this. The wait still
 * belongs here, because the aria and geometry specs do not get that for free.
 *
 * @param query Demo query string: `?empty`, `?theme=light`, `?healthy`, or nothing.
 */
export async function openBoard(page: Page, query = '') {
  await page.goto(`/${query}`);
  await stillness(page);
}

/**
 * Wait until nothing on the page is animating.
 *
 * Separate from {@link openBoard} because half the checks here arm an instrument, wait for the
 * board to go quiet, and only then act - so that what they record is attributable to the thing
 * they did rather than to an entrance that had not finished.
 */
export async function stillness(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
}

/** Every bookmark card on the board, in document order. */
export const cards = (page: Page) => page.locator('.content .project');

/** One FLIP flight, as recorded by {@link recordFlights}. */
export type Flight = {
  /** Which kind of element flew. A group carries its own cards, so both matter. */
  kind: 'project' | 'group';
  /** `data-guid` of the element itself. */
  guid: string | null;
  /**
   * `data-guid` of the enclosing `.group`, which is what "whose flight was this" means.
   * For a `.group` this is its own guid, since `closest` matches self.
   */
  owner: string | null;
  /** The first keyframe's transform, or null when the flight does not carry one. */
  transform: string | null;
  /** `performance.now()` when the flight started, for separating one wave from the next. */
  at: number;
};

declare global {
  interface Window {
    __flights?: Flight[];
    __pauseRecordedFlightsAt?: number;
  }
}

/**
 * Record every FLIP flight the board starts, by patching `Element.prototype.animate`.
 *
 * There is no other way to see this. A flight is a Web Animations call with a computed
 * transform, so it leaves nothing in the DOM to assert on and is over before a screenshot could
 * catch it - the assertion has to be "was this animation started, and from where", which means
 * intercepting the call.
 *
 * Four checks share this: an interrupted flight must keep its direction, a scroll must start no
 * flights, a resize must not make one group's layout switch fly another group's cards, and a
 * bookmark that appears twice must not fly its twin. They differ only in how they filter.
 *
 * Call {@link stillness} after this and before acting, or the board's own entrance lands in the
 * recording.
 */
export async function recordFlights(page: Page, pauseAtProgress?: number) {
  await page.evaluate((progress) => {
    window.__flights = [];
    window.__pauseRecordedFlightsAt = progress;
    const real = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, frames, options) {
      const kind = this.classList?.contains('project')
        ? 'project'
        : this.classList?.contains('group') ? 'group' : null;
      const first = Array.isArray(frames) ? (frames[0] as Keyframe | undefined) : undefined;
      const transform = first && first.transform !== undefined ? String(first.transform) : null;
      if (kind) {
        window.__flights?.push({
          kind,
          guid: this.getAttribute('data-guid'),
          owner: this.closest('.group')?.getAttribute('data-guid') ?? null,
          transform,
          at: performance.now()
        });
      }
      const animation = real.call(this, frames, options);
      if (kind && transform && window.__pauseRecordedFlightsAt !== undefined) {
        const duration = typeof options === 'number' ? options : options?.duration;
        if (typeof duration === 'number') {
          animation.pause();
          animation.currentTime = duration * window.__pauseRecordedFlightsAt;
        }
      }
      return animation;
    };
  }, pauseAtProgress);
}

/** Everything {@link recordFlights} has seen so far. */
export const flights = (page: Page) => page.evaluate(() => window.__flights ?? []);

/** Clear the recording without reinstalling the patch. */
export const clearFlights = (page: Page) => page.evaluate(() => { window.__flights = []; });

/** How many messages the page has posted to the host. The demo records these. */
export const postedCount = (page: Page, command?: string) => page.evaluate((only) => {
  const posted = (window as unknown as { __posted?: { command: string }[] }).__posted ?? [];
  return only ? posted.filter(m => m.command === only).length : posted.length;
}, command);

/** Open the action menu on a card by right-clicking it, and wait for the menu. */
export async function openCardMenu(page: Page, index = 0) {
  await cards(page).nth(index).click({ button: 'right' });
  await page.locator('.ctxmenu').waitFor();
}

/**
 * A button inside the open action menu, found by its accessible name.
 *
 * By name rather than by `textContent`, which for these buttons begins with the whitespace of
 * the icon that precedes the label - so `/^Remove$/` matches nothing at all. The accessible name
 * is what the browser computes and normalizes, and it is the thing a user is actually reading.
 */
export const menuItem = (page: Page, name: string) =>
  page.locator('.ctxmenu').getByRole('button', { name, exact: true });

/**
 * The confirmation refuses the second half of a double-click and accepts a deliberate press.
 *
 * Shared because it is asserted twice: once on the ordinary board, and once under reduced
 * motion. The dwell is a safeguard rather than an animation, so reduced motion may not take it
 * away - that exemption is written into the stylesheet and this is what holds it there.
 */
export async function expectConfirmationArms(page: Page) {
  await openCardMenu(page);
  const box = (await menuItem(page, 'Remove').boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const before = await postedCount(page);

  await menuItem(page, 'Remove').click();

  // The second half of a double-click, at the coordinates `Remove` occupied a moment ago.
  await page.waitForTimeout(90);
  await page.mouse.click(point.x, point.y);
  expect(await postedCount(page), 'a 90ms second click destroyed a bookmark').toBe(before);

  // The same pixel, pressed deliberately. 450ms from arming, as the original check measured.
  await page.waitForTimeout(360);
  await page.mouse.click(point.x, point.y);
  expect(await postedCount(page), 'a deliberate confirmation was refused').toBe(before + 1);
}
