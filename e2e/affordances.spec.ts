import { expect, test } from '@playwright/test';
import { cards, openBoard, stillness } from './board';

test('a painted bookmark still grows its spine on hover', async ({ page }) => {
  // A specificity trap, not a value. `--spine-scale` has to be declared only on `.project` and
  // `.project:hover`; putting the painted variant's resting size on the same property would
  // place it on `.project[data-shade]:not([data-shade=""])`, which outranks `:hover`, and
  // painted bookmarks - the overwhelming majority of a real board - would become the only ones
  // that ignored the pointer.
  //
  // Driven by a real pointer, because `:hover` cannot be faked from script.
  await openBoard(page);

  const painted = page.locator('.project[data-shade]:not([data-shade=""])').first();
  const resting = await painted.evaluate(card => getComputedStyle(card).getPropertyValue('--spine-scale').trim());
  expect(resting, 'no painted bookmark on the board, so the trap is untested').not.toBe('1');

  await painted.hover();
  await page.waitForFunction(() => !!document.querySelector('.project[data-shade]:not([data-shade=""]):hover'));
  await stillness(page);

  const hovered = await painted.evaluate(card => ({
    scale: getComputedStyle(card).getPropertyValue('--spine-scale').trim(),
    width: +card.querySelector('.spine')!.getBoundingClientRect().width.toFixed(1)
  }));
  expect(hovered.scale, 'a painted bookmark ignored the pointer').toBe('1');
  expect(hovered.width, 'the hovered spine is not at its full width').toBe(4);
});

test('the hover card survives the scroll that focusing a card causes', async ({ page }) => {
  // The hover card is positioned in the viewport by the Popover API and does not move with the
  // document, so it is dropped when the page scrolls. Focusing a card off-screen scrolls it into
  // view, and that scroll must not take the card's own detail popover with it.
  await openBoard(page);

  // Clip the first card's label, since an unclipped one has nothing to reveal and shows no card.
  await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.content .project');
    if (!card) {return;}
    card.querySelector('.project-label')!.textContent =
      'A label long enough that the card clips it and the hover detail has something to reveal';
    card.style.width = card.style.minWidth = '100px';
    const spacer = document.createElement('div');
    spacer.style.cssText = 'height:1200px';
    document.body.appendChild(spacer);
  });

  // Off-screen, so that focusing it is what scrolls it back.
  await page.evaluate(() => {document.scrollingElement!.scrollTop = 1200;});
  const card = cards(page).first();
  expect(await card.evaluate(el => el.getBoundingClientRect().bottom), 'the card is still on screen, so focusing it will not scroll').toBeLessThan(0);

  await card.focus();
  await stillness(page);

  const hovercard = page.locator('.hovercard:popover-open');
  await expect(hovercard, 'the scroll that focus caused dismissed the focused card\'s own detail').toBeVisible();

  // And it is placed against where the card ended up, not where it was before the scroll.
  const gap = await page.evaluate(() => {
    const box = document.querySelector('.content .project')!.getBoundingClientRect();
    const popover = document.querySelector('.hovercard')!.getBoundingClientRect();
    return Math.round(popover.top - box.bottom);
  });
  expect(gap, 'the detail card is not anchored to the bookmark it describes').toBe(6);
});
