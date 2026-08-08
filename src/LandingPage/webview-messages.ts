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
	command:'documentReady'|'rename'|'createBookmark'|'createGroup'|'remove'|'hideRecent'|'restoreHiddenRecents'|'refreshRecents'|'moveGroup'|'open'|'move'|'patch'|'openSettings'|'setViewState'|'cloneRepository'|'openFolder'|'moveToGroup'|'createDirectory'|'copyPath'|'moveBookmark';

  /** For command 'cloneRepository': the repository URL typed into the clone field. */
  url?:string;

  /** GUID value of model fragment this command refers to. */
	guid?:string;
  /** For command createBookmark: if true, a folder picker is shown, else a filepicker is shown.  */
  pickFolder?:boolean;
  /** For command 'open': open the target in a new VS Code window instead of this one. */
  newWindow?:boolean;
  /** For command 'move' the GUID of the element the dragged element (GUID) is placed relative to. */
  guid2?:string;
  /** If given, command 'move' will create a copy and assign this GUID to the cloned node. */
  cloneGUID?:string;
  /** For command 'move' the insertion relation to drop target (GUID2). */
  pos?:'before'|'after';
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
 * A model sync sent from the extension host down to the webview page.
 *
 * Note this is not the only message the host sends: `bookmarkHealth` and `pathCopied` are
 * posted directly, since neither carries a model.
 */
export interface MessageToWebview
{
  /** Signal ID to send to webview. */
  command:string;
  /** Data model to render. */
  model:LandingPageModel;
  /** If true, the webview does not sync existing dom elements, but recreates the whole render tree. */
  forceRebuild?:boolean;
}

/**
 * Posts one message down to the webview page.
 *
 * `postMessage` serialises, so the page always receives a fresh object even though the host
 * mutates and reposts the same model instance every time. Anything standing in for the host
 * outside VS Code has to `structuredClone` to match that, or the page's `useState` bails out
 * on `Object.is` and stops re-rendering.
 */
export function sendMessageToWebview(message:MessageToWebview, webviewPanel:vscode.WebviewPanel):void
{
  webviewPanel.webview.postMessage(message);
}

/**
 * Performs a resync/reload of the webview to reflect the given model.
 * @param webviewPanel Webview instance to update.
 * @param sharedModel Model to render.
 */
export function syncModelInWebview(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):void
{
  sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel); // when webview is ready, send model to it
}
