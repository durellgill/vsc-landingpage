import { expect, test } from '@playwright/test';
import { openBoard, postedCount, stillness } from './board';

/**
 * The two ways back out of a truncated `Recent` list: seeing what was hidden, and asking for
 * more than the cap.
 *
 * Both exist because the list lies by omission. Dragging a Recent entry to the delete zone hides
 * it permanently with no per-item undo, and the cap silently drops everything past
 * `maxRecentItems` - so in both cases the page shows a shorter list than the history holds and
 * gives no sign that it has done so.
 *
 * `?recents` is the harness state these need: a Recent group carrying hidden entries and another
 * page behind it. Its own query rather than the default model, so the appearance baselines are
 * not rewritten by a button that only some boards show.
 */

const recent = () => '.group[data-guid="@vsc-mru"]';

/** Open the Recent group's settings menu, which is where the hidden entries are reached from. */
async function openRecentMenu(page: import('@playwright/test').Page) {
  await page.locator(`${recent()} .tools button[aria-label^="Settings for"]`).click();
  await page.locator('.ctxmenu').waitFor();
}

/** The hidden-entries surface, and the rows inside it. */
const surface = (page: import('@playwright/test').Page) => page.locator('.hiddenrecents');
const hiddenRows = (page: import('@playwright/test').Page) => surface(page).locator('.hiddenrecents-entry');

/** Everything the page has posted to the host, in order. */
const posted = (page: import('@playwright/test').Page) => page.evaluate(() =>
  (window as unknown as { __posted?: Record<string, unknown>[] }).__posted ?? []);

test.describe('hidden recents', () => {
  test('the menu opens a surface naming every hidden entry', async ({ page }) => {
    // Before this, the only acknowledgement that anything was hidden at all was a button reading
    // "Restore hidden recents" - which gave no count, no names, and no way to tell whether
    // pressing it would bring back one entry or thirty.
    await openBoard(page, '?recents');
    await openRecentMenu(page);

    await page.locator('.ctxmenu').getByRole('button', { name: 'Hidden recents', exact: true }).click();
    await surface(page).waitFor();

    await expect(hiddenRows(page)).toHaveCount(2);
    await expect(surface(page)).toContainText('buried-project');
    await expect(surface(page)).toContainText('old-scratch');
  });

  test('restoring one entry posts only that guid', async ({ page }) => {
    // The whole point of the feature. `restoreHiddenRecents` clears the entire hidden list, so
    // posting it here would undo every other deliberate hide as a side effect of fixing one.
    await openBoard(page, '?recents');
    await openRecentMenu(page);
    await page.locator('.ctxmenu').getByRole('button', { name: 'Hidden recents', exact: true }).click();
    await surface(page).waitFor();

    await hiddenRows(page).first().getByRole('button', { name: /Restore/ }).click();

    const messages = await posted(page);
    expect(messages.filter(m => m.command === 'restoreHiddenRecents'),
      'restoring one entry cleared the whole hidden list').toHaveLength(0);
    expect(messages.filter(m => m.command === 'unhideRecent'))
      .toEqual([{ command: 'unhideRecent', guid: 'MRU:hidden-1' }]);
  });

  test('restore all is still available, and posts the wholesale message', async ({ page }) => {
    await openBoard(page, '?recents');
    await openRecentMenu(page);
    await page.locator('.ctxmenu').getByRole('button', { name: 'Hidden recents', exact: true }).click();
    await surface(page).waitFor();

    await surface(page).getByRole('button', { name: 'Restore all', exact: true }).click();

    const messages = await posted(page);
    expect(messages.filter(m => m.command === 'restoreHiddenRecents')).toHaveLength(1);
  });

  test('the surface says so when nothing is hidden, rather than opening empty', async ({ page }) => {
    // The default harness board has no hidden entries. An empty dialog with no explanation reads
    // as a broken feature; the absence of hidden entries is information the user came here for.
    await openBoard(page);
    await openRecentMenu(page);

    await page.locator('.ctxmenu').getByRole('button', { name: 'Hidden recents', exact: true }).click();
    await surface(page).waitFor();

    await expect(hiddenRows(page)).toHaveCount(0);
    await expect(surface(page)).toContainText(/nothing is hidden/i);
  });

  test('the surface is a dialog, takes focus, and hands it back on Escape', async ({ page }) => {
    // The board's rule for every opening surface. A dialog that leaves focus behind on the board
    // strands a keyboard user outside the thing they just opened.
    await openBoard(page, '?recents');
    await openRecentMenu(page);

    const trigger = page.locator('.ctxmenu').getByRole('button', { name: 'Hidden recents', exact: true });
    await trigger.click();
    await surface(page).waitFor();
    await stillness(page);

    await expect(surface(page)).toHaveAttribute('role', 'dialog');
    await expect(surface(page)).toHaveAttribute('aria-label', /hidden/i);
    const inside = await page.evaluate(() => !!document.activeElement?.closest('.hiddenrecents'));
    expect(inside, 'the surface opened without taking focus').toBe(true);

    await page.keyboard.press('Escape');
    await expect(surface(page)).toHaveCount(0);
    const returned = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(returned, 'focus was not returned to the control that opened the surface').toContain('Hidden recents');
  });
});

test.describe('show more', () => {
  const showMore = (page: import('@playwright/test').Page) =>
    page.locator(`${recent()} button[data-role="show-more"]`);

  test('Recent offers another page when the history has one', async ({ page }) => {
    await openBoard(page, '?recents');

    await expect(showMore(page)).toBeVisible();
    await expect(showMore(page)).toHaveAccessibleName(/show more/i);
  });

  test('asking for more posts a paged refresh, not a plain one', async ({ page }) => {
    // A plain `refreshRecents` rebuilds the list at the configured cap, which would leave the
    // button in place and the list unchanged - the failure this distinction exists to prevent.
    await openBoard(page, '?recents');

    await showMore(page).click();

    const messages = await posted(page);
    expect(messages.filter(m => m.command === 'refreshRecents'))
      .toEqual([{ command: 'refreshRecents', more: true }]);
  });

  test('another page actually lengthens the list', async ({ page }) => {
    await openBoard(page, '?recents');
    const before = await page.locator(`${recent()} .project`).count();

    await showMore(page).click();
    await stillness(page);

    expect(await page.locator(`${recent()} .project`).count(),
      'Show more posted, but the list came back the same length').toBeGreaterThan(before);
  });

  test('the button goes away once the whole history is shown', async ({ page }) => {
    // `hasMore` is what decides this, and the last page must clear it. A button that stays put
    // over a complete list is the same lie the cap told in the first place.
    await openBoard(page, '?recents');

    await showMore(page).click();
    await stillness(page);

    await expect(showMore(page)).toHaveCount(0);
  });

  test('no Show more on a board whose Recent list is already complete', async ({ page }) => {
    await openBoard(page);

    await expect(showMore(page)).toHaveCount(0);
  });

  test('user groups never offer a page control', async ({ page }) => {
    // Paging belongs to the generated Recent group alone; a user group holds exactly what was
    // put in it, so there is nothing behind it to reveal.
    await openBoard(page, '?recents');

    await expect(page.locator('.group[data-guid="g-work"] button[data-role="show-more"]')).toHaveCount(0);
  });
});

test('the refresh control still reloads the list, unpaged', async ({ page }) => {
  // Guards the seam between the two: `Show more` and `Refresh` both rebuild Recent, and wiring
  // the new one through the old message is the obvious way to break the old one.
  await openBoard(page, '?recents');
  const before = await postedCount(page, 'refreshRecents');

  await page.locator(`${recent()} button[data-role="refresh"]`).click();

  const messages = await posted(page);
  const refreshes = messages.filter(m => m.command === 'refreshRecents');
  expect(refreshes).toHaveLength(before + 1);
  expect(refreshes.at(-1), 'the refresh control asked for another page').toEqual({ command: 'refreshRecents' });
});
