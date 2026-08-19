import { expect, test } from '@playwright/test';
import { cards, openBoard } from './board';

/**
 * The enforcement D015 did not have.
 *
 * Until this file existed the accessibility contract was held up by review alone: the
 * extension-host suite runs outside a DOM, and the interaction specs assert focus rings but not
 * one accessible name. An aria snapshot is text, identical on every platform, and diffs in a pull
 * request - so a change that collapses a card's accessible name shows up as a line, in words.
 */

test.describe('accessible structure', () => {
  test('the default board', async ({ page }) => {
    await openBoard(page);
    await expect(page.locator('.content')).toMatchAriaSnapshot({ name: 'board-default.aria.yml' });
  });

  test('the empty board', async ({ page }) => {
    await openBoard(page, '?empty');

    // Anchored on `.page`, not `.content`. Snapshotting `.content` produced a zero-byte baseline,
    // because the empty state renders outside it - and a zero-byte baseline is a test that passes
    // whatever happens, including the page rendering nothing at all. The explicit assertion below
    // is the guard against that regressing quietly.
    await expect(page.getByRole('heading', { name: 'Nothing bookmarked yet' })).toBeVisible();
    await expect(page.locator('.page')).toMatchAriaSnapshot({ name: 'board-empty.aria.yml' });
  });

  test('the board with every target healthy', async ({ page }) => {
    await openBoard(page, '?healthy');
    await expect(page.locator('.content')).toMatchAriaSnapshot({ name: 'board-healthy.aria.yml' });
  });
});

test.describe('the D015 contract', () => {
  test('a bookmark is named by its label and described by its path', async ({ page }) => {
    await openBoard(page);
    const card = cards(page).first();

    // The accessible name comes from the card's own content through `aria-labelledby`. It must
    // be the label, not a synthesised string.
    await expect(card).toHaveAccessibleName('landing-page');

    // And the path arrives separately, as a description, so a screen reader reads both rather
    // than one replacing the other.
    await expect(card).toHaveAccessibleDescription(/Users\/dev\/Projects/);
  });

  test('no bookmark card carries an aria-label', async ({ page }) => {
    await openBoard(page);

    // D015 is explicit about this and explains why: `aria-label` replaces the accessible content
    // name, which would hide the path and the missing-target state - the two things a screen
    // reader user most needs from a bookmark. Observed failing by adding `aria-label="x"` to the
    // card in `components.tsx`, per D016.
    const labelled = await cards(page).evaluateAll(nodes => nodes.filter(n => n.hasAttribute('aria-label')).length);

    expect(labelled, 'a card with aria-label loses its path and missing state').toBe(0);
  });

  test('a missing target is announced, not just coloured red', async ({ page }) => {
    await openBoard(page);
    const missing = cards(page).filter({ hasText: 'moved-away' });

    // The red spine carries nothing for a screen reader. The state has to be in the description.
    await expect(missing).toHaveAccessibleDescription(/missing/i);
  });

  test('every card is reachable from the keyboard', async ({ page }) => {
    await openBoard(page);

    // Cards are tab stops by D015. A card that cannot be focused cannot be opened by keyboard,
    // and arrow navigation has nothing to move between.
    const focusable = await cards(page).evaluateAll(nodes =>
      nodes.filter(n => n.tabIndex >= 0 || n.tagName === 'BUTTON' || n.tagName === 'A').length);

    expect(focusable).toBe(await cards(page).count());
  });

  test('every icon-only control has an accessible name', async ({ page }) => {
    await openBoard(page);

    // Computed by the browser, not read off an attribute. An earlier version of this test looked
    // only at `aria-label` and `textContent` and reported the row menus as nameless; they are
    // named, through `title`, which is the last resort in the accessible name computation but a
    // real source. Asserting on attributes rather than on the computed name tests the markup
    // someone happened to write instead of what a screen reader will say.
    // Visible controls only. Recent's Add button is sealed shut because Recent takes no drops
    // (D004), and a control removed from the accessibility tree correctly has no name - asserting
    // on it would be asserting that hidden things are announced.
    const buttons = page.locator('.group button:visible');
    const total = await buttons.count();
    expect(total, 'expected the board to render group and row controls').toBeGreaterThan(0);

    for (let i = 0; i < total; i++) {
      await expect(buttons.nth(i)).toHaveAccessibleName(/\S/);
    }
  });
});
