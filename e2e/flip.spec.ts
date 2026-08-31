import { expect, test } from '@playwright/test';
import { clearFlights, flights, openBoard, recordFlights, stillness } from './board';

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

/** Reorder one user group so it lands after another, through the production drag handlers. */
async function reorderGroup(page: import('@playwright/test').Page, sourceGuid: string, targetGuid: string) {
  await page.locator(`.group[data-guid="${sourceGuid}"] .titlebar`).evaluate(titlebar =>
    titlebar.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
  await page.locator(`.group[data-guid="${sourceGuid}"].dragging`).waitFor();

  await page.locator(`.group[data-guid="${targetGuid}"]`).evaluate(target => {
    const box = target.getBoundingClientRect();
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: new DataTransfer(),
      clientX: box.left + 20, clientY: box.bottom - 4
    }));
  });
  await page.locator(`.group[data-guid="${targetGuid}"][data-drop]`).waitFor();
  await page.locator(`.group[data-guid="${targetGuid}"]`).evaluate(target =>
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
}

test('an interrupted flight resumes from its visual position', async ({ page }) => {
  // `getBoundingClientRect()` includes an in-progress transform, so a flight interrupted by a
  // re-render read its own displacement as movement and left again by twice the offset. What
  // the effect has already moved has to be added back, which is the second term of the delta
  // in `main.tsx`.
  //
  // The previous version of this check interrupted after `waitForTimeout(80)`, and was flaky in
  // both directions: a browser could start the flight after the wait, or advance it much
  // further than intended. Freezing the flight at an exact point on its own timeline takes
  // scheduling out of the measurement. Reordering a group rather than switching a layout keeps
  // the simultaneous shelf-height animation out of the observed magnitude.
  await openBoard(page);
  const groups = await page.locator('.group:not(.sealed)').evaluateAll(elements =>
    elements.map(element => (element as HTMLElement).dataset.guid!));
  expect(groups.length, 'the interruption check needs two reorderable groups').toBeGreaterThanOrEqual(2);
  const [source, target] = groups;

  await recordFlights(page, 0.2);
  await reorderGroup(page, source, target);
  await expect(page.locator('.group:not(.sealed)').nth(1)).toHaveAttribute('data-guid', source);
  await expect.poll(async () => (await flights(page)).some(entry => entry.kind === 'group' && entry.guid === source),
    { message: 'the reorder started no flight for the group that moved' }).toBe(true);

  // The flight is frozen partway, so this is the exact position the group is drawn at, and the
  // position it must carry on from rather than jump away from.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const interrupted = await page.locator(`.group[data-guid="${source}"]`).boundingBox();
  expect(interrupted, 'the reordered group has no box to measure').not.toBeNull();

  // Interrupt it. A right-click moves nothing on the board - the menu is `position: fixed` - so
  // all it does is force the render that cancels the frozen flight, which is the whole gesture
  // being reproduced here. Any second reorder would be a layout change on top of it, and the
  // recovery flight would no longer be the only thing in the measurement.
  await clearFlights(page);
  await page.evaluate(() => { delete window.__pauseRecordedFlightsAt; });
  // Dispatched rather than clicked: the group is frozen mid-flight and visually overlapping its
  // neighbour, so a real click is refused by the hit test for a card that is perfectly visible.
  await page.locator('.project').first().dispatchEvent('contextmenu');
  await page.locator('.ctxmenu').waitFor();
  // A recovery flight that never starts is the failure too: an effect that forgets what it has
  // already moved computes a zero delta here and animates nothing, leaving the group to jump.
  await expect.poll(async () => (await flights(page)).some(entry => entry.kind === 'group' && entry.guid === source),
    { message: 'the interrupted group started no recovery flight' }).toBe(true);
  await stillness(page);

  const settled = await page.locator(`.group[data-guid="${source}"]`).boundingBox();
  expect(settled, 'the settled group has no box to measure').not.toBeNull();
  expect(Math.abs(interrupted!.y - settled!.y), 'the flight was not frozen partway, so nothing was interrupted')
    .toBeGreaterThan(1);

  const flight = (await flights(page)).find(entry => entry.kind === 'group' && entry.guid === source);
  const offset = flight?.transform && /translate\((-?[\d.]+)px, *(-?[\d.]+)px\)/.exec(flight.transform);
  expect(offset, 'the interrupted group started no recovery flight').not.toBeNull();
  expect(Number(offset![1]), 'the interrupted group resumed from the wrong horizontal position')
    .toBeCloseTo(interrupted!.x - settled!.x, 0);
  expect(Number(offset![2]), 'the interrupted group resumed from the wrong vertical position')
    .toBeCloseTo(interrupted!.y - settled!.y, 0);
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
