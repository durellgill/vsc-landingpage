import * as vscode from 'vscode';

const LANDING_PAGE_REPOSITORY_URL = 'https://github.com/Durellg/vsc-landingpage';

/** Opens the Landing Page GitHub repository in the user's external browser. */
export async function openLandingPageRepository():Promise<void>
{
  const opened = await vscode.env.openExternal(vscode.Uri.parse(LANDING_PAGE_REPOSITORY_URL));
  if (!opened) {vscode.window.showWarningMessage('Could not open the Landing Page repository.');}
}
