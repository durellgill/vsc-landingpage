import { expect, test } from '@playwright/test';
import { cards, expectConfirmationArms, menuItem, openBoard, openCardMenu, postedCount, stillness } from './board';

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

test('the header opens the live demo through the host', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'View live demo' }).click();
  expect(await postedCount(page, 'openLiveDemo')).toBe(1);
});

test('the New menu leaves bookmark selection to a group', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'New' }).click();
  const menu = page.locator('.popover');
  await expect(menu.getByRole('button', { name: 'Group' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Folder on disk' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Bookmark a folder' })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Bookmark a file or workspace' })).toHaveCount(0);
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

test('the scrim dims by color, never by opacity', async ({ page }) => {
  // The page's most-repeated trap: alpha belongs in the color, never in `opacity`, because
  // `opacity` on a parent creates a stacking context its children cannot climb out of. That
  // applies to the *animation* too - fading the scrim in via `opacity` would dim the palette for
  // the length of the fade, and a child `opacity: 1` cannot undo it.
  await openBoard(page);
  await openCardMenu(page);
  await menuItem(page, 'Accent color').click();
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

/**
 * Keyboard containment, for the two shapes the menu takes that a focus trap built on a list
 * captured at open time gets wrong: a surface whose controls are replaced while it is up, and a
 * surface that has no controls at all.
 *
 * Both were observed failing before the trap was rewritten to read the control list per keypress.
 */
test.describe('focus containment', () => {
  /** What has focus, in the terms these checks care about. */
  const focused = (page: import('@playwright/test').Page) => page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim() ?? '',
    inHidden: !!document.activeElement?.closest('.hiddenrecents')
  }));

  test('Tab wraps onto the confirmation row that replaced the danger button', async ({ page }) => {
    // Arming `Remove` swaps one button for two, so the last control in the menu is no longer the
    // element it was when the menu opened. A trap holding the old one wraps to a detached node,
    // which focuses nothing and silently drops the keystroke.
    await openBoard(page);
    await openCardMenu(page);
    await menuItem(page, 'Remove').click();
    await expect(page.locator('.ctxmenu button[data-confirm]')).toBeVisible();

    await page.locator('.ctxmenu button').first().focus();
    await page.keyboard.press('Shift+Tab');
    expect((await focused(page)).text, 'Shift+Tab from the first item lands on Cancel, the control that is now last').toBe('Cancel');
  });

  test('a hidden-recents surface with nothing in it still holds focus', async ({ page }) => {
    // The default board's Recent group carries no `hidden` key at all, so this surface renders one
    // line of text and no controls. It is still a dialog, and Tab must not walk out of it onto the
    // page behind - from where Escape closes the whole action menu instead of just this surface.
    await openBoard(page);
    await page.locator('.group[data-guid="@vsc-mru"] .tools button[aria-label^="Settings for"]').click();
    await page.locator('.ctxmenu').waitFor();
    await page.locator('.ctxmenu button.ctxsubmenu').click();
    await page.locator('.hiddenrecents').waitFor();

    expect((await focused(page)).inHidden, 'opening the surface moves focus into it').toBe(true);
    await page.keyboard.press('Tab');
    expect((await focused(page)).inHidden, 'Tab has nowhere to go inside the surface, so it stays put').toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('.hiddenrecents')).toHaveCount(0);
    await expect(page.locator('.ctxmenu'), 'Escape closes only the surface, leaving the menu that opened it').toBeVisible();
    expect((await focused(page)).text, 'focus returns to the trigger').toContain('Hidden recents');
  });
});

/**
 * Opening the clone form puts the caret in the URL field, so a paste lands without a second click.
 * The field used to carry `autoFocus`, which did nothing here: Preact has no autofocus handling of
 * its own, it only sets the HTML attribute, and the browser declined to act on it for this popover.
 * It does fire for the rename row in `components.tsx`, so the attribute cannot be trusted either
 * way - a ref that focuses on mount is the only form that works in both places.
 */
test('the clone popover focuses its URL field when it opens', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Clone a repository' }).click();
  await expect(page.locator('.popover-clone input')).toBeFocused();
});

/**
 * Choosing Rename swaps the button for an input row, and the caret has to land in it. The focus
 * trap does not cover this - it is keyed off the picker, so it does not re-run for a swap inside
 * an already-open menu - and the field's `autoFocus` was doing the work by luck of browser
 * behaviour the clone popover did not get.
 */
test('the rename row focuses its input', async ({ page }) => {
  await openBoard(page);
  await openCardMenu(page);
  await menuItem(page, 'Rename').click();
  await expect(page.locator('.ctxrename input')).toBeFocused();
});

/**
 * The focus must happen once, when the row opens - not on every render. The menu re-renders for
 * things that have nothing to do with renaming, and a focus attached per render would fire on each
 * of them and drag the caret back out of whatever the user had tabbed to.
 */
test('a re-render while renaming does not drag focus back to the input', async ({ page }) => {
  await openBoard(page);
  await openCardMenu(page);
  await menuItem(page, 'Rename').click();
  await expect(page.locator('.ctxrename input')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
  // A host message the menu does not read, purely to make the tree render again.
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
    data: { command: 'bookmarkHealth', missing: [], branches: {} },
  })));
  await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
});

/**
 * Scrolling dismisses the anchored surfaces, which have no way to follow the point they were
 * opened against. Dismissing one must not strand the keyboard: focus goes back to whatever opened
 * it, exactly as closing it any other way would.
 */
test('scrolling closes the clone popover and returns focus to its trigger', async ({ page }) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Clone a repository' }).click();
  // Not cosmetic. The listener that closes on scroll is installed by an effect, which Preact
  // flushes a frame after the render that put the popover on screen. Scrolling before that frame
  // dispatched the event into nothing, and the test failed about half the time. The popover's
  // entrance animation spans those frames, so waiting it out is the honest wait.
  await stillness(page);
  await expect(page.locator('.popover-clone input')).toBeFocused();

  await page.evaluate(() => { document.scrollingElement!.scrollTop = 100; });
  await expect(page.locator('.popover-clone')).toHaveCount(0);
  const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(label, 'focus is on the trigger, not lost to `body`').toBe('Clone a repository');
});
