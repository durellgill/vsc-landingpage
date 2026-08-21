import * as vscode from 'vscode';
import { LandingPageModel, LandingPageProject } from './LandingPageModel';

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

export async function reportBookmarkHealth(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  const missing:string[] = [];
  const branches:Record<string,string> = {};

  const checks = sharedModel.groups.flatMap(group => group.projects.map(async project => {
    if (!project.path) {return;}
    let uri:vscode.Uri;
    try {uri = vscode.Uri.parse(project.path);}
    catch {return;} // An unparseable stored path is a model problem, not evidence that the target is missing.
    if (uri.scheme!=='file') {return;}

    try {await vscode.workspace.fs.stat(uri);}
    catch {missing.push(project.guid); return;}

    if (project.icon!=='folder') {return;}
    const branch = await readGitBranch(uri);
    if (branch) {branches[project.guid] = branch;}
  }));

  await Promise.all(checks);

  // Awaited inside the try so a disposal that surfaces as a rejection is caught too, not just
  // the `webview` getter throwing synchronously.
  try {await webviewPanel.webview.postMessage({command:'bookmarkHealth', missing, branches});}
  catch {}
}

/**
 * Branch detection handles a `.git` directory, a worktree or submodule `gitdir:` file, and detached HEAD.
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
    return /^[0-9a-f]{40}$/i.test(head) ? head.slice(0,7) : undefined;
  }
  catch
  {
    return undefined;
  }
}
