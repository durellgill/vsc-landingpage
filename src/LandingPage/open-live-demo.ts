import * as vscode from 'vscode';

const LANDING_PAGE_LIVE_DEMO_URL = 'https://vsc-landingpage-harness.vercel.app/';

/** Opens the live Landing Page demo in the user's external browser. */
export async function openLandingPageLiveDemo():Promise<void>
{
  const opened = await vscode.env.openExternal(vscode.Uri.parse(LANDING_PAGE_LIVE_DEMO_URL));
  if (!opened) {vscode.window.showWarningMessage('Could not open the Landing Page live demo.');}
}
