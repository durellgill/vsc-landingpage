import * as vscode from 'vscode';
import { LandingPageModel } from './LandingPageModel';

export interface MessageFromWebview
{
	command:'documentReady'|'rename'|'createBookmark'|'createGroup'|'remove'|'hideRecent'|'restoreHiddenRecents'|'unhideRecent'|'refreshRecents'|'moveGroup'|'open'|'patch'|'openSettings'|'cloneRepository'|'openFolder'|'moveToGroup'|'createDirectory'|'copyPath'|'moveBookmark';

  url?:string;

	guid?:string;
  pickFolder?:boolean;
  newWindow?:boolean;
  /** For command 'refreshRecents': reveal another page beyond the configured cap. */
  more?:boolean;
  direction?:'up'|'down';
  /** For command 'moveGroup': insertion index the group was dropped at, among user-created groups. */
  toIndex?:number;

  toGroup?:string;
  /** For command 'moveBookmark': GUID of the bookmark it lands in front of. Absent means the end of the group. */
  beforeGuid?:string;

  field?:'shade'|'layout'|'glyph'|'collapsed'|'pinned';
  value?:any;
}

/**
 * `postMessage` serializes a fresh object, so harness substitutes must `structuredClone` model data before handing it to Preact.
 */
export function syncModelInWebview(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):void
{
  webviewPanel.webview.postMessage({command:'syncModel', model:sharedModel});
}
