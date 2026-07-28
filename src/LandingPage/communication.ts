import * as vscode from 'vscode';
import { findFirst, LandingPageGroup, LandingPageModel, LandingPageProject, ScanResult } from './LandingPageModel';
import { importVscRecentList } from './history';
import { parseURI } from './utils';

/** 
 * Model for data sent from landingpage2.html to communictations.ts 
 */
interface MessageFromWebview
{
	command:'documentReady'|'rename'|'createBookmark'|'createGroup'|'remove'|'hideRecent'|'restoreHiddenRecents'|'moveGroup'|'open'|'move'|'patch'|'openSettings'|'setViewState'|'cloneRepository'|'openFolder'|'moveToGroup';

  /** For command 'cloneRepository': the repository URL typed into the clone field. */
  url?:string;

	//text?:string;
  /** GUID value of model fragment this command refers to. */
	guid?:string;
  /** For command createBookmark: if true, a folder picker is shown, else a filepicker is shown.  */
  pickFolder?:boolean;  
  /** For command 'move' the GUID of the element the dragged element (GUID) is placed relative to. */
  guid2?:string;
  /** If given, command 'move' will create a copy and assign this GUID to the cloned node. */
  cloneGUID?:string;
  /** For command 'move' the insertion relation to drop target (GUID2). */
  pos?:'before'|'after';
  /** Direction for moving a user-created group one position. */
  direction?:'up'|'down';

  /** For command 'patch' the name of the field to update. */
  field?:'shade'|'layout'|'glyph';
  /** For command 'patch' the new value to assign, or the text from the inline rename editor. */
  value?:any;
}

/** 
 * Model to send information/commands to landingpage2.html 
 */
interface MessageToWebview
{
  /** Signal ID to send to webview. */
  command:string;
  /** Data model to render. */
  model:LandingPageModel;
  /** If true, the webview does not sync existing dom elements, but recreates the whole render tree. */
  forceRebuild?:boolean;
}

function sendMessageToWebview(message:MessageToWebview, webviewPanel:vscode.WebviewPanel):void
{
  // console.log('main: send message to view',message, this.webviewPanel);
  webviewPanel.webview.postMessage(message);
}

/**
 * Pointer to the extension context, required to {@link saveModel}.
 */
let landingPageExtContext: vscode.ExtensionContext;
/**
 * Stores the context instance into {@link landingPageExtContext}.
 * Called from extension's activate function in `extension.ts`.
 * @param ctx Context for this extension.
 */
export function registerContext(ctx: vscode.ExtensionContext):void
{
  landingPageExtContext = ctx;
}
/**
 * Permanently store the landingpage model in extension's storage.
 * @param model Current model status.
 */
function saveModel(model:LandingPageModel):void
{
  // console.log('Save',model);
  landingPageExtContext.globalState.update('landingPageModel',model);
}

const HIDDEN_MRU_KEY = 'landingPageHiddenMruGuids';

function hiddenMruGuids():Set<string>
{
  return new Set(landingPageExtContext.globalState.get<string[]>(HIDDEN_MRU_KEY, []));
}

async function hideMru(guid:string|undefined):Promise<void>
{
  if (!guid?.startsWith('MRU:')) {return;}
  const hidden = hiddenMruGuids();
  hidden.add(guid);
  await landingPageExtContext.globalState.update(HIDDEN_MRU_KEY, [...hidden]);
}

async function restoreHiddenMru():Promise<void>
{
  await landingPageExtContext.globalState.update(HIDDEN_MRU_KEY, []);
}

/**
 * Loads the most recently used (mru) entries from Visual Studio Code itself
 * as bookmarks in the landingpage model.
 * 
 * These bookmarks have limited interaction options as they are managaged via
 * VS Code and therefore updated automatically. Local changes would be replaced/lost.
 * 
 * The mru bookmarks are basically modelled similar to custom bookmarks, but they
 * are stored inside a {@link LandingPageGroup} with `guid`=`@vsc-mru`. This guid
 * is used to identify these "sealed" items in frontend.
 * 
 * @param sharedModel Model to inject mru bookmarks into.
 */
async function populateVscMru(sharedModel:LandingPageModel):Promise<void>
{
  let mruFound = findFirst('@vsc-mru',sharedModel);
  let mruGroup:LandingPageGroup;
  if(mruFound) //MRU list already yet in model -> use that
  {
    mruGroup=mruFound.target as LandingPageGroup;
  }
  else //MRU list not yet in model -> create now
  {
    mruGroup={guid:'@vsc-mru',label:'Recent',projects:[], layout:'list'};
    sharedModel.groups.push(mruGroup);
  }
  const hidden = hiddenMruGuids();
  mruGroup.projects=(await importVscRecentList()).filter(project => !hidden.has(project.guid));
}

/**
 * Moves a bookmark into another group, chosen from a quick pick.
 *
 * This replaces drag and drop. Bookmarks in the generated `Recent` group are copied rather
 * than moved, since that list is rebuilt from VS Code's history on every render and anything
 * removed from it would simply reappear.
 *
 * @param guid Bookmark to move.
 * @param sharedModel Current model.
 * @param webviewPanel Panel to refresh afterwards.
 */
async function moveToGroup(guid:string|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel):Promise<void>
{
  const found = findFirst(guid, sharedModel);
  if (!found || !found.ownerGroup)
  {
    vscode.window.showWarningMessage('Select a bookmark to move.');
    return;
  }

  const project = found.target as LandingPageProject;
  const sourceGroup = found.ownerGroup;
  const isCopy = sourceGroup.guid==='@vsc-mru';

  const targets = sharedModel.groups.filter(g => g.guid!=='@vsc-mru' && g!==sourceGroup);
  if (targets.length===0)
  {
    vscode.window.showInformationMessage('There are no other groups yet. Create one first with "New group".');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    targets.map(g => ({label:g.label || 'Group', description:`${g.projects.length} bookmark${g.projects.length===1?'':'s'}`, guid:g.guid})),
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

/**
 * Builds a bookmark for one file, folder or workspace URI.
 *
 * The item type is resolved by stat-ing the URI rather than by looking at the extension,
 * because {@link parseURI} cannot tell a folder named `my.app` from a file.
 *
 * @param uri Target to bookmark.
 * @returns Bookmark ready to be pushed into a group.
 */
async function makeBookmark(uri:vscode.Uri):Promise<LandingPageProject>
{
  const nameParts = parseURI(uri);
  const project:LandingPageProject = {guid:crypto.randomUUID(), label:nameParts.basename, path:uri.toString()};

  let isDirectory = false;
  try
  {
    isDirectory = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
  }
  catch
  {
    // Unreadable or gone: fall back to the extension heuristic used by the add flow.
    isDirectory = !nameParts.ext;
  }

  if (isDirectory) {project.icon='folder';}
  else if (nameParts.ext==='code-workspace') {project.icon='workspace';}
  //else: plain file, default icon

  return project;
}

/**
 * Bookmarks files or folders picked outside the webview, i.e. from the Explorer context menu.
 *
 * The destination group is chosen from a quick pick, which also offers creating a new group,
 * so this works even when there is no group yet and when the landing page has never been
 * opened in this window. The generated `Recent` group is never a destination - it is rebuilt
 * from VS Code's history on every render.
 *
 * @param uris Targets to bookmark. Empty or undefined aborts.
 * @param sharedModel Current model.
 * @param webviewPanel Panel to refresh, or null when the landing page is not open.
 */
export async function bookmarkUris(uris:vscode.Uri[]|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel|null):Promise<void>
{
  if (!uris || uris.length===0)
  {
    vscode.window.showWarningMessage('Select a file or folder to bookmark.');
    return;
  }

  const NEW_GROUP = '@new-group';
  const targets = sharedModel.groups.filter(g => g.guid!=='@vsc-mru');
  const items = [
    ...targets.map(g => ({label:g.label || 'Group', description:`${g.projects.length} bookmark${g.projects.length===1?'':'s'}`, guid:g.guid})),
    {label:'$(add) New group...', description:'Create a group for these bookmarks', guid:NEW_GROUP}
  ];

  const what = uris.length===1 ? `"${parseURI(uris[0]).basename}"` : `${uris.length} items`;
  const picked = await vscode.window.showQuickPick(items, {title:`Add ${what} to group`, placeHolder:'Choose a group'});
  if (!picked) {return;} //cancelled

  let destination:LandingPageGroup|undefined;
  if (picked.guid===NEW_GROUP)
  {
    const label = await vscode.window.showInputBox({title:'New group', prompt:'Name for the new group', value:'Group'});
    if (label===undefined) {return;} //cancelled
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

  saveModel(sharedModel);
  if (webviewPanel)
  {
    sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
  }
  else
  {
    vscode.window.showInformationMessage(`Added ${uris.length===1?'1 bookmark':`${uris.length} bookmarks`} to "${destination.label}".`);
  }
}

/** Moves one user-created group while keeping generated Recent at the end of the board. */
function moveGroup(guid:string|undefined, direction:'up'|'down'|undefined, sharedModel:LandingPageModel):boolean
{
  if (!guid || !direction || guid==='@vsc-mru') {return false;}
  const userGroups = sharedModel.groups.filter(group => group.guid!=='@vsc-mru');
  const index = userGroups.findIndex(group => group.guid===guid);
  const targetIndex = direction==='up' ? index-1 : index+1;
  if (index<0 || targetIndex<0 || targetIndex>=userGroups.length) {return false;}

  [userGroups[index], userGroups[targetIndex]] = [userGroups[targetIndex], userGroups[index]];
  const generatedGroups = sharedModel.groups.filter(group => group.guid==='@vsc-mru');
  sharedModel.groups = [...userGroups, ...generatedGroups];
  saveModel(sharedModel);
  return true;
}

/**
 * Clones a git repository by handing off to VS Code's built-in Git extension.
 *
 * The `git.clone` command owns the destination folder picker, the progress notification,
 * credential/SSH handling and the final "Open / Add to Workspace" prompt, so none of that
 * is reimplemented here. Once opened, the clone shows up in the `Recent` group via
 * {@link importVscRecentList} like any other folder.
 *
 * @param url Repository URL entered in the webview.
 */
export async function cloneRepository(url?:string):Promise<void>
{
  if (!vscode.extensions.getExtension('vscode.git'))
  {
    vscode.window.showErrorMessage('Cannot clone: the built-in Git extension is disabled. Enable it to use this feature.');
    return;
  }

  const repoUrl = url?.trim();
  if (!repoUrl) {return;}

  try
  {
    await vscode.commands.executeCommand('git.clone', repoUrl);
  }
  catch (err:any)
  {
    vscode.window.showErrorMessage(`Could not clone ${repoUrl}: ${err?.message ?? err}`);
  }
}

/**
 * Removes content from given model instance, saves changes and show a reload request message.
 * @param sharedModel Model to reset.
 */
export async function resetModel(sharedModel:LandingPageModel):Promise<void>
{
  sharedModel.groups=[];
  sharedModel.viewState={};
  await populateVscMru(sharedModel);
  saveModel(sharedModel);
  vscode.window.showInformationMessage('Model reset. Please close and reopen landingpage view.');
}

/**
 * Performs a resync/reload of the webview to reflect the given model.
 * @param webviewPanel Webview instance to update.
 * @param sharedModel Model to render.
 */
export function syncModelInWebview(webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):void
{
  sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel); // when webview is ready, send model to it
}

/**
 * Called when landingpage2.html in webview sends a command or request to the extension.
 * @param message Info package received from landingpage2.html.
 * @param webviewPanel Renderer instance.
 * @param sharedModel Model from webview, which contains current state of the landinpage configuration. Note that this model is not received from the webview, but from `extension.ts`.
 */
export async function handleMessageFromWebview(message:MessageFromWebview,webviewPanel:vscode.WebviewPanel, sharedModel:LandingPageModel):Promise<void>
{
  // Refreshing the MRU list runs a VS Code command and rewrites the `Recent` group, so only
  // do it for messages that actually resolve or render model items. Previously this ran for
  // every message, including the `setViewState` sent on each keystroke in the filter box.
  const needsMru = message.command!=='setViewState'
                && message.command!=='openSettings'
                && message.command!=='cloneRepository'
                && message.command!=='openFolder';
  if (needsMru) {await populateVscMru(sharedModel);}

  // console.log('main: handle message',this);
  switch(message.command)
  {
    case 'documentReady':
      syncModelInWebview(webviewPanel, sharedModel);
      // vscode.window.showWarningMessage(`postmessage syncmodel!: ${JSON.stringify(sharedModel)}`);
      break;
    case 'rename': // guid: ID of model element to rename
      let foundGoP = findFirst(message.guid,sharedModel);
      if (!foundGoP) {vscode.window.showWarningMessage(`GroupOrProject not found: ${message.guid}`);return;}
      const label = message.value?.trim();
      if (!label) {return;}
      foundGoP.target.label=label;
      sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      saveModel(sharedModel);
      break;
    case 'createBookmark':  //{guid: groupGUID to add bookmark into, pickFolder:bool show folder or file picker?}
      let foundG = findFirst(message.guid, sharedModel);
      if (!foundG) {vscode.window.showWarningMessage(`Group not found: ${message.guid}`); return;}
      vscode.window.showOpenDialog({canSelectFiles:true, canSelectFolders:message.pickFolder,canSelectMany:true, filters:{'Workspaces':['code-workspace'],'Files':['*']}})
      .then((selectedFiles:vscode.Uri[]|undefined)=>
      {
        if (selectedFiles)
        {
          for(let uri of selectedFiles)
          {            
            let nameParts = parseURI(uri);              
            
            const p:LandingPageProject =     {guid:crypto.randomUUID(), label:nameParts.basename, path:uri.toString()};
            if (!nameParts.ext)              {p.icon = 'folder';}
            else if (nameParts.ext==='code-workspace') {p.icon = 'workspace';}
            //else: unknown file type

            (foundG.target as LandingPageGroup).projects.push(p);
          }
          console.log('updated model > created Bookmark',sharedModel);
          sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
          saveModel(sharedModel);
        }
      });
      break;
    case 'createGroup':
      //sharedModel.groups.push({guid:crypto.randomUUID(),label:'Group',projects:[]});
      sharedModel.groups.splice(0,0,{guid:crypto.randomUUID(),label:'Group',projects:[]});
      console.log('updated model > created Group',sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      saveModel(sharedModel);
      break;
    case 'remove':  //{guid: item to remove}        
      let foundGoP2 = findFirst(message.guid, sharedModel);

      const performRemoval=(foundGoP2:ScanResult)=>{
        if(foundGoP2.ownerGroup) //project in group
        {
          let index = foundGoP2.ownerGroup.projects.indexOf(foundGoP2.target);
          if (index>=0) {foundGoP2.ownerGroup.projects.splice(index,1);}
        }
        else //group in model
        {
          foundGoP2.model.groups.splice(foundGoP2.model.groups.indexOf(foundGoP2.target as LandingPageGroup),1);
        }
        console.log('updated model > removed item',sharedModel);
        sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
        saveModel(sharedModel);
      };

      if(foundGoP2!==null) {performRemoval(foundGoP2);}
      else {console.warn(`remove: item with guid "${message.guid}" not found.`,sharedModel);}        
      break;
    case 'open': // {guid: item with path to open}        
      let projectFound = findFirst(message.guid, sharedModel);
      if(projectFound!==null)
      {
        const project = projectFound.target as LandingPageProject;
        let path = project.path;
        if(path)
        {
          console.log(`Trying to open ${path}`);
          // Folders and .code-workspace files are opened as a workspace; anything else is a
          // plain file and must use `vscode.open` - `vscode.openFolder` on a file does not
          // open the file, it tries to treat it as a workspace root.
          const asWorkspace = project.icon==='folder' || project.icon==='workspace';
          vscode.commands.executeCommand(asWorkspace?'vscode.openFolder':'vscode.open', vscode.Uri.parse(path)); //https://code.visualstudio.com/api/references/commands
          return;
        }
        else //group in model > cannot open group
        {
          console.warn(`open: guid "${message.guid}" points to element without path!`,sharedModel);
        }          
      }
      else {console.warn(`remove: item with guid "${message.guid}" not found.`,sharedModel);}
      break;
    case 'move': // {guid:move, guid2:relativeTo, pos:beforeOrAfterGuid2}
      let foundDrag=findFirst(message.guid, sharedModel); // item to move
      let foundDrop=findFirst(message.guid2, sharedModel); //item to move relative to
      if (foundDrag && foundDrop)
      {
        let dragIs=foundDrag.ownerGroup?'project':'group';
        let dropIs=foundDrop.ownerGroup?'project':'group';

        if (dragIs==='group')
        {
          let fromPos = foundDrag.model.groups.indexOf(foundDrag.target as LandingPageGroup);
          foundDrag.model.groups.splice(fromPos!,1); //remove from old parent

          if (dropIs==='project') // -> not possible
          {
            console.error('cannot drop group on project!');
          }
          else //if (dropIs==='group') // -> put group as sibling of other group
          {
            let toPos = foundDrop.model.groups.indexOf(foundDrop.target as LandingPageGroup);
            foundDrop.model.groups.splice(toPos!+(message.pos==='after'?1:0),0,foundDrag.target as LandingPageGroup);
          }           
        }
        else //if (dragIs==='project')
        {
          let fromPos = foundDrag.ownerGroup!.projects.indexOf(foundDrag.target);

          if (message.cloneGUID)
          {
            foundDrag.target = JSON.parse(JSON.stringify(foundDrag.target)); //clone
            foundDrag.target.guid = message.cloneGUID;
          }
          else 
          {
            foundDrag.ownerGroup!.projects.splice(fromPos!,1); //remove from old parent
          }


          if (dropIs==='project') // -> put project as sibling of other project
          {
            let toPos = foundDrop?.ownerGroup?.projects.indexOf(foundDrop.target);
            foundDrop?.ownerGroup?.projects.splice(toPos!+(message.pos==='after'?1:0),0,foundDrag!.target);
          }
          else //if (dropIs==='group') // -> add project as child of group
          {
            (foundDrop.target as LandingPageGroup).projects.push(foundDrag!.target);
          }
        }          
        saveModel(sharedModel);
      }
      break;
    case 'patch': // {guid: item to patch, field: field to patch('shade' or 'layout'), value: new value}
      let found = findFirst(message.guid,sharedModel);
      if (!found) {vscode.window.showWarningMessage(`GroupOrProject not found: ${message.guid}`);return;}
      if (message.field==='shade')
      {
        // Both bookmarks and user-created groups support an accent colour. Groups use it
        // only in their heading treatment; bookmarks use it in their spine and icon.
        found.target.shade=message.value;
      }
      else if (message.field==='layout')
      {
        (found.target as LandingPageGroup).layout=message.value;
      }
      else if (message.field==='glyph')
      {
        // Empty value clears the custom icon and falls back to the item's type/default icon.
        found.target.glyph=message.value || undefined;
      }
      else
      {
        console.warn(`Patch field not supported for key ${message.field}.`);
        break;
      }
      // Preact renders from the model rather than mutating individual DOM nodes. Every saved
      // patch must therefore return the updated model to the webview. The old imperative
      // page updated its own DOM before posting, which masked this missing response.
      saveModel(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      break;
    case 'hideRecent':
      await hideMru(message.guid);
      await populateVscMru(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      break;
    case 'restoreHiddenRecents':
      await restoreHiddenMru();
      await populateVscMru(sharedModel);
      sendMessageToWebview({command:'syncModel',model:sharedModel}, webviewPanel);
      break;
    case 'moveGroup':
      if (moveGroup(message.guid, message.direction, sharedModel))
      {
        sendMessageToWebview({command:'syncModel',model:sharedModel, forceRebuild:true}, webviewPanel);
      }
      break;
    case 'setViewState':
      if (!sharedModel.viewState) {sharedModel.viewState={};}
      if(message.field)
      {
        sharedModel.viewState[message.field]=message.value; // just store generic key-value pair 
        saveModel(sharedModel);
      }
      break;
    case 'openSettings':
      vscode.commands.executeCommand('workbench.action.openSettings', 'vsc-landingpage');
      break;
    case 'cloneRepository': // {url?: repository url typed in the webview}
      await cloneRepository(message.url);
      break;
    case 'openFolder':
      vscode.commands.executeCommand('workbench.action.files.openFolder');
      break;
    case 'moveToGroup': // {guid: bookmark to move}
      await moveToGroup(message.guid, sharedModel, webviewPanel);
      break;
    default:
      console.log('Unhandled message from webview: ',message);
      // vscode.window.showWarningMessage(`got unknown msg: ${JSON.stringify(message)}`);
      return;
  }

}
