import { commands, Uri, workspace } from "vscode";
import { LandingPageProject } from "./LandingPageModel";
import { parseUriNameParts } from "./uri-name-parts";

/**
 * Models the undocumented `_workbench.getRecentlyOpened` response, inferred from runtime behavior.
 */
interface RecentWorkspace
{
  workspace:
  {
    configPath?:Uri;
    id?:string;
  },
  folderUri?:Uri;
}

/**
 * Models the undocumented `_workbench.getRecentlyOpened` response, inferred from runtime behavior.
 */
interface RecentFile
{  
  fileUri:Uri;
  label?:string;
}

/**
 * Models the undocumented `_workbench.getRecentlyOpened` response, inferred from runtime behavior.
 */
interface RecentlyOpenedItems
{
  workspaces:RecentWorkspace[];
  files:RecentFile[];
}

/**
 * Builds the GUID for an MRU bookmark from the target it points at.
 *
 * This MUST be derived from the path, never from the item's position in VS Code's
 * recently-opened list: that list reorders every time anything is opened. A positional
 * GUID (the former `MRU-<n>`) meant the webview held a stale GUID from the last render
 * while {@link importVscRecentList} had already reassigned that number to a different
 * project, so clicking a card opened the wrong folder/window.
 *
 * @param uri Target the bookmark points to.
 * @returns Stable identifier for this MRU entry.
 */
function mruGuid(uri:Uri):string
{
  return 'MRU:'+uri.toString();
}

export async function importVscRecentList():Promise<LandingPageProject[]>
{
  const recentWorkspaces: RecentlyOpenedItems = await commands.executeCommand("_workbench.getRecentlyOpened");

  let result:LandingPageProject[]=[];
  for(let recentWorkspace of recentWorkspaces.workspaces)
  {
    if (recentWorkspace.folderUri)
    {
      let nameParts = parseUriNameParts(recentWorkspace.folderUri);
      result.push({
        guid:mruGuid(recentWorkspace.folderUri),
        path:recentWorkspace.folderUri.toString(),
        label:nameParts.basename,
        icon:'folder'
      });
    }
    else if (recentWorkspace.workspace?.configPath)
    {
      let nameParts = parseUriNameParts(recentWorkspace.workspace.configPath);
      result.push({
        guid:mruGuid(recentWorkspace.workspace.configPath),
        path:recentWorkspace.workspace.configPath.toString(),
        label:nameParts.basename,
        icon:'workspace'
      });
    }
  }
  for(let recentFile of recentWorkspaces.files)
  {
    let nameParts = parseUriNameParts(recentFile.fileUri);
    result.push({
      guid:mruGuid(recentFile.fileUri),
      path:recentFile.fileUri.toString(),
      label:recentFile.label||nameParts.basename+'.'+nameParts.ext,
    });
  }

  return result;
}

/**
 * `maxRecentItems: 0` means unlimited.
 */
export function recentLimit():number
{
  return workspace.getConfiguration('vsc-landingpage').get<number>('maxRecentItems') ?? 20;
}
