import { findItemByGuid, LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { importVscRecentList, recentLimit } from './history';
import { extensionGlobalState } from './model-storage';
import { targetExists } from './bookmark-health';

export const RECENT_GROUP_GUID = '@vsc-mru';

const HIDDEN_MRU_KEY = 'landingPageHiddenMruGuids';
const MRU_CUSTOM_KEY = 'landingPageMruCustomisations';

/**
 * Stores only user-editable fields; path and target type always come from VS Code.
 */
interface MruCustomisation
{
  shade?:LandingPageProject['shade'];
  glyph?:string;
  pinned?:boolean;
}

function hiddenMruGuids():Set<string>
{
  return new Set(extensionGlobalState().get<string[]>(HIDDEN_MRU_KEY, []));
}

function mruCustomisations():Record<string,MruCustomisation>
{
  return extensionGlobalState().get<Record<string,MruCustomisation>>(MRU_CUSTOM_KEY, {});
}

/**
 * Updates durable overlay state and the live model. An empty value removes the override.
 */
export async function customiseMru(guid:string|undefined, field:keyof MruCustomisation, value:any, sharedModel:LandingPageModel):Promise<boolean>
{
  if (!guid?.startsWith('MRU:')) {return false;}

  const all = {...mruCustomisations()};
  const entry = {...(all[guid] ?? {})};
  if (value===undefined || value===null || value==='') {delete entry[field];}
  else {(entry as any)[field] = value;}

  if (Object.keys(entry).length===0) {delete all[guid];}
  else {all[guid] = entry;}
  await extensionGlobalState().update(MRU_CUSTOM_KEY, all);

  const found = findItemByGuid(guid, sharedModel);
  if (found) {applyMruCustomisation(found.target as LandingPageProject, entry);}
  return true;
}

function applyMruCustomisation(project:LandingPageProject, custom:MruCustomisation|undefined):void
{
  if (!custom) {return;}
  if (custom.shade) {project.shade = custom.shade;}
  if (custom.glyph) {project.glyph = custom.glyph;}
  if (custom.pinned) {project.pinned = true;}
}

export async function hideMru(guid:string|undefined):Promise<void>
{
  if (!guid?.startsWith('MRU:')) {return;}
  const hidden = hiddenMruGuids();
  hidden.add(guid);
  await extensionGlobalState().update(HIDDEN_MRU_KEY, [...hidden]);
}

export async function restoreHiddenMru():Promise<void>
{
  await extensionGlobalState().update(HIDDEN_MRU_KEY, []);
}

/**
 * Drops every stored `Recent` customisation. Used when resetting the model, which otherwise
 * would leave orphaned overlay entries behind after clearing the board.
 */
export async function clearMruCustomisations():Promise<void>
{
  await extensionGlobalState().update(MRU_CUSTOM_KEY, {});
}

export async function populateVscMru(sharedModel:LandingPageModel):Promise<void>
{
  let mruFound = findItemByGuid(RECENT_GROUP_GUID,sharedModel);
  let mruGroup:LandingPageGroup;
  if(mruFound)
  {
    mruGroup=mruFound.target as LandingPageGroup;
  }
  else
  {
    mruGroup={guid:RECENT_GROUP_GUID,label:'Recent',projects:[], layout:'list'};
    sharedModel.groups.push(mruGroup);
  }
  const hidden = hiddenMruGuids();
  const custom = mruCustomisations();
  const candidates = (await importVscRecentList()).filter(project => !hidden.has(project.guid));
  const freshProjects = await takeExisting(candidates, recentLimit());
  for(const project of freshProjects) {applyMruCustomisation(project, custom[project.guid]);}
  mruGroup.projects=freshProjects;
}

/**
 * Removes hidden and missing entries before applying the visible limit. Stats candidates in batches only until the quota is filled.
 */
export async function takeExisting(projects:LandingPageProject[], limit:number):Promise<LandingPageProject[]>
{
  const kept:LandingPageProject[] = [];
  // Batch at least ten candidates so a run of missing entries does not require one round trip per entry.
  const batchSize = Math.max(limit || 0, 10);

  for (let start=0; start<projects.length; start+=batchSize)
  {
    const batch = projects.slice(start, start+batchSize);
    const alive = await Promise.all(batch.map(project => targetExists(project)));

    for (let index=0; index<batch.length; index++)
    {
      if (alive[index]) {kept.push(batch[index]);}
      if (limit>0 && kept.length>=limit) {return kept;}
    }
  }
  return kept;
}
