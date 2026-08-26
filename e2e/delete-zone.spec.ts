import { expect, test, type Page } from '@playwright/test';
import { cards, openBoard, postedCount } from './board';

/**
 * The delete zone, which is armed by dwell (D014).
 *
 * Both tests here are drag bugs, and both are about the gap between what the zone *looked* like
 * and what the browser had actually recorded. That gap is invisible to a screenshot and to an
 * aria snapshot, and it is the reason these are driven by a real pointer.
 */

/** Pick up the first bookmark and carry it into the delete zone. Returns the zone's centre. */
async function carryFirstCardToTheZone(page: Page) {
  const card = (await cards(page).first().boundingBox())!;
  const from = { x: card.x + card.width / 2, y: card.y + card.height / 2 };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Chromium starts a native drag only after the pointer actually travels, and only if it gets
  // intermediate moves to travel through.
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 6 });
  await page.locator('.dropbin').waitFor();

  const zone = (await page.locator('.dropbin').boundingBox())!;
  const target = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.locator('.dropbin[data-over]').waitFor();
  return target;
}

test('a duration authored in milliseconds arms on the millisecond timescale', async ({ page }) => {
  await openBoard(page);
  await page.locator('.landingpage').evaluate(element => element.style.setProperty('--dur-arm', '40ms'));

  await carryFirstCardToTheZone(page);

  await expect(page.locator('.dropbin[data-armed]'), 'the millisecond dwell duration was treated as seconds').toBeAttached({ timeout: 500 });
  await expect(page.locator('.project.dragging'), 'the bookmark was released while checking the dwell').toBeAttached();
  expect(await postedCount(page, 'remove'), 'the dwell removed the bookmark without a release').toBe(0);
});

test('an early release is refused and an armed stationary release removes', async ({ page }) => {
  // The bug was a split verdict: the dwell timer changed the label to "Release to remove", while
  // the last `dragover` had already recorded `dropEffect: none`. Chromium then cancelled the
  // release without dispatching `drop` at all - so the zone said it would delete, and did not.
  //
  // Both halves are the safeguard. Releasing before the zone arms must do nothing; releasing
  // after it arms must remove, even though the pointer never moved again.
  await openBoard(page);

  await carryFirstCardToTheZone(page);
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(100);
  expect(await postedCount(page, 'remove'), 'releasing before the zone armed removed a bookmark').toBe(0);

  await openBoard(page);
  const zone = await carryFirstCardToTheZone(page);
  await page.locator('.dropbin[data-armed]').waitFor();

  // A low-level mouse release omits `dragend` when no movement preceded it, so the application's
  // fallback is what has to be exercised here. This is the stationary release the bug was about.
  await page.evaluate(point => {
    document.querySelector('.project.dragging')!.dispatchEvent(
      new DragEvent('dragend', { bubbles: true, clientX: point.x, clientY: point.y }));
  }, zone);
  await page.mouse.up();

  await page.waitForFunction(() =>
    ((window as unknown as { __posted?: { command: string }[] }).__posted ?? []).some(m => m.command === 'remove'));
  expect(await postedCount(page, 'remove'), 'an armed stationary release did not remove exactly once').toBe(1);
});

test('the zone wakes up again after the drag has left the webview', async ({ page }) => {
  // Carrying a bookmark off the page - over the terminal panel, or off the window - fires
  // `dragleave` on the zone and resets it, but Chromium keeps the zone as its current drop
  // target. Coming back over it resumes `dragover` with no `dragenter`, so a zone that woke only
  // on `dragenter` stayed dead for the rest of the drag: it never highlighted and never armed,
  // and the only way out was to drop and start again.
  //
  // The leave and the return are dispatched rather than mimed with the mouse, because that
  // asymmetry is the whole bug: a synthetic pointer move back into the zone would carry the
  // `dragenter` the real re-entry omits, and this would pass against the broken code.
  await openBoard(page);
  await carryFirstCardToTheZone(page);

  await page.evaluate(() => {
    document.querySelector('.dropbin')!.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null }));
  });
  await page.locator('.dropbin[data-over]').waitFor({ state: 'detached' });

  // `dragover` alone, repeated, is exactly what Chromium sends on the way back in.
  await page.evaluate(() => {
    const zone = document.querySelector('.dropbin')!;
    const box = zone.getBoundingClientRect();
    const resume = () => zone.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2
    }));
    (window as unknown as { __resume?: number }).__resume = setInterval(resume, 30) as unknown as number;
  });

  await expect(page.locator('.dropbin[data-over]'), 'the zone never highlighted again').toBeAttached();
  await expect(page.locator('.dropbin[data-armed]'), 'the zone highlighted but never armed again').toBeAttached();

  await page.evaluate(() => clearInterval((window as unknown as { __resume?: number }).__resume));
  await page.mouse.up();
});
