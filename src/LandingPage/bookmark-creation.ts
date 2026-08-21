import * as vscode from 'vscode';
import { LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { parseUriNameParts } from './uri-name-parts';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';
import { describeGroupSize } from './group-destination';
import { saveLandingPageModel } from './model-storage';
import { syncModelInWebview } from './webview-messages';

export function createdDirectoryBookmarkGroup(groupGuid:string|undefined, sharedModel:LandingPageModel):LandingPageGroup|undefined
{
  return groupGuid ? sharedModel.groups.find(group => group.guid===groupGuid) : undefined;
}

/**
 * Determines the target type with `stat`; an extension cannot distinguish a dotted folder from a file.
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
    // If the URI cannot be stat-ed, fall back to the add flow's extension heuristic.
    isDirectory = !nameParts.ext;
  }

  if (isDirectory) {project.icon='folder';}
  else if (nameParts.ext==='code-workspace') {project.icon='workspace';}
  return project;
}

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
  if (!picked) {return;}

  let destination:LandingPageGroup|undefined;
  if (picked.guid===NEW_GROUP)
  {
    const label = await vscode.window.showInputBox({title:'New group', prompt:'Name for the new group', value:'Group'});
    if (label===undefined) {return;}
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

export async function createDirectory(groupGuid:string|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel):Promise<void>
{
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

  if (!groupGuid)
  {
    await vscode.commands.executeCommand('vscode.openFolder', target, {forceNewWindow:false});
    return;
  }

  const destination = createdDirectoryBookmarkGroup(groupGuid, sharedModel);
  if (!destination)
  {
    vscode.window.showWarningMessage('Created the folder, but its destination group no longer exists.');
    return;
  }

  const nameParts = parseUriNameParts(target);
  destination.projects.push({guid:crypto.randomUUID(), label:nameParts.basename, path:target.toString(), icon:'folder'});
  await saveLandingPageModel(sharedModel);
  syncModelInWebview(webviewPanel, sharedModel);

  const open = await vscode.window.showInformationMessage(`Created ${nameParts.basename} in "${destination.label}".`, 'Open folder');
  if (open) {vscode.commands.executeCommand('vscode.openFolder', target, {forceNewWindow:false});}
}
