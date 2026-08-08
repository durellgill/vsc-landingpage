import * as vscode from 'vscode';
import { findItemByGuid, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';
import { describeGroupSize } from './group-destination';
import { saveModel } from './model-storage';
import { sendMessageToWebview } from './webview-messages';

/**
 * Moves one user-created group while keeping generated Recent at the end of the board.
 *
 * Accepts either a one-step `direction` or an explicit `toIndex`. `toIndex` is the insertion
 * point the webview's drop indicator was drawn at, measured *before* the dragged group is
 * lifted out - so dragging downwards has to lose one place once the gap closes behind it.
 * That adjustment lives here rather than in the webview.
 *
 * @returns Whether the model changed. A group dropped back where it started returns false.
 */
export function moveGroup(guid:string|undefined, direction:'up'|'down'|undefined, toIndex:number|undefined, sharedModel:LandingPageModel):boolean
{
  if (!guid || guid===RECENT_GROUP_GUID) {return false;}
  const userGroups = sharedModel.groups.filter(group => group.guid!==RECENT_GROUP_GUID);
  const index = userGroups.findIndex(group => group.guid===guid);
  if (index<0) {return false;}

  if (typeof toIndex==='number')
  {
    const insertAt = Math.max(0, Math.min(userGroups.length-1, toIndex>index ? toIndex-1 : toIndex));
    if (insertAt===index) {return false;} //dropped back where it started
    const [moved] = userGroups.splice(index,1);
    userGroups.splice(insertAt,0,moved);
  }
  else
  {
    const targetIndex = direction==='up' ? index-1 : direction==='down' ? index+1 : -1;
    if (targetIndex<0 || targetIndex>=userGroups.length) {return false;}
    [userGroups[index], userGroups[targetIndex]] = [userGroups[targetIndex], userGroups[index]];
  }

  const generatedGroups = sharedModel.groups.filter(group => group.guid===RECENT_GROUP_GUID);
  sharedModel.groups = [...userGroups, ...generatedGroups];
  saveModel(sharedModel);
  return true;
}

/**
 * Lands a dragged bookmark: into another group, or at a new position within its own.
 *
 * Three rules the caller does not have to know about:
 *
 * - **Recent is a source, never a destination.** `@vsc-mru` is regenerated from VS Code's
 *   history on almost every message, so anything moved into it would vanish on the next sync
 *   and anything moved *out* of it would come straight back. A bookmark dragged out of Recent
 *   is therefore copied, exactly as {@link moveToGroup} already does from its menu.
 * - **`beforeGuid` names the landing point, not an index.** The webview renders pinned
 *   bookmarks first, so a rendered position does not correspond to a stored one. The index is
 *   resolved here, against the destination array *after* the bookmark has been lifted out, so
 *   moving one downwards inside its own group does not lose a place as the gap closes.
 * - **A drop that changes nothing is not a write.** Returning false leaves the model and the
 *   stored copy untouched rather than resyncing the board for no reason.
 *
 * @returns Whether the model changed and needs saving.
 */
export function moveBookmark(guid:string|undefined, toGroup:string|undefined, beforeGuid:string|undefined, sharedModel:LandingPageModel):boolean
{
  const found = findItemByGuid(guid, sharedModel);
  if (!found || !found.ownerGroup) {return false;} //not a bookmark
  const destination = sharedModel.groups.find(group => group.guid===toGroup);
  if (!destination || destination.guid===RECENT_GROUP_GUID) {return false;}

  const project = found.target as LandingPageProject;
  const source = found.ownerGroup;

  if (source.guid===RECENT_GROUP_GUID)
  {
    const clone:LandingPageProject = JSON.parse(JSON.stringify(project));
    clone.guid = crypto.randomUUID();
    const at = beforeGuid ? destination.projects.findIndex(p => p.guid===beforeGuid) : -1;
    destination.projects.splice(at<0 ? destination.projects.length : at, 0, clone);
    return true;
  }

  const from = source.projects.indexOf(project);
  source.projects.splice(from,1);
  const at = beforeGuid ? destination.projects.findIndex(p => p.guid===beforeGuid) : -1;
  const insertAt = at<0 ? destination.projects.length : at;
  destination.projects.splice(insertAt,0,project);
  return !(source===destination && insertAt===from); //dropped back where it started
}

/**
 * Moves a bookmark into another group, chosen from a native quick pick.
 *
 * This is the keyboard-reachable route that drag and drop does not offer, and the sane one on
 * a long board where the destination is off screen. Bookmarks in the generated `Recent` group
 * are copied rather than moved, since that list is rebuilt from VS Code's history on every
 * render and anything removed from it would simply reappear.
 *
 * @param guid Bookmark to move.
 * @param sharedModel Current model.
 * @param webviewPanel Panel to refresh afterwards.
 */
export async function moveToGroup(guid:string|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel):Promise<void>
{
  const found = findItemByGuid(guid, sharedModel);
  if (!found || !found.ownerGroup)
  {
    vscode.window.showWarningMessage('Select a bookmark to move.');
    return;
  }

  const project = found.target as LandingPageProject;
  const sourceGroup = found.ownerGroup;
  const isCopy = sourceGroup.guid===RECENT_GROUP_GUID;

  const targets = sharedModel.groups.filter(g => g.guid!==RECENT_GROUP_GUID && g!==sourceGroup);
  if (targets.length===0)
  {
    vscode.window.showInformationMessage('There are no other groups yet. Create one first with "New group".');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    targets.map(g => ({label:g.label || 'Group', description:describeGroupSize(g), guid:g.guid})),
    {title:`${isCopy?'Copy':'Move'} "${project.label}" to group`, placeHolder:'Choose a group'}
  );
  if (!picked) {return;} //cancelled

  const destination = sharedModel.groups.find(g => g.guid===picked.guid);
  if (!destination) {return;}

  if (isCopy)
  {
    const clone:LandingPageProject = JSON.parse(JSON.stringify(project));
    clone.guid = crypto.randomUUID();
    destination.projects.push(clone);
  }
  else
  {
    sourceGroup.projects.splice(sourceGroup.projects.indexOf(project),1);
    destination.projects.push(project);
  }

  saveModel(sharedModel);
  sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
}
