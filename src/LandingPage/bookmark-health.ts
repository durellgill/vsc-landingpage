import * as vscode from 'vscode';
import { LandingPageModel, LandingPageProject } from './LandingPageModel';

/**
 * Whether a bookmark's target still exists on disk.
 *
 * Returns false only when a local target is confirmed gone. Anything that is not a `file:`
 * URI is reported as present: a remote or virtual path can be perfectly valid while its
 * filesystem provider is not currently registered, and calling those dead would be worse
 * than not checking them.
 *
 * @param project Bookmark to check.
 * @returns False only when a local target is confirmed gone.
 */
export async function targetExists(project:LandingPageProject):Promise<boolean>
{
  if (!project.path) {return true;}
  let uri:vscode.Uri;
  try {uri = vscode.Uri.parse(project.path);}
  catch {return true;}
  if (uri.scheme!=='file') {return true;}

  try {await vscode.workspace.fs.stat(uri); return true;}
  catch {return false;}
}

/**
 * Checks every bookmark's target and tells the page which ones no longer exist, plus the git
 * branch each surviving folder has checked out.
 *
 * A bookmark whose folder has been moved, renamed or deleted looks identical to a live one
 * until you click it and get an error from VS Code. Since the whole point of the board is to
 * be trusted at a glance, the check happens up front instead.
 *
 * Deliberately *not* part of the model: this is observed state, not something the user set,
 * and persisting it would mean a stale verdict survives the thing being put back. It is sent
 * as its own `bookmarkHealth` message and held only in the webview. Add to that message
 * rather than inventing a second one.
 *
 * Only `file:` targets are checked, for the reason given on {@link targetExists}.
 *
 * @param webviewPanel Panel to report to.
 * @param sharedModel Model whose bookmarks are checked.
 */
export async function reportBookmarkHealth(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  const missing:string[] = [];
  const branches:Record<string,string> = {};

  const checks = sharedModel.groups.flatMap(group => group.projects.map(async project => {
    if (!project.path) {return;}
    let uri:vscode.Uri;
    try {uri = vscode.Uri.parse(project.path);}
    catch {return;} //unparseable path is a model problem, not a missing target
    if (uri.scheme!=='file') {return;}

    try {await vscode.workspace.fs.stat(uri);}
    catch {missing.push(project.guid); return;}

    if (project.icon!=='folder') {return;} //only a folder can be a working tree
    const branch = await readGitBranch(uri);
    if (branch) {branches[project.guid] = branch;}
  }));

  await Promise.all(checks);
  webviewPanel.webview.postMessage({command:'bookmarkHealth', missing, branches});
}

/**
 * Reads the checked-out git branch of a folder by parsing `.git/HEAD` directly.
 *
 * Deliberately not via the built-in Git extension: that would make the branch label depend
 * on an extension the user can disable, and on repositories it has decided to open. Reading
 * two small files is cheaper than either and works for any folder on disk.
 *
 * Handles the three shapes `.git` takes: a directory, a `gitdir:` pointer file (worktrees and
 * submodules), and a detached HEAD, which has no branch and reports a short commit id.
 *
 * @param folder Folder to inspect.
 * @returns Branch name, short commit id when detached, or undefined when this is not a
 *          repository - which is the common case and not an error.
 */
export async function readGitBranch(folder:vscode.Uri):Promise<string|undefined>
{
  try
  {
    let gitDir = vscode.Uri.joinPath(folder, '.git');
    const marker = await vscode.workspace.fs.stat(gitDir);

    if (marker.type===vscode.FileType.File)
    {
      const pointer = new TextDecoder().decode(await vscode.workspace.fs.readFile(gitDir));
      const target = /^gitdir:\s*(.+)$/m.exec(pointer)?.[1]?.trim();
      if (!target) {return undefined;}
      // The pointer may be absolute or relative to the folder holding the `.git` file.
      const absolute = target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target);
      gitDir = absolute ? vscode.Uri.file(target) : vscode.Uri.joinPath(folder, target);
    }

    const head = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(gitDir, 'HEAD'))).trim();
    const branch = /^ref:\s*refs\/heads\/(.+)$/.exec(head)?.[1];
    if (branch) {return branch;}
    return /^[0-9a-f]{40}$/i.test(head) ? head.slice(0,7) : undefined; //detached HEAD
  }
  catch
  {
    return undefined; //not a repository, or unreadable
  }
}
