import { commands, Uri, workspace } from "vscode";
import { LandingPageProject } from "./LandingPageModel";
import { parseURI } from "./utils";

/**
 * Workspace bookmark in MRU list provided in {@link RecentlyOpenedItems.workspaces}.
 * (Schema guessed from debugger.)
 */
interface RecentWorkspace
{
  /** If this workspace bookmark refers to a workspace file, this property describes the path to it. */
  workspace:
  {
    /** Path to workspace file. */
    configPath?:Uri;
    /** Some ID (???). */
    id?:string;
  },
  /** If this workspace bookmark refers to a folder, this property is present (only). */
  folderUri?:Uri;
}

/**
 * File bookmark in MRU list provided in {@link RecentlyOpenedItems.files}.
 * 
 * (Schema guessed from debugger.)
 */
interface RecentFile
{  
  fileUri:Uri;
  label?:string;
}

/**
 * Model for results of command [_workbench.getRecentlyOpened](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/actions/workspaceCommands.ts#L311).
 * 
 * (Schema guessed from debugger.)
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

/**
 * Reads the most recently used items from VS Code and returns it
 * as Landing Page Model presentation. Can include files, folders or workspaces.
 *
 * @returns Items from VS Code's history.
 */
export async function importVscRecentList():Promise<LandingPageProject[]>
{
  const recentWorkspaces: RecentlyOpenedItems = await commands.executeCommand("_workbench.getRecentlyOpened");

  let result:LandingPageProject[]=[];
  for(let recentWorkspace of recentWorkspaces.workspaces)
  {
    if (recentWorkspace.folderUri)
    {
      let nameParts = parseURI(recentWorkspace.folderUri);
      result.push({
        guid:mruGuid(recentWorkspace.folderUri),
        path:recentWorkspace.folderUri.toString(),
        label:nameParts.basename,
        icon:'folder'
      });
    }
    else if (recentWorkspace.workspace?.configPath)
    {
      let nameParts = parseURI(recentWorkspace.workspace.configPath);
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
    let nameParts = parseURI(recentFile.fileUri);
    result.push({
      guid:mruGuid(recentFile.fileUri),
      path:recentFile.fileUri.toString(),
      label:recentFile.label||nameParts.basename+'.'+nameParts.ext,
      //icon:'file'
    });
  }

    // console.log("👽 :=",result);

  // VS Code's history can run to hundreds of entries. Showing all of them buries the
  // custom groups below the fold, so cap it (0 = no limit).
  const limit = workspace.getConfiguration('vsc-landingpage').get<number>('maxRecentItems') ?? 20;
  return limit>0 ? result.slice(0,limit) : result;
}