import * as vscode from 'vscode';
import { LandingPageModel } from './LandingPageModel';

/**
 * The shape of every message the webview page sends to the extension host.
 *
 * This is the whole bridge in one direction: the page cannot use the `vscode` API, require
 * modules or read files, so anything it wants done arrives here as one of these commands.
 */
export interface MessageFromWebview
{
	command:'documentReady'|'rename'|'createBookmark'|'createGroup'|'remove'|'hideRecent'|'restoreHiddenRecents'|'refreshRecents'|'moveGroup'|'open'|'patch'|'openSettings'|'cloneRepository'|'openFolder'|'moveToGroup'|'createDirectory'|'copyPath'|'moveBookmark';

  /** For command 'cloneRepository': the repository URL typed into the clone field. */
  url?:string;

  /** GUID value of model fragment this command refers to. */
	guid?:string;
  /** For command createBookmark: if true, a folder picker is shown, else a filepicker is shown.  */
  pickFolder?:boolean;
  /** For command 'open': open the target in a new VS Code window instead of this one. */
  newWindow?:boolean;
  /** Direction for moving a user-created group one position. */
  direction?:'up'|'down';
  /** For command 'moveGroup': insertion index the group was dropped at, among user-created groups. */
  toIndex?:number;

  /** For command 'moveBookmark': GUID of the group the bookmark was dropped on. */
  toGroup?:string;
  /** For command 'moveBookmark': GUID of the bookmark it lands in front of. Absent means the end of the group. */
  beforeGuid?:string;

  /** For command 'patch' the name of the field to update. */
  field?:'shade'|'layout'|'glyph'|'collapsed'|'pinned';
  /** For command 'patch' the new value to assign, or the text from the inline rename editor. */
  value?:any;
}

/**
 * Pushes the model down to the webview page, which re-renders the board from it.
 *
 * This is the only message the host sends that carries a model, and the only one sent from
 * more than one place, which is why it is the only one with a function. `bookmarkHealth`,
 * `pathCopied` and `setFocusToFilterInput` each have a single caller and post directly - a
 * wrapper per message would be a layer with one caller each.
 *
 * `postMessage` serialises, so the page always receives a fresh object even though the host
 * mutates and reposts the same model instance every time. Anything standing in for the host
 * outside VS Code has to `structuredClone` to match that, or the page's `useState` bails out
 * on `Object.is` and stops re-rendering.
 *
 * There is deliberately no `forceRebuild` flag. One was posted with eight of these messages
 * for a long time, described as recreating the whole render tree because the DOM sync is
 * keyed by GUID and a reorder changes positions without changing keys. The page never read
 * it - `git log -S forceRebuild -- main.tsx` returns nothing, so the receiver at
 * `main.tsx`'s `syncModel` branch has never looked at the field. Preact reconciles from the
 * new model on its own. Do not reintroduce it without a consumer.
 *
 * @param webviewPanel Webview instance to update.
 * @param sharedModel Model to render.
 */
export function syncModelInWebview(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):void
{
  webviewPanel.webview.postMessage({command:'syncModel', model:sharedModel});
}
