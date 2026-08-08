import * as vscode from 'vscode';
import { LandingPageModel } from './LandingPageModel';

/**
 * Pointer to the extension context, required to {@link saveModel}.
 */
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

/**
 * The extension's global state, which is where the model and every Recent customisation live.
 *
 * Global rather than workspace state on purpose: a bookmark board is the user's, not one
 * checkout's, and it has to be the same board in every window.
 */
export function extensionGlobalState():vscode.Memento
{
  return landingPageExtContext.globalState;
}

/**
 * Permanently store the landingpage model in extension's storage.
 * @param model Current model status.
 */
export function saveModel(model:LandingPageModel):void
{
  landingPageExtContext.globalState.update('landingPageModel',model);
}
