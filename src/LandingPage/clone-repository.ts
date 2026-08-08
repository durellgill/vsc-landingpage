import * as vscode from 'vscode';

/**
 * Clones a git repository by handing off to VS Code's built-in Git extension.
 *
 * The `git.clone` command owns the destination folder picker, the progress notification,
 * credential/SSH handling and the final "Open / Add to Workspace" prompt, so none of that
 * is reimplemented here. Once opened, the clone shows up in the `Recent` group like any
 * other folder.
 *
 * @param url Repository URL entered in the webview.
 */
export async function cloneRepository(url?:string):Promise<void>
{
  if (!vscode.extensions.getExtension('vscode.git'))
  {
    vscode.window.showErrorMessage('Cannot clone: the built-in Git extension is disabled. Enable it to use this feature.');
    return;
  }

  const repoUrl = url?.trim();
  if (!repoUrl) {return;}

  try
  {
    await vscode.commands.executeCommand('git.clone', repoUrl);
  }
  catch (err:any)
  {
    vscode.window.showErrorMessage(`Could not clone ${repoUrl}: ${err?.message ?? err}`);
  }
}
