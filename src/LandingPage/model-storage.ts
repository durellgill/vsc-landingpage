import * as vscode from 'vscode';
import { LandingPageModel } from './LandingPageModel';

let landingPageExtContext: vscode.ExtensionContext;

/**
 * Stores the context instance so the model and the Recent overlay can be persisted.
 * Called from the extension's activate function in `extension.ts`.
 *
 * `activate()` registers this before the panel is created, because the Explorer context menu
 * action can bookmark something in a window where the landing page has never been opened.
 * @param ctx Context for this extension.
 */
export function registerExtensionContext(ctx: vscode.ExtensionContext):void
{
  landingPageExtContext = ctx;
}

export function extensionGlobalState():vscode.Memento
{
  return landingPageExtContext.globalState;
}

export async function saveLandingPageModel(model:LandingPageModel):Promise<void>
{
  await landingPageExtContext.globalState.update('landingPageModel',model);
}
