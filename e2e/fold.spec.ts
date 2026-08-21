import { expect, test } from '@playwright/test';
import { openBoard } from './board';

/**
 * The two halves of a fold finish together.
 *
 * The chevron rotation and the group's height are one gesture expressed twice, and they are
 * timed from the same token for that reason. When they drifted apart the arrow settled early and
 * sat there while the group was still closing.
 *
 * The original check asserted `|chevron - height| <= 40ms`, and said so itself: a hand-tuned
 * millisecond tolerance made it the most flake-prone check in the file. What the bug actually
 * was is an *ordering* - the arrow finished first - so that is what this asserts. The only slack
 * is one animation frame, which is sampling noise rather than a tuned number.
 */

/** One rendered frame at 60Hz, the resolution this can possibly measure at. */
const FRAME = 17;

test('the chevron does not settle before the group has finished folding', async ({ page }) => {
  await openBoard(page);

  const settled = await page.evaluate(async () => {
    const group = document.querySelector<HTMLElement>('.group')!;
    const chevron = group.querySelector<HTMLElement>('.titlebar [aria-expanded] .icon')!;
    const box = group.querySelector<HTMLElement>('.foldable')!;

    const samples: { at: number; angle: number; height: number }[] = [];
    const start = performance.now();
    group.querySelector<HTMLElement>('.titlebar [aria-expanded]')!.click();

    await new Promise<void>(done => {
      const tick = () => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(chevron).transform);
        samples.push({
          at: performance.now() - start,
          angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
          height: box.getBoundingClientRect().height
        });
        if (performance.now() - start < 700) { requestAnimationFrame(tick); } else { done(); }
      };
      requestAnimationFrame(tick);
    });

    // When each half had covered 99% of its own travel.
    //
    // Relative, not absolute. A rotation is measured in degrees and a height in pixels, so a
    // fixed per-frame threshold treats them differently for no reason - 0.5 degrees is a much
    // coarser test than 0.5 pixels here - and the height then looks like it settles later than
    // the chevron even when both are driven by the identical token. That artefact is what forced
    // the old check into a hand-tuned 40ms tolerance. Normalising removes the artefact instead
    // of budgeting for it.
    const settleTime = (read: (s: typeof samples[0]) => number) => {
      const from = read(samples[0]);
      const travel = Math.abs(read(samples[samples.length - 1]) - from);
      if (travel < 1) { return null; }
      return samples.find(s => Math.abs(read(s) - from) >= travel * 0.99)?.at ?? null;
    };

    return { chevron: settleTime(s => s.angle), height: settleTime(s => s.height), frames: samples.length };
  });

  expect(settled.frames, 'the fold recorder captured too few frames to say anything').toBeGreaterThan(5);
  expect(settled.chevron, 'the chevron never turned, so there was no fold to measure').not.toBeNull();
  expect(settled.height, 'the group height never changed, so there was no fold to measure').not.toBeNull();
  expect(
    settled.chevron!,
    `the chevron settled at ${settled.chevron}ms while the group was still closing at ${settled.height}ms`
  ).toBeGreaterThanOrEqual(settled.height! - FRAME);
});

/**
 * `.foldable` carries an `overflow-clip-margin` so that a focused card's ring - drawn outside
 * its box since D019 was revisited - is not cut off by the fold's clip. The margin has no
 * per-axis form in Chromium, so it also lets the next row's spine show below the box edge while
 * a group expands: a 6px fragment of a 20px mark, arriving from nowhere.
 *
 * `components.tsx` suspends the margin for the duration of the height animation. That is three
 * lines with no visible effect at rest, which is the kind of thing a refactor removes.
 */
test('nothing escapes the fold box while it is animating', async ({ page }) => {
  await openBoard(page);

  const during = await page.evaluate(() => {
    const group = document.querySelector<HTMLElement>('.group')!;
    const box = group.querySelector<HTMLElement>('.foldable')!;
    const atRest = getComputedStyle(box).overflowClipMargin;

    // Read inside the flight. The fold runs on `--dur-move`, so the frame after the click is
    // comfortably mid-animation.
    group.querySelector<HTMLElement>('.titlebar [aria-expanded]')!.click();
    return new Promise<{atRest:string; during:string; animating:boolean}>(done => {
      requestAnimationFrame(() => done({
        atRest,
        during: getComputedStyle(box).overflowClipMargin,
        animating: box.getAnimations().some(a => a.playState === 'running')
      }));
    });
  });

  expect(during.animating, 'the fold was not running, so nothing below was measured mid-flight').toBe(true);
  expect(during.atRest, 'the clip margin is gone, and a focused ring is being cut off again').not.toBe('0px');
  expect(during.during, 'the fold box leaks its margin mid-flight, so a spine shows past the edge').toBe('0px');
});
