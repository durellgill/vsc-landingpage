import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { findItemByGuid, LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { parseUriNameParts } from './uri-name-parts';
import { MessageFromWebview, syncModelInWebview } from './webview-messages';
import { saveLandingPageModel } from './model-storage';
import { reportBookmarkHealth } from './bookmark-health';
import {
  RECENT_GROUP_GUID, clearMruCustomisations, customiseMru, hideMru, hiddenMruEntries, populateVscMru, restoreHiddenMru, unhideMru,
} from './recent-mru-overlay';
import { recentLimit } from './history';
import { pickDestinationGroup } from './group-destination';
import { moveBookmark, moveGroup, moveToGroup } from './bookmark-moves';
import { createDirectory } from './bookmark-creation';
import { copyPath } from './clipboard-path';
import { cloneRepository } from './clone-repository';
import { openLandingPageLiveDemo } from './open-live-demo';

export { registerExtensionContext } from './model-storage';

let codeCliCache:Promise<boolean>|undefined;
/**
 * Probes `code` asynchronously once per session. Without a shell, `code.cmd` is unavailable on Windows and the menu item is withheld.
 */
function codeCliAvailable():Promise<boolean>
{
	codeCliCache ??= new Promise<boolean>(resolve =>
	{
		execFile('code', ['--version'], {timeout: 5000}, error => resolve(!error));
	});
	return codeCliCache;
}
export { bookmarkUris } from './bookmark-creation';
export { cloneRepository } from './clone-repository';

/**
 * How many Recent entries the page is currently showing, when it has asked for more than the
 * configured cap.
 *
 * Session-only and deliberately not persisted. `maxRecentItems` stays the setting that decides
 * how long the list is; this is one visit reaching past it, and a reload returns to the setting
 * rather than leaving a second, invisible one behind.
 */
let recentShown:number|undefined;

export async function refreshRecents(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  await populateVscMru(sharedModel, recentShown);
  syncModelInWebview(webviewPanel, sharedModel);
  // Not awaited: the board should paint from the fresh model immediately, and the health
  // verdict decorates it a moment later.
  void reportBookmarkHealth(webviewPanel, sharedModel);
}

/**
 * Resetting the board also clears Recent overlays so orphaned customizations do not remain.
 */
export async function resetModel(sharedModel:LandingPageModel):Promise<void>
{
  sharedModel.groups=[];
  await restoreHiddenMru();
  await clearMruCustomisations();
  await populateVscMru(sharedModel, recentShown);
  await saveLandingPageModel(sharedModel);
  vscode.window.showInformationMessage('Model reset. Please close and reopen landingpage view.');
}

/**
 * `sharedModel` is host-owned state supplied by `extension.ts`, not model data accepted from the webview.
 */
export async function handleMessageFromWebview(message:MessageFromWebview,webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  // Refresh MRU only for commands that resolve or render model items.
  const needsMru = message.command!=='openSettings'
                && message.command!=='openLiveDemo'
                && message.command!=='cloneRepository'
                && message.command!=='openFolder';
  if (needsMru) {await populateVscMru(sharedModel, recentShown);}

  switch(message.command)
  {
    case 'documentReady':
      syncModelInWebview(webviewPanel, sharedModel);
      // Sent from here, not at panel creation: the page has no `message` listener until its
      // bundle has run, and the webview reloads whenever the tab is hidden, so anything posted
      // before this point is dropped.
      // Not awaited: the board should paint from the fresh model immediately, and the menu item
      // this gates appears a moment later. Caught because the panel can be disposed while the
      // probe is still running.
      void codeCliAvailable()
        .then(available => webviewPanel.webview.postMessage({command:'codeCliAvailable', available}))
        .catch(() => {});
      void reportBookmarkHealth(webviewPanel, sharedModel);
      break;
    case 'rename':
      let foundGoP = findItemByGuid(message.guid,sharedModel);
      if (!foundGoP) {vscode.window.showWarningMessage(`rename: no group or bookmark with guid ${message.guid}`);return;}
      const label = message.value?.trim();
      if (!label) {return;}
      foundGoP.target.label=label;
      await saveLandingPageModel(sharedModel);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'createBookmark':
      const addTo = message.guid
        ? findItemByGuid(message.guid, sharedModel)?.target as LandingPageGroup|undefined
        : await pickDestinationGroup(sharedModel, 'Add the bookmark to group');
      if (!addTo) {if (message.guid) {vscode.window.showWarningMessage(`createBookmark: no group with guid ${message.guid}`);} return;}
      const selectedFiles = await vscode.window.showOpenDialog({canSelectFiles:true, canSelectFolders:message.pickFolder,canSelectMany:true, filters:{'Workspaces':['code-workspace'],'Files':['*']}});
      if (selectedFiles)
      {
        for(let uri of selectedFiles)
        {
          let nameParts = parseUriNameParts(uri);

          const p:LandingPageProject =     {guid:crypto.randomUUID(), label:nameParts.basename, path:uri.toString()};
          if (!nameParts.ext)              {p.icon = 'folder';}
          else if (nameParts.ext==='code-workspace') {p.icon = 'workspace';}
          addTo.projects.push(p);
        }
        await saveLandingPageModel(sharedModel);
        syncModelInWebview(webviewPanel, sharedModel);
      }
      break;
    case 'createGroup':
      sharedModel.groups.splice(0,0,{guid:crypto.randomUUID(),label:'Group',projects:[]});
      await saveLandingPageModel(sharedModel);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'remove':
      let foundGoP2 = findItemByGuid(message.guid, sharedModel);

      if(foundGoP2!==null)
      {
        if(foundGoP2.ownerGroup)
        {
          let index = foundGoP2.ownerGroup.projects.indexOf(foundGoP2.target);
          if (index>=0) {foundGoP2.ownerGroup.projects.splice(index,1);}
        }
        else
        {
          foundGoP2.model.groups.splice(foundGoP2.model.groups.indexOf(foundGoP2.target as LandingPageGroup),1);
        }
        await saveLandingPageModel(sharedModel);
        syncModelInWebview(webviewPanel, sharedModel);
      }
      else {console.warn(`remove: item with guid "${message.guid}" not found.`,sharedModel);}
      break;
    case 'open':
      let projectFound = findItemByGuid(message.guid, sharedModel);
      if(projectFound!==null)
      {
        const project = projectFound.target as LandingPageProject;
        let path = project.path;
        if(path)
        {
          const asWorkspace = project.icon==='folder' || project.icon==='workspace';
          if (asWorkspace)
          {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(path), {forceNewWindow:message.newWindow===true});
          }
          else if (message.newWindow===true && await codeCliAvailable())
          {
            // `code -n <file>` opens a new window on that file. Arguments, not a shell command:
            // the path is model data, and a double-quoted shell string still interpolates
            // `$(...)` and backticks. The CLI wants a filesystem path, not the stored URI.
            execFile('code', ['-n', vscode.Uri.parse(path).fsPath], error => {
              if (error) {vscode.window.showWarningMessage(`Could not open a new window: ${error.message}`);}
            });
          }
          else
          {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(path));
          }
          return;
        }
        else
        {
          console.warn(`open: guid "${message.guid}" points to element without path!`,sharedModel);
        }
      }
      else {console.warn(`open: item with guid "${message.guid}" not found.`,sharedModel);}
      break;
    case 'patch':
      let found = findItemByGuid(message.guid,sharedModel);
      if (!found) {vscode.window.showWarningMessage(`patch: no group or bookmark with guid ${message.guid}`);return;}
      if (message.field==='shade')
      {
        // Validate shade tokens and treat the empty string as clearing the shade. Store the Recent group's shade directly and use the overlay only for generated Recent entries.
        const validShades:Array<LandingPageProject['shade']|''> = ['red','orange','yellow','green','teal','pink','purple','blue','cyan','gray','silver','brown','white','black',''];
        if (typeof message.value === 'string' && validShades.includes(message.value as LandingPageProject['shade']))
        {
          const shadeValue = message.value as LandingPageProject['shade'];
          if (!await customiseMru(message.guid,'shade',shadeValue,sharedModel)) {(found.target as {shade?:LandingPageProject['shade']}).shade=shadeValue;}
        }
      }
      else if (message.field==='layout')
      {
        const validLayouts:Array<LandingPageGroup['layout']> = ['list','grid','compact'];
        if (typeof message.value === 'string' && validLayouts.includes(message.value as LandingPageGroup['layout']))
        {
          (found.target as LandingPageGroup).layout=message.value as LandingPageGroup['layout'];
        }
      }
      else if (message.field==='pinned')
      {
        // Unpinning passes `undefined` rather than `false` so the MRU overlay entry is
        // dropped entirely instead of accumulating `pinned:false` for every entry ever
        // pinned and then unpinned.
        const pinned = message.value===true ? true : undefined;
        if (!await customiseMru(message.guid,'pinned',pinned,sharedModel)) {(found.target as LandingPageProject).pinned = pinned;}
      }
      else if (message.field==='collapsed')
      {
        // Groups only. Stored on the group object itself, including the generated `Recent`
        // group - that group is an ordinary model object and only its *children* need the
        // MRU customisation overlay.
        (found.target as LandingPageGroup).collapsed = message.value===true;
      }
      else if (message.field==='glyph')
      {
        if (!await customiseMru(message.guid,'glyph',message.value,sharedModel)) {found.target.glyph=message.value || undefined;}
      }
      else
      {
        console.warn(`patch: field not supported for key ${message.field}.`);
        break;
      }
      await saveLandingPageModel(sharedModel);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'hideRecent':
      await hideMru(message.guid);
      await populateVscMru(sharedModel, recentShown);
      await saveLandingPageModel(sharedModel);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'refreshRecents':
      // `more` asks for another page; a plain refresh rereads the list at whatever length is
      // already on screen, so refreshing never silently collapses a list the user expanded.
      if (message.more) {recentShown = (recentShown ?? recentLimit()) + recentLimit();}
      await populateVscMru(sharedModel, recentShown);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'restoreHiddenRecents':
      await restoreHiddenMru();
      await populateVscMru(sharedModel, recentShown);
      await saveLandingPageModel(sharedModel);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'unhideRecent':
      await unhideMru(message.guid);
      await populateVscMru(sharedModel, recentShown);
      await saveLandingPageModel(sharedModel);
      syncModelInWebview(webviewPanel, sharedModel);
      break;
    case 'moveGroup':
      if (moveGroup(message.guid, message.direction, message.toIndex, sharedModel))
      {
        await saveLandingPageModel(sharedModel);
        syncModelInWebview(webviewPanel, sharedModel);
      }
      break;
    case 'moveBookmark':
      if (moveBookmark(message.guid, message.toGroup, message.beforeGuid, sharedModel))
      {
        await saveLandingPageModel(sharedModel);
        syncModelInWebview(webviewPanel, sharedModel);
      }
      break;
    case 'copyPath':
      await copyPath(message.guid, sharedModel, webviewPanel);
      break;
    case 'openSettings':
      vscode.commands.executeCommand('workbench.action.openSettings', 'vsc-landingpage');
      break;
    case 'openLiveDemo':
      await openLandingPageLiveDemo();
      break;
    case 'cloneRepository':
      await cloneRepository(message.url);
      break;
    case 'openFolder':
      vscode.commands.executeCommand('workbench.action.files.openFolder');
      break;
    case 'createDirectory':
      await createDirectory(message.guid, sharedModel, webviewPanel);
      break;
    case 'moveToGroup':
      await moveToGroup(message.guid, sharedModel, webviewPanel);
      break;
    default:
      console.log('Unhandled message from webview: ',message);
      return;
  }
}
