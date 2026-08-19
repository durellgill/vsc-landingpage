import { expect, test } from '@playwright/test';
import { cards, expectConfirmationArms, menuItem, openBoard, openCardMenu, stillness } from './board';

/**
 * The action menu: what it costs to press, where it lands, and what it dims.
 *
 * All three were shipped bugs. Two of them destroyed a bookmark or stranded the only way to
 * cancel off screen, which is why the confirmation is treated as a safeguard rather than as an
 * animation everywhere else in this suite.
 */

/** Open the menu at an explicit viewport point, rather than over the card it belongs to. */
async function openMenuAt(page: import('@playwright/test').Page, at: 'card' | 'corner') {
  await cards(page).first().evaluate((card, where) => {
    const box = card.getBoundingClientRect();
    const point = where === 'corner'
      ? { clientX: innerWidth - 30, clientY: innerHeight - 20 }
      : { clientX: box.left + 40, clientY: box.top + 10 };
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, ...point }));
  }, at);
  await page.locator('.ctxmenu').waitFor();
}

test('the confirmation refuses a double-click and accepts a deliberate one', async ({ page }) => {
  // `Remove?` replaced `Remove` at identical coordinates, so the second half of a double-click
  // landed on the confirmation and destroyed a bookmark with the confirmation never seen. The
  // dwell is the safeguard: the same pixel must do nothing at 90ms and remove at 450ms.
  await openBoard(page);
  await expectConfirmationArms(page);
});

test.describe('opened at the pointer in the corner', () => {
  // Short on purpose: the menu has to be taller than the room left below the pointer, or there
  // is nothing to clamp and the test passes without exercising anything.
  test.use({ viewport: { width: 1280, height: 500 } });

  test('the menu lands on screen and stays there when it grows', async ({ page }) => {
    // The menu was placed at raw pointer coordinates and ran off the viewport; then, once
    // clamped on open, it grew back out of it when the confirmation row appeared, stranding
    // Cancel off screen. Both halves are one bug: clamping is not a thing you do once.
    await openBoard(page);
    await openMenuAt(page, 'corner');

    const onOpen = await page.locator('.ctxmenu').evaluate(menu => {
      const box = menu.getBoundingClientRect();
      return { left: box.left, top: box.top, right: innerWidth - box.right, bottom: innerHeight - box.bottom };
    });
    for (const [edge, room] of Object.entries(onOpen)) {
      expect(room, `the menu opened past the ${edge} edge of the viewport`).toBeGreaterThanOrEqual(0);
    }

    await menuItem(page, 'Remove').click();
    await menuItem(page, 'Cancel').waitFor();

    const onGrow = await page.locator('.ctxmenu').evaluate(menu => {
      const cancel = [...menu.querySelectorAll('button')].find(b => /Cancel/.test(b.textContent ?? ''))!;
      return {
        menu: innerHeight - menu.getBoundingClientRect().bottom,
        cancel: innerHeight - cancel.getBoundingClientRect().bottom
      };
    });
    expect(onGrow.menu, 'the confirmation row pushed the menu off screen').toBeGreaterThanOrEqual(0);
    expect(onGrow.cancel, 'Cancel was stranded off screen').toBeGreaterThanOrEqual(0);
  });
});

test('the scrim dims by colour, never by opacity', async ({ page }) => {
  // The page's most-repeated trap: alpha belongs in the colour, never in `opacity`, because
  // `opacity` on a parent creates a stacking context its children cannot climb out of. That
  // applies to the *animation* too - fading the scrim in via `opacity` would dim the palette for
  // the length of the fade, and a child `opacity: 1` cannot undo it.
  await openBoard(page);
  await openCardMenu(page);
  await menuItem(page, 'Accent colour').click();
  await page.locator('.palette').waitFor();

  // Read the entrance *while it is still running*. `getAnimations()` does not return a finished
  // animation that has no fill, so reading the keyframes after the page settles finds an empty
  // list - and `frames.some(...)` over an empty list is false however the scrim was built. That
  // is a clause that cannot fail, which is worse than no clause at all.
  await page.waitForFunction(() => !!document.querySelector('.modal')?.getAnimations().length);
  const animatesOpacity = await page.evaluate(() => {
    const running = document.querySelector('.modal')!.getAnimations();
    return running.some(a => {
      let frames: Keyframe[] = [];
      try { frames = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? []; } catch { /* unreadable */ }
      // A keyframe touching opacity is the regression this guards against.
      return frames.some(f => f.opacity !== undefined);
    });
  });

  await stillness(page);
  const dimming = await page.evaluate(() => ({
    scrim: getComputedStyle(document.querySelector<HTMLElement>('.modal')!).opacity,
    palette: getComputedStyle(document.querySelector<HTMLElement>('.palette')!).opacity
  }));

  expect(dimming.scrim, 'the scrim dims with `opacity`, which traps its children').toBe('1');
  expect(dimming.palette, 'the palette inherited the scrim\'s dimming').toBe('1');
  expect(animatesOpacity, 'the scrim fades in via `opacity`, which dims the palette for the length of the fade').toBe(false);
});
