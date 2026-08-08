import * as vscode from 'vscode';
import { findItemByGuid, LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { parseUriNameParts } from './uri-name-parts';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';
import { defaultGroup, describeGroupSize } from './group-destination';
import { saveLandingPageModel } from './model-storage';
import { syncModelInWebview } from './webview-messages';

/**
 * Builds a bookmark for one file, folder or workspace URI.
 *
 * The item type is resolved by stat-ing the URI rather than by looking at the extension,
 * because {@link parseUriNameParts} cannot tell a folder named `my.app` from a file.
 *
 * @param uri Target to bookmark.
 * @returns Bookmark ready to be pushed into a group.
 */
async function makeBookmark(uri:vscode.Uri):Promise<LandingPageProject>
{
  const nameParts = parseUriNameParts(uri);
  const project:LandingPageProject = {guid:crypto.randomUUID(), label:nameParts.basename, path:uri.toString()};

  let isDirectory = false;
  try
  {
    isDirectory = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
  }
  catch
  {
    // Unreadable or gone: fall back to the extension heuristic used by the add flow.
    isDirectory = !nameParts.ext;
  }

  if (isDirectory) {project.icon='folder';}
  else if (nameParts.ext==='code-workspace') {project.icon='workspace';}
  //else: plain file, default icon

  return project;
}

/**
 * Bookmarks files or folders picked outside the webview, i.e. from the Explorer context menu.
 *
 * The destination group is chosen from a quick pick, which also offers creating a new group,
 * so this works even when there is no group yet and when the landing page has never been
 * opened in this window. The generated `Recent` group is never a destination - it is rebuilt
 * from VS Code's history on every render.
 *
 * This is the one deliberate exception to "text entry stays in the webview": the action is
 * initiated from the Explorer, so there is no page to type into.
 *
 * @param uris Targets to bookmark. Empty or undefined aborts.
 * @param sharedModel Current model.
 * @param webviewPanel Panel to refresh, or null when the landing page is not open.
 */
export async function bookmarkUris(uris:vscode.Uri[]|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel|null):Promise<void>
{
  if (!uris || uris.length===0)
  {
    vscode.window.showWarningMessage('Select a file or folder to bookmark.');
    return;
  }

  const NEW_GROUP = '@new-group';
  const targets = sharedModel.groups.filter(g => g.guid!==RECENT_GROUP_GUID);
  const items = [
    ...targets.map(g => ({label:g.label || 'Group', description:describeGroupSize(g), guid:g.guid})),
    {label:'$(add) New group...', description:'Create a group for these bookmarks', guid:NEW_GROUP}
  ];

  const what = uris.length===1 ? `"${parseUriNameParts(uris[0]).basename}"` : `${uris.length} items`;
  const picked = await vscode.window.showQuickPick(items, {title:`Add ${what} to group`, placeHolder:'Choose a group'});
  if (!picked) {return;} //cancelled

  let destination:LandingPageGroup|undefined;
  if (picked.guid===NEW_GROUP)
  {
    const label = await vscode.window.showInputBox({title:'New group', prompt:'Name for the new group', value:'Group'});
    if (label===undefined) {return;} //cancelled
    destination = {guid:crypto.randomUUID(), label:label.trim() || 'Group', projects:[]};
    sharedModel.groups.splice(0,0,destination);
  }
  else
  {
    destination = sharedModel.groups.find(g => g.guid===picked.guid);
  }
  if (!destination) {return;}

  for (const uri of uris)
  {
    destination.projects.push(await makeBookmark(uri));
  }

  await saveLandingPageModel(sharedModel);
  if (webviewPanel)
  {
    syncModelInWebview(webviewPanel, sharedModel);
  }
  else
  {
    vscode.window.showInformationMessage(`Added ${uris.length===1?'1 bookmark':`${uris.length} bookmarks`} to "${destination.label}".`);
  }
}

/**
 * Creates a new directory on disk and bookmarks it into the given group.
 *
 * Uses the native save dialog rather than an open dialog plus an input box: the save sheet
 * is the only native picker that lets the user both browse to a parent folder and type the
 * new folder's name in one step, which keeps text entry out of `showInputBox` as the page
 * conventions require.
 * @param groupGuid Group that should receive the bookmark.
 * @param sharedModel Model to update.
 * @param webviewPanel Panel to resync.
 */
export async function createDirectory(groupGuid:string|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel):Promise<void>
{
  // The dialog comes first, deliberately. This action is about making a folder on disk;
  // being asked which group to file it under before anything has been created is a question
  // about bookmarking, asked before the user has said what they are bookmarking. So the
  // native picker opens straight away and the destination is resolved afterwards, without a
  // prompt - the group header's own Add button is how you choose a destination explicitly.
  const target = await vscode.window.showSaveDialog({title:'Create a new folder', saveLabel:'Create folder'});
  if (!target) {return;}

  try
  {
    await vscode.workspace.fs.createDirectory(target);
  }
  catch (err:any)
  {
    vscode.window.showErrorMessage(`Could not create folder: ${err?.message ?? err}`);
    return;
  }

  // Resolved only once the folder exists. `defaultGroup()` can append a group to the model,
  // and doing that before the create could leave a stray empty group behind on failure.
  const destination = (groupGuid ? findItemByGuid(groupGuid, sharedModel)?.target as LandingPageGroup|undefined : undefined)
    ?? defaultGroup(sharedModel);

  const nameParts = parseUriNameParts(target);
  destination.projects.push({guid:crypto.randomUUID(), label:nameParts.basename, path:target.toString(), icon:'folder'});
  await saveLandingPageModel(sharedModel);
  syncModelInWebview(webviewPanel, sharedModel);

  const open = await vscode.window.showInformationMessage(`Created ${nameParts.basename} in "${destination.label}".`, 'Open folder');
  if (open) {vscode.commands.executeCommand('vscode.openFolder', target, {forceNewWindow:false});}
}
