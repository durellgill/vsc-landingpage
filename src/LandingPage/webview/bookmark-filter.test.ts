import * as assert from 'assert';
import type { LandingPageGroup, LandingPageProject } from '../LandingPageModel';
import { displayPath, groupMatches, haystack, matches, opensInWindow, pinnedFirst, terms } from './bookmark-filter';

/**
 * These run in the extension host like every other suite here, even though the code under test
 * ships in the webview. That works because `bookmark-filter.ts` imports nothing at runtime - it
 * is the one part of the page with no DOM, no Preact and no bridge. Keep it that way and this
 * file keeps working; add a single DOM read and it stops compiling here.
 */

const project = (over:Partial<LandingPageProject> = {}):LandingPageProject => ({
  guid: 'p-1', label: 'api', path: 'file:///Users/dev/Projects/api', ...over
} as LandingPageProject);

suite('haystack', () => {
  test('includes the path, so a bookmark is findable by where it lives', () => {
    const hay = haystack(project({label:'api', path:'file:///Users/dev/Documents/api'}));

    assert.ok(hay.includes('documents'), 'the containing folder should be searchable');
  });

  test('strips the file:// scheme so what you type is what the card shows', () => {
    assert.ok(!haystack(project()).includes('file://'));
  });

  test('decodes percent escapes', () => {
    const hay = haystack(project({path:'file:///Users/dev/My%20Projects/api'}));

    assert.ok(hay.includes('my projects'), 'an escaped space should match a typed space');
  });

  test('a malformed escape does not throw, because a bad path must not break search', () => {
    // `%zz` is not a valid escape. decodeURIComponent throws on it; the raw path is used instead.
    assert.doesNotThrow(() => haystack(project({path:'file:///Users/dev/100%zz/api'})));
  });
});

suite('terms and matches', () => {
  test('every term must match, in any order', () => {
    // The documented case: `vsc land` finds `vsc-landingpage`.
    const bookmark = project({label:'vsc-landingpage', path:'file:///Users/dev/Projects/vsc-landingpage'});

    assert.strictEqual(matches(bookmark, terms('vsc land')), true);
    assert.strictEqual(matches(bookmark, terms('land vsc')), true, 'order must not matter');
  });

  test('terms may match across the label and the path separately', () => {
    // `dev api` picks one `api` out of several checkouts: one term hits the path, one the label.
    const bookmark = project({label:'api', path:'file:///Users/dev/Projects/api'});

    assert.strictEqual(matches(bookmark, terms('dev api')), true);
  });

  test('a term that matches nothing rejects the bookmark', () => {
    assert.strictEqual(matches(project(), terms('vsc nothinghere')), false);
  });

  test('an empty query matches everything', () => {
    assert.deepStrictEqual(terms('   '), []);
    assert.strictEqual(matches(project(), terms('   ')), true);
  });

  test('matching is case insensitive', () => {
    assert.strictEqual(matches(project({label:'API'}), terms('api')), true);
  });
});

suite('groupMatches', () => {
  const group = (label:string) => ({guid:'g-1', label, projects:[]} as unknown as LandingPageGroup);

  test('naming a group matches it, which is how a whole shelf is shown', () => {
    assert.strictEqual(groupMatches(group('Work'), terms('work')), true);
  });

  test('a group is matched on its label only, never on its bookmarks', () => {
    assert.strictEqual(groupMatches(group('Work'), terms('api')), false);
  });

  test('an empty query matches every group', () => {
    assert.strictEqual(groupMatches(group('Work'), terms('')), true);
  });
});

suite('pinnedFirst', () => {
  test('pinned bookmarks come first', () => {
    const ordered = pinnedFirst([
      project({guid:'a'}), project({guid:'b', pinned:true}), project({guid:'c'})
    ]);

    assert.deepStrictEqual(ordered.map(p => p.guid), ['b','a','c']);
  });

  test('two pinned bookmarks keep their stored order, not the order they were pinned in', () => {
    // D007: pinning sorts, it does not reorder. This is the assertion that says so.
    const ordered = pinnedFirst([
      project({guid:'a', pinned:true}), project({guid:'b'}), project({guid:'c', pinned:true})
    ]);

    assert.deepStrictEqual(ordered.map(p => p.guid), ['a','c','b']);
  });

  test('it does not mutate the array it was given', () => {
    const input = [project({guid:'a'}), project({guid:'b', pinned:true})];
    pinnedFirst(input);

    assert.deepStrictEqual(input.map(p => p.guid), ['a','b'], 'unpinning has to be able to restore this');
  });
});

suite('displayPath', () => {
  test('reads as a reader would write it', () => {
    assert.strictEqual(displayPath(project({path:'file:///Users/dev/My%20Projects'})), '/Users/dev/My Projects');
  });

  test('a bookmark with no path yields an empty string rather than undefined', () => {
    assert.strictEqual(displayPath(project({path:undefined})), '');
  });
});

suite('opensInWindow', () => {
  test('folders and workspaces may open in a new window', () => {
    assert.strictEqual(opensInWindow(project({icon:'folder'})), true);
    assert.strictEqual(opensInWindow(project({icon:'workspace'})), true);
  });

  test('a plain file may not, because vscode.open has no new-window form', () => {
    // D010. Withheld rather than offered and quietly ignored.
    assert.strictEqual(opensInWindow(project({icon:'file'})), false);
    assert.strictEqual(opensInWindow(project({icon:undefined})), false);
  });
});
