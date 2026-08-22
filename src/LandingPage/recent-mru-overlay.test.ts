import * as assert from 'assert';
import * as os from 'os';
import * as vscode from 'vscode';
import { LandingPageProject } from './LandingPageModel';
import { hiddenMruEntries, recentPage, takeExisting, unhideMru } from './recent-mru-overlay';
import { registerExtensionContext } from './model-storage';

/**
 * Creates real files because `takeExisting` decides through filesystem stats.
 */
async function candidates(pattern:string):Promise<LandingPageProject[]>
{
  const dir = vscode.Uri.file(`${os.tmpdir()}/vsc-landingpage-tests/quota-${crypto.randomUUID()}`);
  await vscode.workspace.fs.createDirectory(dir);

  const built:LandingPageProject[] = [];
  for (let index=0; index<pattern.length; index++)
  {
    const file = vscode.Uri.joinPath(dir, `entry-${index}.txt`);
    if (pattern[index]==='y') {await vscode.workspace.fs.writeFile(file, new TextEncoder().encode('x'));}
    built.push({guid:`g${index}`, label:`${index}`, path:file.toString()});
  }
  return built;
}

const labels = (projects:LandingPageProject[]) => projects.map(p => p.label);

suite('takeExisting', () => {
  test('reaches further down the history to fill the quota past dead entries', async () => {
    // The bug this exists for: capping first, then dropping the dead entries, left the user
    // with fewer bookmarks than `maxRecentItems` and a count badge that disagreed with the list.
    const projects = await candidates('ynnnyyn');

    assert.deepStrictEqual(labels(await takeExisting(projects, 3)), ['0', '4', '5']);
  });

  test('keeps the original order of the survivors', async () => {
    const projects = await candidates('nyynny');

    assert.deepStrictEqual(labels(await takeExisting(projects, 10)), ['1', '2', '5']);
  });

  test('stops at the quota even when more entries survive', async () => {
    const projects = await candidates('yyyyy');

    assert.deepStrictEqual(labels(await takeExisting(projects, 2)), ['0', '1']);
  });

  test('a limit of 0 means no limit and keeps every survivor', async () => {
    const projects = await candidates('ynyny');

    assert.deepStrictEqual(labels(await takeExisting(projects, 0)), ['0', '2', '4']);
  });

  test('returns nothing when every target is gone, rather than padding the list', async () => {
    const projects = await candidates('nnnn');

    assert.deepStrictEqual(labels(await takeExisting(projects, 5)), []);
  });

  test('handles a quota larger than the history without inventing entries', async () => {
    const projects = await candidates('yy');

    assert.deepStrictEqual(labels(await takeExisting(projects, 20)), ['0', '1']);
  });

  test('crosses a batch boundary correctly', async () => {
    // The batch size is max(limit, 10), so a limit of 2 batches in tens: this run has its
    // survivors on both sides of the first boundary.
    const projects = await candidates('nnnnnnnnnnyy');

    assert.deepStrictEqual(labels(await takeExisting(projects, 2)), ['10', '11']);
  });

  test('an empty history is empty, not an error', async () => {
    assert.deepStrictEqual(await takeExisting([], 5), []);
  });
});

/**
 * A `Memento` backed by a plain object, so the overlay's durable state can be read back.
 *
 * The real one is VS Code's global state, which the test host shares between test files - so a
 * fake is not only faster here, it is what keeps one suite's hidden entries out of another's.
 */
function fakeGlobalState(seed:Record<string,unknown> = {}):Record<string,unknown>
{
  const store = {...seed};
  registerExtensionContext({
    globalState: {
      get: (key:string, fallback?:unknown) => store[key] ?? fallback,
      update: async (key:string, value:unknown) => {store[key] = value;},
      keys: () => Object.keys(store),
      setKeysForSync: () => {},
    },
  } as unknown as vscode.ExtensionContext);
  return store;
}

const hiddenKey = 'landingPageHiddenMruGuids';
const project = (guid:string):LandingPageProject => ({guid, label:guid, path:`file:///tmp/${guid}`});

/**
 * Hiding a Recent entry is the delete gesture's only outcome, so it is the one destructive act
 * on the board with no per-item undo: the sole way back was a menu button that cleared the whole
 * hidden list at once. These cover seeing what is hidden, and taking back exactly one of them.
 */
suite('hidden Recent entries', () => {
  test('lists the hidden entries, in the order the history has them', async () => {
    fakeGlobalState({[hiddenKey]: ['MRU:c', 'MRU:a']});

    const history = [project('MRU:a'), project('MRU:b'), project('MRU:c'), project('MRU:d')];

    assert.deepStrictEqual(hiddenMruEntries(history).map(p => p.guid), ['MRU:a', 'MRU:c']);
  });

  test('lists nothing when nothing is hidden, rather than the whole history', async () => {
    fakeGlobalState();

    assert.deepStrictEqual(hiddenMruEntries([project('MRU:a'), project('MRU:b')]), []);
  });

  test('drops a hidden guid the history no longer offers, rather than inventing an entry', async () => {
    // An entry can fall out of VS Code's recently-opened list while still being hidden. There is
    // nothing to name or restore at that point, so it must not reach the page as a blank row.
    fakeGlobalState({[hiddenKey]: ['MRU:gone', 'MRU:b']});

    assert.deepStrictEqual(hiddenMruEntries([project('MRU:a'), project('MRU:b')]).map(p => p.guid), ['MRU:b']);
  });

  test('restoring one entry leaves the others hidden', async () => {
    // The bug this exists for: the only route back was `restoreHiddenMru`, which emptied the
    // list - so taking back one mistake also undid every deliberate hide before it.
    const store = fakeGlobalState({[hiddenKey]: ['MRU:a', 'MRU:b', 'MRU:c']});

    await unhideMru('MRU:b');

    assert.deepStrictEqual(store[hiddenKey], ['MRU:a', 'MRU:c']);
  });

  test('restoring an entry that was never hidden changes nothing', async () => {
    const store = fakeGlobalState({[hiddenKey]: ['MRU:a']});

    await unhideMru('MRU:z');

    assert.deepStrictEqual(store[hiddenKey], ['MRU:a']);
  });

  test('ignores a guid that is not a Recent entry, as hiding does', async () => {
    const store = fakeGlobalState({[hiddenKey]: ['MRU:a']});

    await unhideMru('p-1');
    await unhideMru(undefined);

    assert.deepStrictEqual(store[hiddenKey], ['MRU:a']);
  });

  test('the restored entry comes back into the visible list', async () => {
    fakeGlobalState({[hiddenKey]: ['MRU:a']});
    const history = [project('MRU:a'), project('MRU:b')];

    assert.deepStrictEqual(hiddenMruEntries(history).map(p => p.guid), ['MRU:a']);
    await unhideMru('MRU:a');
    assert.deepStrictEqual(hiddenMruEntries(history), []);
  });
});

/**
 * Paging `Recent` past its configured cap.
 *
 * `Show more` has to know whether another page exists before it can decide to offer itself, and
 * the only honest way to know is to have looked one entry further than it intends to show. So
 * the caller asks `takeExisting` for `limit + 1` survivors and hands the result here; this is
 * where the extra one is dropped again. Getting that off by one either hides a real page or
 * offers a button that reveals nothing.
 */
suite('recentPage', () => {
  test('drops the probe entry and reports that another page exists', () => {
    const survivors = [project('a'), project('b'), project('c')];

    const page = recentPage(survivors, 2);

    assert.deepStrictEqual(page.projects.map(p => p.guid), ['a', 'b']);
    assert.strictEqual(page.hasMore, true);
  });

  test('offers no further page when the probe found nothing beyond the limit', () => {
    // Exactly `limit` survivors. The naive check - "did we fill the quota?" - says yes here and
    // offers a button that reveals nothing at all.
    const survivors = [project('a'), project('b')];

    const page = recentPage(survivors, 2);

    assert.deepStrictEqual(page.projects.map(p => p.guid), ['a', 'b']);
    assert.strictEqual(page.hasMore, false);
  });

  test('a short history is shown whole with no further page', () => {
    const page = recentPage([project('a')], 5);

    assert.deepStrictEqual(page.projects.map(p => p.guid), ['a']);
    assert.strictEqual(page.hasMore, false);
  });

  test('an empty history offers no further page', () => {
    assert.deepStrictEqual(recentPage([], 5), {projects: [], hasMore: false});
  });

  test('a limit of 0 means unlimited, so there is never a further page', () => {
    // `maxRecentItems: 0` is the documented way to ask for everything. Nothing may be dropped
    // here, and `Show more` must not appear over a list that is already complete.
    const survivors = [project('a'), project('b'), project('c')];

    const page = recentPage(survivors, 0);

    assert.deepStrictEqual(page.projects.map(p => p.guid), ['a', 'b', 'c']);
    assert.strictEqual(page.hasMore, false);
  });
});
