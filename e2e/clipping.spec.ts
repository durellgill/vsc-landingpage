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
 * The first fix was a negative offset, keeping the ring inside the card. That was given up
 * because the leading 6px of a card is the spine's gutter, and an inset ring overlapped it. The
 * ring is outside again and `.foldable` now carries an `overflow-clip-margin`, which is room
 * granted deliberately rather than room assumed.
 *
 * So the rule is not "stay inside the card" and not "stay inside the clip" - it is that whatever
 * a focused card paints must fit in the room its clipping ancestor actually allows. A card is
 * still never guaranteed room it has not been given, so any outline, shadow or halo added to
 * `.project` later has the same constraint. That is what this file asserts, rather than
 * asserting one value: checking `outline-offset === 2px` would pass for a future change that
 * reintroduced the bug a different way, and would fail for a correct change using a box-shadow.
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
    // own width. A negative offset would draw it inside the card.
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
    // The clip edge, not the box edge. `overflow-clip-margin` moves where painting is actually
    // cut off, and it is the whole reason an outset ring survives here - measuring against the
    // bare box would report an escape that the browser does not make.
    const margin = clipper ? (parseFloat(getComputedStyle(clipper).overflowClipMargin) || 0) : 0;
    const raw = clipper ? clipper.getBoundingClientRect() : null;
    const bounds = raw && {
      left: raw.left - margin, right: raw.right + margin,
      top: raw.top - margin, bottom: raw.bottom + margin
    };

    return {
      hasIndicator: width > 0 && style.outlineStyle !== 'none',
      clipper: clipper ? clipper.className : null,
      clipMargin: margin,
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

    // Every edge must be zero or negative: the painted ring is at or inside the clip edge,
    // margin included. The original bug measured +3 on left and right, card flush to container.
    expect(report.clipMargin, 'the outset ring depends on the clip margin, which is gone').toBeGreaterThan(0);
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
