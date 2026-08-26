import { expect, test } from '@playwright/test';
import { cards, expectConfirmationArms, menuItem, openBoard, openCardMenu } from './board';

/**
 * Reduced motion downgrades entrances to opacity rather than switching them off.
 *
 * "No animation anywhere may carry a transform" is the rule this used to state, and it was wrong
 * in a way that stayed hidden. `landingpage-spin` is exempt by design - the stylesheet says so
 * where the exemption is written - because a busy spinner is the only thing telling the user a
 * round trip is still in flight, and it has no static equivalent. It is a rotation, so it does
 * carry a transform. The old blanket assertion passed only because a resting page has no spinner
 * running, which meant the check agreed with the stylesheet by luck. The first person to sweep a
 * busy page would have been told the spinner was a regression.
 *
 * So the rule is stated with its exemption, and the exemption is *tested* rather than merely
 * tolerated: the spinner is armed on purpose below and asserted to still be moving.
 *
 * The original script forced the media state on a browser session that outlived the process, so
 * it needed a `try/finally` to restore it - and said that a leaked override did not look leaked,
 * it looked like four genuine motion regressions. Playwright scopes this to the context, so the
 * restore, and that entire failure mode, no longer exist.
 */
// Through `contextOptions`, not `emulateMedia`: this has to be in force before the first
// paint, or the board's own entrance runs at full motion and the sweep below measures nothing.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

/** Every animation currently running, and whether it moves anything. */
const runningAnimations = (page: import('@playwright/test').Page) => page.evaluate(() =>
  document.getAnimations().map(animation => {
    let frames: Keyframe[] = [];
    try { frames = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? []; } catch { /* unreadable */ }
    return {
      name: (animation as unknown as { animationName?: string }).animationName ?? '(waapi)',
      moves: frames.some(f => f.transform !== undefined || f.scale !== undefined || f.translate !== undefined)
    };
  }));

test('no entrance carries a transform, and the busy spinner still turns', async ({ page }) => {
  await openBoard(page);

  const seen: { name: string; moves: boolean }[] = [];
  const sweep = async () => seen.push(...await runningAnimations(page));

  // Three surfaces, each with an entrance: the action menu, the palette it opens, and the
  // spinner. A sweep has to happen while they are still running, which is what the short waits
  // are for - `waitFor` returns as soon as the element attaches, which can be before the
  // animation has a keyframe to read.
  await openCardMenu(page);
  await page.waitForTimeout(30);
  await sweep();

  await menuItem(page, 'Accent color').click();
  await page.locator('.palette').waitFor();
  await page.waitForTimeout(30);
  await sweep();

  // The busy spinner, armed deliberately. It is the one animation the stylesheet keeps running
  // under reduced motion, so it has to be on the page for the exemption to mean anything - and
  // `data-busy` is what the refresh control sets while it waits for the host.
  await page.locator('[data-role="refresh"]').first().evaluate(b => b.setAttribute('data-busy', 'yes'));
  await page.waitForTimeout(30);
  await sweep();

  expect(seen.length, 'no animations ran at all, so this proves nothing').toBeGreaterThan(0);

  // Exempt by name, not by "anything still moving is probably fine". A new transform-carrying
  // animation must fail this; only the one the stylesheet documents may pass it.
  const EXEMPT = ['landingpage-spin'];
  const moving = seen.filter(a => a.moves && !EXEMPT.includes(a.name));
  expect(moving.map(a => a.name), 'an entrance still carries a transform under reduced motion').toEqual([]);

  // The other half of the same rule, and the half that has no other guard: reduced motion must
  // not switch the spinner off. Nothing else on the page reports that work is still running.
  const spinner = seen.filter(a => a.name === 'landingpage-spin');
  expect(spinner.length, 'the busy spinner was switched off by reduced motion').toBeGreaterThan(0);
  expect(spinner.every(a => a.moves), 'the busy spinner is present but no longer rotates').toBe(true);
});

test('the confirmation is a safeguard, not an animation, and survives', async ({ page }) => {
  await openBoard(page);
  await cards(page).first().waitFor();
  await expectConfirmationArms(page);
});
