import { expect, test } from '@playwright/test';
import { cardTops, clearFlights, flights, openBoard, recordFlights, stillness } from './board';

/**
 * The FLIP baseline, and the four ways it has been wrong.
 *
 * Every test here was a bug that shipped, reduced to the smallest assertion that would have
 * caught it. They share one instrument - `recordFlights` patches `Element.prototype.animate` -
 * because a flight leaves nothing in the DOM to assert on and is over before a screenshot could
 * catch it. What each one asserts is which flights started, and from where.
 *
 * Three of them assert a negative: a scroll starts no flights, a resize flies nobody else's
 * cards, a twin does not fly. Each is paired with its positive half in the same test, because
 * "nothing ever animates" would otherwise pass every one of them.
 */

/** The layout button on a group's titlebar. Cycles list, grid, compact. */
const layoutButton = (page: import('@playwright/test').Page, guid?: string) =>
  page.locator(guid ? `.group[data-guid="${guid}"] button[data-role="layout"]` : '.group button[data-role="layout"]').first();

test('an interrupted flight keeps its direction', async ({ page }) => {
  // One layout switch interrupted by another, which is what typing in the filter does to the
  // board many times a second. The bug: `getBoundingClientRect()` reports an in-progress
  // transform, and the offset was subtracted where it should have been added, so a card
  // interrupted mid-flight flew away from its destination instead of towards it.
  await openBoard(page);
  await recordFlights(page);
  await stillness(page);

  await layoutButton(page).click();

  // 80ms in: the first wave is still in the air, which is the whole point. Interrupt it.
  await page.waitForTimeout(80);
  const mid = await cardTops(page);
  const firstWave = await flights(page);
  expect(firstWave.length, 'the first layout switch started no flights at all').toBeGreaterThan(0);

  const cutoff = firstWave[0].at + 50;
  await layoutButton(page).click();
  await page.waitForFunction(c => (window.__flights ?? []).some(f => f.at > c), cutoff);
  await stillness(page);
  const settled = await cardTops(page);

  const measured = (await flights(page))
    .filter(f => f.kind === 'project' && f.at > cutoff && f.transform && f.guid)
    .map(f => {
      const parsed = /translate\((-?[\d.]+)px, *(-?[\d.]+)px\)/.exec(f.transform!);
      return {
        guid: f.guid!,
        used: parsed ? parseFloat(parsed[2]) : NaN,
        want: mid[f.guid!] - settled[f.guid!]
      };
    })
    // Only cards that actually travelled. A card that barely moved is being carried by its
    // group's height animation rather than flying itself, so its measured layout position is
    // legitimately not its settled one and the direction expectation does not hold for it.
    .filter(r => Number.isFinite(r.used) && Number.isFinite(r.want) && Math.abs(r.want) > 1);

  expect(measured.length, 'no interrupted card travelled far enough to measure').toBeGreaterThan(0);
  const inverted = measured.filter(r => Math.sign(r.used) !== Math.sign(r.want));
  expect(inverted, `${inverted.length} of ${measured.length} flights flew the wrong way`).toEqual([]);
});

test('a group and its cards move as one body', async ({ page }) => {
  // Reordering a group teleported its header 133px while its own cards glided, because the FLIP
  // effect only ever selected `.project`. The distance between a group's header and its first
  // card is fixed by layout, so it must not vary on any frame of the reorder.
  //
  // Each step waits for the state it produces to render before the next one is dispatched.
  // Firing all three events in one pass looks like it works and reorders nothing: the drop
  // lands before Preact has the drag in state, and a board that never moved has a perfectly
  // constant gap. That is why the group's own travel is asserted below.
  await openBoard(page);

  const ids = await page.evaluate(() => {
    const first = document.querySelectorAll<HTMLElement>('.group')[0];
    first.querySelector<HTMLElement>('.titlebar')!.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    return { group: first.dataset.guid!, card: first.querySelector<HTMLElement>('.project')!.dataset.guid! };
  });
  await page.locator('.group.dragging').waitFor();

  await page.evaluate(() => {
    const second = document.querySelectorAll<HTMLElement>('.group')[1];
    const box = second.getBoundingClientRect();
    second.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: new DataTransfer(),
      clientX: box.left + 20, clientY: box.bottom - 4
    }));
  });
  await page.locator('.group[data-drop]').waitFor();

  // Sample the header-to-card distance on every frame of the reorder. A group that leaves its
  // cards behind shows up as the gap changing; one that carries them shows a flat line. The
  // group's own position is sampled alongside it so a reorder that never happened cannot pass.
  const samples = await page.evaluate(async (ids) => {
    const taken: { gap: number; top: number }[] = [];
    const start = performance.now();
    document.querySelectorAll<HTMLElement>('.group')[1].dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));

    await new Promise<void>(done => {
      const tick = () => {
        const moving = document.querySelector<HTMLElement>(`.group[data-guid="${ids.group}"]`);
        const flying = document.querySelector<HTMLElement>(`.project[data-guid="${ids.card}"]`);
        if (moving && flying) {
          taken.push({
            gap: flying.getBoundingClientRect().top - moving.querySelector('.titlebar')!.getBoundingClientRect().top,
            top: moving.getBoundingClientRect().top
          });
        }
        if (performance.now() - start < 700) { requestAnimationFrame(tick); } else { done(); }
      };
      requestAnimationFrame(tick);
    });
    return taken;
  }, ids);

  expect(samples.length, 'the reorder recorder captured no frames').toBeGreaterThan(5);

  const travelled = Math.max(...samples.map(s => s.top)) - Math.min(...samples.map(s => s.top));
  expect(travelled, 'the group did not travel: either the drop reordered nothing, or the header teleported instead of flying').toBeGreaterThan(1);

  const spread = Math.max(...samples.map(s => s.gap)) - Math.min(...samples.map(s => s.gap));
  expect(spread, `the header-to-card gap varied by ${spread.toFixed(1)}px across ${samples.length} frames`).toBeLessThanOrEqual(1);
});

test('a scroll is not a movement', async ({ page }) => {
  // `getBoundingClientRect()` is viewport-relative and the FLIP effect compares its results
  // across renders, so scrolling between two renders looked exactly like every element on the
  // board having moved. Scroll 150px, then re-render by any means at all - right-click a card,
  // hover one, type a character in the filter - and the whole board flew 150px and settled.
  // This is the reported "the page randomly jumps a little bit", and it needed no layout change
  // to happen, only a scroll and a render.
  await openBoard(page);
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.cssText = 'height:1200px';
    document.body.appendChild(spacer);
  });
  await recordFlights(page);
  await stillness(page);

  const scrollable = await page.evaluate(() => {
    const el = document.scrollingElement!;
    el.scrollTop = 150;
    return el.scrollHeight > el.clientHeight && el.scrollTop === 150;
  });
  expect(scrollable, 'the board did not become scrollable, so this proves nothing').toBe(true);
  await stillness(page);

  await clearFlights(page);
  await page.locator('.project').first().click({ button: 'right' });
  // A fixed wait, and one of only two here. The assertion is that *no* flight starts, and the
  // absence of an event cannot be polled for - a poll would return immediately and prove
  // nothing. Its partner below waits exactly as long, for the opposite reason: the two halves
  // are only a fair comparison if the page gets the same time to animate in both.
  await page.waitForTimeout(200);
  expect(await flights(page), 'a render while scrolled started flights').toEqual([]);

  // The other half. Without it, "never animate anything" would pass the assertion above.
  await clearFlights(page);
  await layoutButton(page).click();
  await page.waitForTimeout(200);
  expect((await flights(page)).length, 'a real layout change started no flights').toBeGreaterThan(0);
});

test('a resize is not a movement either', async ({ page }) => {
  // The FLIP baseline is only written during a render. Dragging the editor panel narrower
  // re-wraps every grid and re-flows every group without rendering anything, so the baseline
  // goes on describing the wide layout. The next render for any reason at all then read that
  // stale baseline as movement and flew groups nobody had touched: narrowing the panel and
  // switching `Recent` slid an untouched group's card 34px sideways, a beat after the resize
  // that actually moved it.
  await openBoard(page);
  await page.setViewportSize({ width: 760, height: 800 });
  await stillness(page);

  await recordFlights(page);
  await layoutButton(page, '@vsc-mru').click();
  // Fixed, for the same reason as the scroll check: half the assertion is a negative.
  await page.waitForTimeout(300);

  const flew = await flights(page);
  const strangers = flew.filter(f => f.owner !== '@vsc-mru');
  expect(strangers.map(f => f.owner), 'a layout switch after a resize flew another group').toEqual([]);
  expect(flew.some(f => f.owner === '@vsc-mru'), 'the switched group did not fly at all').toBe(true);
});

test('a bookmark that appears twice does not fly its twin', async ({ page }) => {
  // The board can hold the same bookmark twice: once in a group and once in `Recent`, under one
  // GUID. The FLIP baseline was keyed on that GUID alone, so both cards wrote to the same entry
  // - whichever was measured last won - and the next render read the other card's position as
  // movement. Clicking `Recent`'s layout button flew a card in an untouched group sideways
  // across its neighbour and slid it back, which is what the bug report showed.
  await openBoard(page);
  await recordFlights(page);
  await stillness(page);

  await layoutButton(page, '@vsc-mru').click();
  await page.waitForTimeout(300);

  const flew = await flights(page);
  const strangers = flew.filter(f => f.owner !== '@vsc-mru');
  expect(strangers.map(f => f.owner), 'a layout switch flew a twin in another group').toEqual([]);
  expect(flew.some(f => f.owner === '@vsc-mru'), 'the switched group did not fly at all').toBe(true);
});
