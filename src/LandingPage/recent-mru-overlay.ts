import { findItemByGuid, LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { importVscRecentList, recentLimit } from './history';
import { extensionGlobalState } from './model-storage';
import { targetExists } from './bookmark-health';

/**
 * The generated group holding VS Code's recently-opened list. Sealed: its entries mirror
 * history and cannot be edited or removed, only hidden locally.
 */
export const RECENT_GROUP_GUID = '@vsc-mru';

const HIDDEN_MRU_KEY = 'landingPageHiddenMruGuids';
const MRU_CUSTOM_KEY = 'landingPageMruCustomisations';

/**
 * Per-entry customisation for a generated `Recent` bookmark.
 *
 * Only the fields a user can actually change are stored. `path` and `icon` always come
 * from VS Code, never from here.
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

/**
 * Reads the stored customisations for generated `Recent` bookmarks, keyed by MRU GUID.
 *
 * The `Recent` group's projects are rebuilt from VS Code's history on essentially every
 * message, so anything a user sets on one of them cannot live on the project object - the
 * next rebuild throws that object away. This overlay is the durable home for it.
 */
function mruCustomisations():Record<string,MruCustomisation>
{
  return extensionGlobalState().get<Record<string,MruCustomisation>>(MRU_CUSTOM_KEY, {});
}

/**
 * Records one customisation field for a generated `Recent` bookmark and applies it to the
 * live model so the reply to the webview already reflects it.
 *
 * @param guid MRU GUID of the entry, as produced by `history.ts`.
 * @param field Which user-editable field changed.
 * @param value New value. An empty value clears the field and falls back to VS Code's.
 * @param sharedModel Model to apply the change to.
 * @returns True if the GUID belonged to an MRU entry and was handled here.
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

/**
 * Overlays a stored customisation onto a freshly imported `Recent` bookmark.
 * @param project Project built from VS Code's history.
 * @param custom Stored customisation, if any.
 */
function applyMruCustomisation(project:LandingPageProject, custom:MruCustomisation|undefined):void
{
  if (!custom) {return;}
  if (custom.shade) {project.shade = custom.shade;}
  if (custom.glyph) {project.glyph = custom.glyph;}
  if (custom.pinned) {project.pinned = true;}
}

/**
 * Hides one generated `Recent` entry from this page.
 *
 * Hidden, never removed: the entry lives in VS Code's own history, which this extension has
 * no business editing. The Recent group's menu restores every hidden entry.
 */
export async function hideMru(guid:string|undefined):Promise<void>
{
  if (!guid?.startsWith('MRU:')) {return;}
  const hidden = hiddenMruGuids();
  hidden.add(guid);
  await extensionGlobalState().update(HIDDEN_MRU_KEY, [...hidden]);
}

/** Unhides every locally hidden `Recent` entry. */
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

/**
 * Loads the most recently used (mru) entries from Visual Studio Code itself
 * as bookmarks in the landingpage model.
 *
 * These bookmarks have limited interaction options as they are managed via VS Code and
 * therefore updated automatically. Their *targets* cannot be edited, but their appearance
 * can: colour, icon and label are stored per entry in {@link mruCustomisations} and
 * re-applied here after every rebuild. Storing them on the project objects instead does not
 * work - this function replaces those objects wholesale on nearly every message.
 *
 * The mru bookmarks are basically modelled similar to custom bookmarks, but they
 * are stored inside a {@link LandingPageGroup} with `guid`={@link RECENT_GROUP_GUID}. This
 * guid is used to identify these "sealed" items in the frontend.
 *
 * @param sharedModel Model to inject mru bookmarks into.
 */
export async function populateVscMru(sharedModel:LandingPageModel):Promise<void>
{
  let mruFound = findItemByGuid(RECENT_GROUP_GUID,sharedModel);
  let mruGroup:LandingPageGroup;
  if(mruFound) //MRU list already yet in model -> use that
  {
    mruGroup=mruFound.target as LandingPageGroup;
  }
  else //MRU list not yet in model -> create now
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
 * Takes the first `limit` entries whose target still exists on disk.
 *
 * `maxRecentItems` is a count of what the user actually sees, so both exclusions - hidden
 * entries and vanished targets - have to be applied before the cap, and the list has to be
 * walked further down to make up the difference. Capping first meant hiding five entries left
 * fifteen on screen, and the group's count badge disagreed with the list.
 *
 * VS Code's history runs to hundreds of entries, so this stats in batches and stops as soon
 * as the quota is filled: the common case checks barely more than `limit` paths, not the
 * whole history.
 *
 * @param projects Candidates, most recent first.
 * @param limit How many to keep. `0` means no limit, which does stat the whole history.
 * @returns The surviving entries, in order.
 */
async function takeExisting(projects:LandingPageProject[], limit:number):Promise<LandingPageProject[]>
{
  const kept:LandingPageProject[] = [];
  // Enough per round to fill the quota in one pass when nothing is missing, and never so
  // few that a run of dead entries costs a round trip each.
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
