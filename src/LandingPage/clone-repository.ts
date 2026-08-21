import * as vscode from 'vscode';

/**
 * Delegates cloning to `git.clone`, which owns destination selection, progress, authentication, and the final open prompt.
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
