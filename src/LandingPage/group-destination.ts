import * as vscode from 'vscode';
import { LandingPageGroup, LandingPageModel } from './LandingPageModel';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';

/**
 * The group a page-level create lands in when the user was not asked to choose.
 *
 * The first user-created group, or a new one if the board has none. Never the generated
 * `Recent` group, which is rebuilt from VS Code's history and would discard the bookmark.
 *
 * Callers must resolve this only *after* whatever irreversible step they are doing has
 * succeeded: this can append a group to the model, so calling it first leaves a stray empty
 * group behind when the create fails.
 *
 * @param sharedModel Model to resolve against; a group is appended to it when there is none.
 * @returns A group that can receive a bookmark.
 */
export function defaultGroup(sharedModel:LandingPageModel):LandingPageGroup
{
  const existing = sharedModel.groups.find(group => group.guid!==RECENT_GROUP_GUID);
  if (existing) {return existing;}

  const created:LandingPageGroup = {guid:crypto.randomUUID(), label:'Group', projects:[]};
  sharedModel.groups.splice(0,0,created);
  return created;
}

/**
 * Asks the user which group an item should land in, with a native quick pick.
 *
 * Used by the page-level create actions, which - unlike the group composer - have no
 * destination implied by where they were clicked. Skipped when only one group exists.
 * @param sharedModel Model to choose a group from.
 * @param title Dialog title describing what is being placed.
 * @returns The chosen group, or undefined if there are none or the user cancelled.
 */
export async function pickDestinationGroup(sharedModel:LandingPageModel, title:string):Promise<LandingPageGroup|undefined>
{
  const targets = sharedModel.groups.filter(g => g.guid!==RECENT_GROUP_GUID);
  if (targets.length===0)
  {
    vscode.window.showInformationMessage('There are no groups yet. Create one first with "New group".');
    return undefined;
  }
  if (targets.length===1) {return targets[0];} //nothing to choose between

  const picked = await vscode.window.showQuickPick(
    targets.map(g => ({label:g.label || 'Group', description:describeGroupSize(g), guid:g.guid})),
    {title, placeHolder:'Choose a group'}
  );
  return picked ? sharedModel.groups.find(g => g.guid===picked.guid) : undefined;
}

/**
 * The bookmark count shown beside a group in every destination quick pick, i.e. "3 bookmarks".
 * @param group Group to describe.
 */
export function describeGroupSize(group:LandingPageGroup):string
{
  return `${group.projects.length} bookmark${group.projects.length===1?'':'s'}`;
}
