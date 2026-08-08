import * as vscode from 'vscode';
import { findItemByGuid, LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { parseUriNameParts } from './uri-name-parts';
import { MessageFromWebview, sendMessageToWebview, syncModelInWebview } from './webview-messages';
import { saveLandingPageModel } from './model-storage';
import { reportBookmarkHealth } from './bookmark-health';
import {
  RECENT_GROUP_GUID, clearMruCustomisations, customiseMru, hideMru, populateVscMru, restoreHiddenMru,
} from './recent-mru-overlay';
import { pickDestinationGroup } from './group-destination';
import { moveBookmark, moveGroup, moveToGroup } from './bookmark-moves';
import { createDirectory } from './bookmark-creation';
import { copyPath } from './clipboard-path';
import { cloneRepository } from './clone-repository';

// The extension host's message bridge. Everything the page can ask for arrives at
// `handleMessageFromWebview` below and is dispatched into one of the modules imported above;
// this file deliberately owns the dispatch and little else, so each case reads as one hop to
// the real implementation.
export { registerExtensionContext } from './model-storage';
export { syncModelInWebview } from './webview-messages';
export { bookmarkUris } from './bookmark-creation';
export { cloneRepository } from './clone-repository';

/**
 * Rereads VS Code's recently-opened list and pushes the result to the page.
 *
 * The `Recent` group is a mirror of state the page has no way to observe. Opening a project
 * in another window, or removing one from VS Code's own history, leaves this page showing a
 * list that was correct when the panel was created and has been wrong ever since. There are
 * three ways in: the refresh control on the Recent group, the panel regaining visibility, and
 * the *Landing Page: Refresh Recent* palette command.
 *
 * `forceRebuild` is required because the DOM sync is keyed by GUID, and MRU GUIDs are derived
 * from the target path - a reordered history changes positions without changing keys.
 *
 * @param webviewPanel Panel to update.
 * @param sharedModel Model whose `@vsc-mru` group is rebuilt in place.
 */
export async function refreshRecents(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  await populateVscMru(sharedModel);
  sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
  // Not awaited: the board should paint from the fresh model immediately, and the health
  // verdict decorates it a moment later.
  void reportBookmarkHealth(webviewPanel, sharedModel);
}

/**
 * Removes content from given model instance, saves changes and shows a reload request message.
 *
 * Clears the Recent overlays too, which would otherwise be left behind keyed to entries the
 * board no longer has.
 * @param sharedModel Model to reset.
 */
export async function resetModel(sharedModel:LandingPageModel):Promise<void>
{
  sharedModel.groups=[];
  await restoreHiddenMru();
  await clearMruCustomisations();
  await populateVscMru(sharedModel);
  await saveLandingPageModel(sharedModel);
  vscode.window.showInformationMessage('Model reset. Please close and reopen landingpage view.');
}

/**
 * Called when the webview page sends a command or request to the extension.
 * @param message Info package received from the page.
 * @param webviewPanel Renderer instance.
 * @param sharedModel Model from webview, which contains current state of the landingpage configuration. Note that this model is not received from the webview, but from `extension.ts`.
 */
export async function handleMessageFromWebview(message:MessageFromWebview,webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  // Refreshing the MRU list runs a VS Code command and rewrites the `Recent` group, so only
  // do it for messages that actually resolve or render model items. Previously this ran for
  // every message, including commands that do not read or render model items.
  const needsMru = message.command!=='openSettings'
                && message.command!=='cloneRepository'
                && message.command!=='openFolder';
  if (needsMru) {await populateVscMru(sharedModel);}

  switch(message.command)
  {
    case 'documentReady':
      syncModelInWebview(webviewPanel, sharedModel);
      void reportBookmarkHealth(webviewPanel, sharedModel);
      break;
    case 'rename': // guid: ID of model element to rename
      let foundGoP = findItemByGuid(message.guid,sharedModel);
      if (!foundGoP) {vscode.window.showWarningMessage(`rename: no group or bookmark with guid ${message.guid}`);return;}
      const label = message.value?.trim();
      if (!label) {return;}
      foundGoP.target.label=label;
      await saveLandingPageModel(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      break;
    case 'createBookmark':  //{guid: groupGUID to add bookmark into, pickFolder:bool show folder or file picker?}
      // No guid means the page-level create menu was used, which names no destination group.
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
          //else: unknown file type

          addTo.projects.push(p);
        }
        await saveLandingPageModel(sharedModel);
        sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      }
      break;
    case 'createGroup':
      sharedModel.groups.splice(0,0,{guid:crypto.randomUUID(),label:'Group',projects:[]});
      await saveLandingPageModel(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      break;
    case 'remove':  //{guid: item to remove}
      let foundGoP2 = findItemByGuid(message.guid, sharedModel);

      if(foundGoP2!==null)
      {
        if(foundGoP2.ownerGroup) //project in group
        {
          let index = foundGoP2.ownerGroup.projects.indexOf(foundGoP2.target);
          if (index>=0) {foundGoP2.ownerGroup.projects.splice(index,1);}
        }
        else //group in model
        {
          foundGoP2.model.groups.splice(foundGoP2.model.groups.indexOf(foundGoP2.target as LandingPageGroup),1);
        }
        await saveLandingPageModel(sharedModel);
        sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      }
      else {console.warn(`remove: item with guid "${message.guid}" not found.`,sharedModel);}
      break;
    case 'open': // {guid: item with path to open}
      let projectFound = findItemByGuid(message.guid, sharedModel);
      if(projectFound!==null)
      {
        const project = projectFound.target as LandingPageProject;
        let path = project.path;
        if(path)
        {
          // Folders and .code-workspace files are opened as a workspace; anything else is a
          // plain file and must use `vscode.open` - `vscode.openFolder` on a file does not
          // open the file, it tries to treat it as a workspace root.
          const asWorkspace = project.icon==='folder' || project.icon==='workspace';
          // `forceNewWindow` only exists on `vscode.openFolder`. A plain file has no new-window
          // form - `vscode.open` opens an editor in the current window - so the flag is simply
          // not offered for files, rather than silently ignored.
          if (asWorkspace)
          {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(path), {forceNewWindow:message.newWindow===true}); //https://code.visualstudio.com/api/references/commands
          }
          else
          {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(path));
          }
          return;
        }
        else //group in model > cannot open group
        {
          console.warn(`open: guid "${message.guid}" points to element without path!`,sharedModel);
        }
      }
      else {console.warn(`open: item with guid "${message.guid}" not found.`,sharedModel);}
      break;
    case 'patch': // {guid: item to patch, field: field to patch('shade' or 'layout'), value: new value}
      let found = findItemByGuid(message.guid,sharedModel);
      if (!found) {vscode.window.showWarningMessage(`patch: no group or bookmark with guid ${message.guid}`);return;}
      if (message.field==='shade')
      {
        // Both bookmarks and user-created groups support an accent colour. Groups use it
        // only in their heading treatment; bookmarks use it in their spine and icon.
        // The `Recent` group itself is an ordinary model object and keeps its shade
        // directly; its generated entries need the overlay.
        if (!await customiseMru(message.guid,'shade',message.value,sharedModel)) {found.target.shade=message.value;}
      }
      else if (message.field==='layout')
      {
        (found.target as LandingPageGroup).layout=message.value;
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
        // Empty value clears the custom icon and falls back to the item's type/default icon.
        if (!await customiseMru(message.guid,'glyph',message.value,sharedModel)) {found.target.glyph=message.value || undefined;}
      }
      else
      {
        console.warn(`patch: field not supported for key ${message.field}.`);
        break;
      }
      // The page renders from the model rather than mutating individual DOM nodes. Every saved
      // patch must therefore return the updated model to the webview.
      await saveLandingPageModel(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      break;
    case 'hideRecent':
      await hideMru(message.guid);
      await populateVscMru(sharedModel);
      await saveLandingPageModel(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      break;
    case 'refreshRecents':
      // populateVscMru() already ran above for this command, so the model is current; all
      // that is left is to hand it back with the rebuild flag set.
      sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      break;
    case 'restoreHiddenRecents':
      await restoreHiddenMru();
      await populateVscMru(sharedModel);
      await saveLandingPageModel(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      break;
    case 'moveGroup':
      if (moveGroup(message.guid, message.direction, message.toIndex, sharedModel))
      {
        await saveLandingPageModel(sharedModel);
        sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      }
      break;
    case 'moveBookmark': // {guid: bookmark dragged, toGroup: destination, beforeGuid: bookmark it lands in front of}
      if (moveBookmark(message.guid, message.toGroup, message.beforeGuid, sharedModel))
      {
        // forceRebuild: the DOM sync is keyed by GUID, and an insertion moves every card after
        // it without changing any key.
        await saveLandingPageModel(sharedModel);
        sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      }
      break;
    case 'copyPath': // {guid: bookmark whose target path should go to the clipboard}
      await copyPath(message.guid, sharedModel, webviewPanel);
      break;
    case 'openSettings':
      vscode.commands.executeCommand('workbench.action.openSettings', 'vsc-landingpage');
      break;
    case 'cloneRepository': // {url?: repository url typed in the webview}
      await cloneRepository(message.url);
      break;
    case 'openFolder':
      vscode.commands.executeCommand('workbench.action.files.openFolder');
      break;
    case 'createDirectory': // {guid: groupGUID to add the new folder into}
      await createDirectory(message.guid, sharedModel, webviewPanel);
      break;
    case 'moveToGroup': // {guid: bookmark to move}
      await moveToGroup(message.guid, sharedModel, webviewPanel);
      break;
    default:
      console.log('Unhandled message from webview: ',message);
      return;
  }
}
