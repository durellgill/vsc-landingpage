import * as assert from 'assert';
import * as os from 'os';
import * as vscode from 'vscode';
import { LandingPageProject } from './LandingPageModel';
import { readGitBranch, targetExists } from './bookmark-health';

/**
 * A directory of its own for every test.
 *
 * Isolated per case on purpose: a shared fixture root already caused a failure here once, when a
 * later test recreated a directory an earlier one had deliberately left missing. The assertion
 * was wrong, not the code.
 */
async function freshFixtureDir(name:string):Promise<vscode.Uri>
{
  const dir = vscode.Uri.file(`${os.tmpdir()}/vsc-landingpage-tests/${name}-${crypto.randomUUID()}`);
  await vscode.workspace.fs.createDirectory(dir);
  return dir;
}

async function writeFile(uri:vscode.Uri, text:string):Promise<void>
{
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
}

const bookmarkAt = (path:string):LandingPageProject => ({guid:'g', label:'l', path});

suite('targetExists', () => {
  test('is true for a file that is there', async () => {
    const dir = await freshFixtureDir('exists');
    const file = vscode.Uri.joinPath(dir, 'here.txt');
    await writeFile(file, 'x');

    assert.strictEqual(await targetExists(bookmarkAt(file.toString())), true);
  });

  test('is false only for a local target confirmed gone', async () => {
    const dir = await freshFixtureDir('missing');
    const gone = vscode.Uri.joinPath(dir, 'never-created.txt');

    assert.strictEqual(await targetExists(bookmarkAt(gone.toString())), false);
  });

  test('is true for a non-file scheme, whose provider may simply not be registered', async () => {
    // Flagging these as dead would be worse than not checking: a remote path can be perfectly
    // valid while its filesystem provider is not currently loaded.
    assert.strictEqual(await targetExists(bookmarkAt('vscode-remote://ssh-remote+box/srv/app')), true);
    assert.strictEqual(await targetExists(bookmarkAt('untitled:Untitled-1')), true);
  });

  test('is true for a bookmark with no path at all', async () => {
    assert.strictEqual(await targetExists({guid:'g', label:'l'}), true);
  });
});

suite('readGitBranch', () => {
  test('reads a branch from a .git directory', async () => {
    const repo = await freshFixtureDir('repo-dir');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(repo, '.git'));
    await writeFile(vscode.Uri.joinPath(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');

    assert.strictEqual(await readGitBranch(repo), 'main');
  });

  test('keeps the slashes in a branch name', async () => {
    const repo = await freshFixtureDir('repo-slash');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(repo, '.git'));
    await writeFile(vscode.Uri.joinPath(repo, '.git', 'HEAD'), 'ref: refs/heads/feature/very-long/name\n');

    assert.strictEqual(await readGitBranch(repo), 'feature/very-long/name');
  });

  test('follows an absolute gitdir: pointer file, as a worktree uses', async () => {
    const real = await freshFixtureDir('worktree-real');
    await writeFile(vscode.Uri.joinPath(real, 'HEAD'), 'ref: refs/heads/wt\n');
    const checkout = await freshFixtureDir('worktree-checkout');
    await writeFile(vscode.Uri.joinPath(checkout, '.git'), `gitdir: ${real.fsPath}\n`);

    assert.strictEqual(await readGitBranch(checkout), 'wt');
  });

  test('follows a relative gitdir: pointer, resolved against the folder holding it', async () => {
    const checkout = await freshFixtureDir('submodule');
    const real = vscode.Uri.joinPath(checkout, 'nested', 'gitdir');
    await vscode.workspace.fs.createDirectory(real);
    await writeFile(vscode.Uri.joinPath(real, 'HEAD'), 'ref: refs/heads/sub\n');
    await writeFile(vscode.Uri.joinPath(checkout, '.git'), 'gitdir: nested/gitdir\n');

    assert.strictEqual(await readGitBranch(checkout), 'sub');
  });

  test('reports a short commit id for a detached HEAD', async () => {
    const repo = await freshFixtureDir('detached');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(repo, '.git'));
    await writeFile(vscode.Uri.joinPath(repo, '.git', 'HEAD'), '1234567890abcdef1234567890abcdef12345678\n');

    assert.strictEqual(await readGitBranch(repo), '1234567');
  });

  test('is undefined for a folder that is not a repository, which is not an error', async () => {
    const plain = await freshFixtureDir('plain');

    assert.strictEqual(await readGitBranch(plain), undefined);
  });

  test('is undefined for a HEAD that is neither a ref nor a commit id', async () => {
    const repo = await freshFixtureDir('garbage');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(repo, '.git'));
    await writeFile(vscode.Uri.joinPath(repo, '.git', 'HEAD'), 'not a ref and not a sha\n');

    assert.strictEqual(await readGitBranch(repo), undefined);
  });

  test('is undefined for a gitdir: pointer with nothing after it', async () => {
    const checkout = await freshFixtureDir('empty-pointer');
    await writeFile(vscode.Uri.joinPath(checkout, '.git'), 'gitdir:\n');

    assert.strictEqual(await readGitBranch(checkout), undefined);
  });
});
