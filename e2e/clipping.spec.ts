import { expect, test } from '@playwright/test';
import { cards, openBoard } from './board';

/**
 * Nothing that indicates state may be clipped by an ancestor.
 *
 * This is D019 generalised. The bug was a focus ring drawn at a positive `outline-offset`, which
 * put it outside `.foldable` - a container that clips both axes so the fold animation has a box
 * to animate. A focused list row drew two horizontal strokes with no ends; a focused first grid
 * card drew three sides.
 *
 * The specific fix was a negative offset. The general rule is that a card is never guaranteed
 * room outside its own box, so any resting outline, shadow or halo added to `.project` later has
 * the same constraint. That is what this file asserts, rather than asserting one value: checking
 * `outline-offset === -2px` would pass for a future change that reintroduced the bug a different
 * way, and would fail for a correct change that used a box-shadow instead.
 *
 * Geometry rather than pixels on purpose (D016). A screenshot diff can show that a focused card
 * looks wrong; only this can say the ring escaped its clip, which is the thing to fix.
 */

/** The nearest ancestor that clips, and the painted bounds of the focus indicator. */
async function clipReport(page: import('@playwright/test').Page, index: number) {
  return page.evaluate((i) => {
    const card = document.querySelectorAll<HTMLElement>('.content .project')[i];
    card.focus();

    const style = getComputedStyle(card);
    const width = parseFloat(style.outlineWidth) || 0;
    const offset = parseFloat(style.outlineOffset) || 0;
    const box = card.getBoundingClientRect();

    // Where the outline is actually painted: outward from the border box by offset, then its
    // own width. A negative offset draws it inside the card, which is the point.
    const painted = {
      left: box.left - offset - width,
      right: box.right + offset + width,
      top: box.top - offset - width,
      bottom: box.bottom + offset + width
    };

    let clipper: HTMLElement | null = null;
    for (let el = card.parentElement; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { clipper = el; break; }
    }
    const bounds = clipper ? clipper.getBoundingClientRect() : null;

    return {
      hasIndicator: width > 0 && style.outlineStyle !== 'none',
      clipper: clipper ? clipper.className : null,
      escapes: bounds
        ? {
            left: +(bounds.left - painted.left).toFixed(2),
            right: +(painted.right - bounds.right).toFixed(2),
            top: +(bounds.top - painted.top).toFixed(2),
            bottom: +(painted.bottom - bounds.bottom).toFixed(2)
          }
        : null
    };
  }, index);
}

test.describe('focus indicators stay inside their clip', () => {
  test('a focused list row', async ({ page }) => {
    await openBoard(page);
    const report = await clipReport(page, 1);

    expect(report.hasIndicator, 'a focused card must draw something').toBe(true);
    expect(report.clipper, 'expected .foldable to be the clipping ancestor').toContain('foldable');

    // Every edge must be zero or negative: the painted ring is at or inside the clip bounds.
    // The original bug measured +3 on left and right, with the card flush to the container.
    for (const [edge, over] of Object.entries(report.escapes!)) {
      expect(over, `the focus ring escapes its clip on the ${edge}`).toBeLessThanOrEqual(0);
    }
  });

  test('a focused first grid card, which is flush with the container', async ({ page }) => {
    await openBoard(page);

    // The first card of the grid group. In grid the card is flush on the left only, which is why
    // the original bug drew three sides here and two strokes in list - the same cause, two
    // different symptoms, and the reason this is checked in both layouts.
    const index = await cards(page).evaluateAll(nodes =>
      nodes.findIndex(n => n.closest('.projects')?.classList.contains('grid')));
    expect(index, 'expected a grid group on the default board').toBeGreaterThan(-1);

    const report = await clipReport(page, index);
    expect(report.hasIndicator).toBe(true);
    for (const [edge, over] of Object.entries(report.escapes!)) {
      expect(over, `the focus ring escapes its clip on the ${edge}`).toBeLessThanOrEqual(0);
    }
  });
});
