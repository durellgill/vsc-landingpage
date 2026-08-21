import * as vscode from 'vscode';
import { LandingPageGroup, LandingPageModel } from './LandingPageModel';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';

export async function pickDestinationGroup(sharedModel:LandingPageModel, title:string):Promise<LandingPageGroup|undefined>
{
  const targets = sharedModel.groups.filter(g => g.guid!==RECENT_GROUP_GUID);
  if (targets.length===0)
  {
    vscode.window.showInformationMessage('There are no groups yet. Create one first with "New group".');
    return undefined;
  }
  if (targets.length===1) {return targets[0];}

  const picked = await vscode.window.showQuickPick(
    targets.map(g => ({label:g.label || 'Group', description:describeGroupSize(g), guid:g.guid})),
    {title, placeHolder:'Choose a group'}
  );
  return picked ? sharedModel.groups.find(g => g.guid===picked.guid) : undefined;
}

export function describeGroupSize(group:LandingPageGroup):string
{
  return `${group.projects.length} bookmark${group.projects.length===1?'':'s'}`;
}
