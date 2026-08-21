import * as vscode from 'vscode';
import { findItemByGuid, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';
import { describeGroupSize } from './group-destination';
import { saveLandingPageModel } from './model-storage';
import { syncModelInWebview } from './webview-messages';

export function moveGroup(guid:string|undefined, direction:'up'|'down'|undefined, toIndex:number|undefined, sharedModel:LandingPageModel):boolean
{
  if (!guid || guid===RECENT_GROUP_GUID) {return false;}
  const userGroups = sharedModel.groups.filter(group => group.guid!==RECENT_GROUP_GUID);
  const index = userGroups.findIndex(group => group.guid===guid);
  if (index<0) {return false;}

  if (typeof toIndex==='number')
  {
    const insertAt = Math.max(0, Math.min(userGroups.length-1, toIndex>index ? toIndex-1 : toIndex));
    if (insertAt===index) {return false;}
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
  return true;
}

export function moveBookmark(guid:string|undefined, toGroup:string|undefined, beforeGuid:string|undefined, sharedModel:LandingPageModel):boolean
{
  const found = findItemByGuid(guid, sharedModel);
  if (!found || !found.ownerGroup) {return false;}
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
  return !(source===destination && insertAt===from);
}

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
  if (!picked) {return;}

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

  await saveLandingPageModel(sharedModel);
  syncModelInWebview(webviewPanel, sharedModel);
}
