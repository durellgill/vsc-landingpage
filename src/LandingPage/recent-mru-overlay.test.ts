import * as assert from 'assert';
import * as os from 'os';
import * as vscode from 'vscode';
import { LandingPageProject } from './LandingPageModel';
import { takeExisting } from './recent-mru-overlay';

/**
 * Builds candidates backed by real files, since `takeExisting` decides by stat-ing them.
 *
 * @param pattern One character per candidate: `y` exists on disk, `n` does not.
 * @returns Bookmarks in the given order, labelled by their index.
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
