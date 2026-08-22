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

export function hiddenMruEntries(all: LandingPageProject[]): LandingPageProject[]
{
  const hidden = hiddenMruGuids();
  return all.filter(project => hidden.has(project.guid));
}

export async function unhideMru(guid: string|undefined): Promise<void>
{
  if (!guid?.startsWith('MRU:')) {return;}
  const hidden = hiddenMruGuids();
  hidden.delete(guid);
  await extensionGlobalState().update(HIDDEN_MRU_KEY, [...hidden]);
}

/**
 * Drops every stored `Recent` customisation. Used when resetting the model, which otherwise
 * would leave orphaned overlay entries behind after clearing the board.
 */
export async function clearMruCustomisations():Promise<void>
{
  await extensionGlobalState().update(MRU_CUSTOM_KEY, {});
}

export interface RecentPageResult {
  projects: LandingPageProject[];
  hasMore: boolean;
}

/**
 * Trims a probed survivor list down to one page, and reports whether another page follows.
 *
 * `Show more` has to decide whether to offer itself before it can be drawn, and the only honest
 * way to know is to have looked one entry further than it means to show. So the caller asks
 * `takeExisting` for `limit + 1` survivors and hands the result here, and this drops the extra.
 *
 * The tempting shortcut - "did we fill the quota?" - is wrong. A history holding exactly `limit`
 * survivors fills it and has nothing behind it, and the button would reveal nothing at all. Only
 * the probe entry distinguishes those two cases.
 *
 * A limit of 0 is the documented way to ask for everything, so nothing is dropped and no further
 * page is ever offered.
 */
export function recentPage(projects:LandingPageProject[], limit:number):RecentPageResult
{
  if (limit<=0) {return {projects, hasMore:false};}
  return {projects: projects.slice(0, limit), hasMore: projects.length>limit};
}

/**
 * @param shown How many entries to show, when the page has asked for more than the configured
 * cap. Session-only: it is never persisted, so a reload returns to `maxRecentItems` rather than
 * quietly competing with that setting.
 */
export async function populateVscMru(sharedModel:LandingPageModel, shown?:number):Promise<void>
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
  const allHistory = await importVscRecentList();
  const candidates = allHistory.filter(project => !hidden.has(project.guid));
  // One past the limit, so `recentPage` can tell "exactly full" from "there is more behind this".
  const limit = shown ?? recentLimit();
  const probed = await takeExisting(candidates, limit>0 ? limit+1 : 0);
  const page = recentPage(probed, limit);
  for(const project of page.projects) {applyMruCustomisation(project, custom[project.guid]);}
  mruGroup.projects=page.projects;
  mruGroup.hasMore=page.hasMore;
  mruGroup.hidden = hiddenMruEntries(allHistory);
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
