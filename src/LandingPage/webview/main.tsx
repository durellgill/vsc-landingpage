import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LandingPageGroup, LandingPageModel, LandingPageProject } from '../LandingPageModel';
import { icons } from '../iconography';

type Layout = 'list'|'grid'|'compact';
type Target = { guid:string; x:number; y:number } | null;
type Vscode = { postMessage(message:unknown):void };

declare function acquireVsCodeApi():Vscode;
const vscode = acquireVsCodeApi();
const iconMap = icons as Record<string,string>;
const shades = ['red','orange','yellow','green','teal','pink','purple','blue','cyan','gray','silver','brown','white','black',''];
const groupShades = ['purple','teal','orange','pink','blue'];
const typeShades:Record<string,string> = {folder:'blue', workspace:'purple', file:'teal'};
const glyphs = Object.entries(icons).filter(([key]) => key.startsWith('glyph-'));

function post(command:string, data:Record<string, unknown>={}) {vscode.postMessage({command, ...data});}
function Svg({name}:{name:string}) {return <span class="icon" dangerouslySetInnerHTML={{__html:iconMap[name] ?? ''}} />;}
function shadeForGroup(group:LandingPageGroup) {
  if (group.shade) {return group.shade;}
  if (group.guid==='@vsc-mru') {return 'gray';}
  let hash=0; for (const char of group.guid) {hash=((hash*31)+char.charCodeAt(0))>>>0;}
  return groupShades[hash%groupShades.length];
}
function iconFor(item:LandingPageProject|LandingPageGroup) {
  if (item.glyph && iconMap[`glyph-${item.glyph}`]) {return `glyph-${item.glyph}`;}
  if ('projects' in item) {return 'glyph-folder';}
  return item.icon==='folder' ? 'glyph-folder' : item.icon==='workspace' ? 'fileSliders' : 'fileQuestion';
}

/**
 * The text a filter query is matched against: the label plus the readable path.
 *
 * Labels alone are not enough to find anything on a real board. Two checkouts of the same
 * project are both called `api`, a folder is only identifiable by where it lives, and typing
 * a directory name used to return nothing at all. The path is decoded and stripped of its
 * `file://` scheme so what you type is what you see on the card.
 */
function haystack(project:LandingPageProject):string {
  let path = project.path ? project.path.replace(/^file:\/\//,'') : '';
  try {path = decodeURIComponent(path);} catch {/* a malformed escape is not worth failing a search over */}
  return `${project.label}\n${path}`.toLocaleLowerCase();
}

/**
 * Splits a query into terms. Every term must match, in any order and anywhere in the
 * haystack, so `vsc land` finds `vsc-landingpage` and `proj api` finds one `api` of several.
 */
function terms(filter:string):string[] {return filter.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);}

/** Whether a bookmark survives the filter. An empty query matches everything. */
function matches(project:LandingPageProject, needles:string[]):boolean {
  if (needles.length===0) {return true;}
  const hay = haystack(project);
  return needles.every(needle => hay.includes(needle));
}

/**
 * Whether a group's own label matches, in which case all of its bookmarks are shown.
 *
 * Groups are how the board is organised, so filtering by one is filtering to a shelf - and
 * hiding the members of a group you just named would be perverse.
 */
function groupMatches(group:LandingPageGroup, needles:string[]):boolean {
  if (needles.length===0) {return true;}
  const label = group.label.toLocaleLowerCase();
  return needles.every(needle => label.includes(needle));
}

/**
 * Whether a bookmark can be opened in a second window.
 *
 * Only folders and workspaces can. `vscode.open` has no new-window form for a plain file -
 * it opens an editor in the current window - so the action is withheld rather than offered
 * and then quietly ignored.
 */
function opensInWindow(project:LandingPageProject):boolean {return project.icon==='folder' || project.icon==='workspace';}

/**
 * Puts pinned bookmarks first, leaving everything else in its stored order.
 *
 * A stable sort rather than a reorder of the model: unpinning has to return a bookmark to
 * where it was, which it cannot do if pinning has already destroyed that position.
 */
function pinnedFirst(projects:LandingPageProject[]):LandingPageProject[] {
  return projects.map((project,index) => ({project,index}))
    .sort((a,b) => (Number(!!b.project.pinned) - Number(!!a.project.pinned)) || (a.index - b.index))
    .map(entry => entry.project);
}

/** Every bookmark card currently on the page, in document order. */
// Array.from rather than spread: tsconfig's `lib` is ES2022 with no DOM.Iterable, so a
// NodeList is not iterable as far as the compiler is concerned.
function cards():HTMLElement[] {return Array.from(document.querySelectorAll<HTMLElement>('.content .project'));}

/**
 * Finds the card an arrow key should move focus to, by geometry rather than by index.
 *
 * Index arithmetic cannot work here: list layout is a flex column, grid layout is a CSS grid
 * whose column count depends on the panel width, and compact layout wraps. Measuring where
 * the cards actually are is the only approach that behaves the same in all three and does
 * not need to know which layout a group is using.
 *
 * @param from Card that currently has focus.
 * @param key `ArrowUp`, `ArrowDown`, `ArrowLeft` or `ArrowRight`.
 * @returns The card to focus, or undefined if there is nothing that way.
 */
function neighbour(from:HTMLElement, key:string):HTMLElement|undefined {
  const others = cards().filter(card => card!==from);
  if (others.length===0) {return undefined;}
  const origin = from.getBoundingClientRect();
  const horizontal = key==='ArrowLeft' || key==='ArrowRight';
  const back = key==='ArrowLeft' || key==='ArrowUp';

  // A row-mate is anything whose vertical span overlaps this card's. Left/Right stay within
  // the row; Up/Down deliberately ignore row-mates so they never move sideways.
  const rowMate = (rect:DOMRect) => rect.top < origin.bottom-1 && rect.bottom > origin.top+1;

  const scored = others.map(card => ({card, rect:card.getBoundingClientRect()}))
    .filter(({rect}) => {
      if (horizontal) {return rowMate(rect) && (back ? rect.left < origin.left-1 : rect.left > origin.left+1);}
      return !rowMate(rect) && (back ? rect.top < origin.top-1 : rect.top > origin.top+1);
    })
    // Nearest along the axis of travel wins; horizontal distance only breaks ties between
    // cards on the same new row, which is what makes Up/Down hold a column in grid layout.
    .map(entry => ({
      card: entry.card,
      distance: horizontal
        ? Math.abs(entry.rect.left - origin.left)
        : Math.abs(entry.rect.top - origin.top) * 1000 + Math.abs(entry.rect.left - origin.left)
    }))
    .sort((a,b) => a.distance - b.distance);

  // Falling back to document order means Left at the start of a row wraps to the previous
  // row rather than doing nothing, which is what a list of bookmarks should feel like.
  if (scored.length===0 && horizontal) {
    const all = cards();
    return all[all.indexOf(from) + (back ? -1 : 1)];
  }
  return scored[0]?.card;
}

function App() {
  const [model,setModel] = useState<LandingPageModel>({groups:[]});
  const [filter,setFilter] = useState('');
  const [menu,setMenu] = useState<Target>(null);
  const [composer,setComposer] = useState<string|null>(null);
  const [picker,setPicker] = useState<'shade'|'glyph'|null>(null);
  const [rename,setRename] = useState<string|null>(null);
  const [confirm,setConfirm] = useState<'remove'|'hide'|null>(null);
  const [popover,setPopover] = useState<'create'|'clone'|null>(null);
  // `over` is the insertion index the drop indicator is drawn at, in user-group coordinates.
  const [drag,setDrag] = useState<{guid:string;over:number|null}|null>(null);
  // True between posting `refreshRecents` and the model coming back, so the control can show
  // that something is happening. Any `syncModel` clears it - the host only ever answers with
  // one, and a refresh that changed nothing still arrives as a sync.
  const [refreshing,setRefreshing] = useState(false);
  // What the host observed on disk: GUIDs it could not stat, and the checked-out branch of
  // each folder that is a repository. Webview-only - none of this is something the user set,
  // and persisting it would let a stale verdict outlive the thing it describes.
  const [health,setHealth] = useState<{missing:string[];branches:Record<string,string>}>({missing:[],branches:{}});

  const filterInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const receive = (event:MessageEvent) => {
      if (event.data?.command==='syncModel') {setModel(event.data.model); setRefreshing(false);}
      // Sent by the Ctrl/Cmd+F keybinding, which VS Code handles outside the webview.
      if (event.data?.command==='setFocusToFilterInput') {filterInput.current?.focus(); filterInput.current?.select();}
      if (event.data?.command==='bookmarkHealth') {setHealth({missing:event.data.missing ?? [], branches:event.data.branches ?? {}});}
    };
    window.addEventListener('message',receive);
    post('documentReady');
    return () => window.removeEventListener('message',receive);
  },[]);

  // Keyboard driving. This listens on `window` rather than on the page element because focus
  // starts on `document.body`, which is outside the rendered tree - a handler on `<main>`
  // would not see a key until something inside it had already been focused.
  useEffect(() => {
    const onKey = (event:KeyboardEvent) => {
      const active = document.activeElement as HTMLElement|null;
      const typing = !!active && (active.tagName==='INPUT' || active.tagName==='TEXTAREA' || active.isContentEditable);
      const card = active?.closest<HTMLElement>('.project');

      if (event.key==='Escape') {
        // Innermost thing first: a menu or popover, then the filter, then focus itself.
        if (menu || popover) {closeMenu(); setPopover(null);}
        else if (filter) {setFilter(''); filterInput.current?.focus();}
        else {active?.blur();}
        event.preventDefault();
        return;
      }
      if (event.key==='/' && !typing) {filterInput.current?.focus(); filterInput.current?.select(); event.preventDefault(); return;}

      if (active===filterInput.current && event.key==='ArrowDown') {cards()[0]?.focus(); event.preventDefault(); return;}
      if (typing || !card) {return;}

      if (event.key==='Enter' || event.key===' ') {
        // `data-kind` carries the bookmark type, so the same rule as Ctrl/Cmd+click applies
        // without having to look the project up in the model.
        const canWindow = card.dataset.kind==='folder' || card.dataset.kind==='workspace';
        post('open',{guid:card.dataset.guid, newWindow:(event.ctrlKey||event.metaKey) && canWindow});
        event.preventDefault();
        return;
      }
      if (event.key==='Home' || event.key==='End') {
        const all = cards();
        (event.key==='Home' ? all[0] : all[all.length-1])?.focus();
        event.preventDefault();
        return;
      }
      if (event.key.startsWith('Arrow')) {
        const target = neighbour(card, event.key);
        // ArrowUp off the top card lands in the filter, which is where the eye goes anyway.
        if (target) {target.focus();}
        else if (event.key==='ArrowUp') {filterInput.current?.focus();}
        event.preventDefault();
      }
    };
    window.addEventListener('keydown',onKey);
    return () => window.removeEventListener('keydown',onKey);
  });

  const target = useMemo(() => {
    if (!menu) {return null;}
    for (const group of model.groups) {
      if (group.guid===menu.guid) {return {item:group, group};}
      const project=group.projects.find(project => project.guid===menu.guid);
      if (project) {return {item:project, group};}
    }
    return null;
  },[menu,model]);
  const needles=useMemo(()=>terms(filter),[filter]);
  // A group survives if its own label matches or any of its bookmarks do. Note this is
  // 'filtered to nothing', not 'empty' - an untouched board still shows its empty groups.
  const visibleGroups=model.groups.filter(group => groupMatches(group,needles) || group.projects.some(project => matches(project,needles)));
  const userGroups=model.groups.filter(group => group.guid!=='@vsc-mru');

  function openMenu(event:MouseEvent,guid:string) {
    event.preventDefault(); event.stopPropagation();
    setMenu({guid,x:event.clientX,y:event.clientY}); setPicker(null); setConfirm(null); setRename(null);
  }
  function closeMenu() {setMenu(null); setPicker(null); setConfirm(null); setRename(null);}
  function renameTarget() {
    if (target && rename?.trim()) {post('rename',{guid:target.item.guid,value:rename.trim()}); closeMenu();}
  }
  function chooseShade(shade:string) {if (target) {post('patch',{guid:target.item.guid,field:'shade',value:shade});} closeMenu();}
  function chooseGlyph(glyph:string) {if (target) {post('patch',{guid:target.item.guid,field:'glyph',value:glyph});} closeMenu();}

  function create(command:string, data:Record<string,unknown>={}) {setPopover(null); post(command,data);}

  // Drag reorder. `index` is the position among user-created groups; the sealed Recent group
  // reports -1 and is neither draggable nor a drop target.
  function dragOver(event:DragEvent, index:number) {
    if (!drag || index<0) {return;}
    event.preventDefault();
    const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
    const over=index + (event.clientY > rect.top+rect.height/2 ? 1 : 0);
    if (drag.over!==over) {setDrag({...drag,over});}
  }
  function dropGroup() {
    if (drag && drag.over!==null) {post('moveGroup',{guid:drag.guid,toIndex:drag.over});}
    setDrag(null);
  }

  return <main class="page" onPointerDown={event => {if (!(event.target as Element).closest('#ctxmenu,.modal,.menu-anchor')) {closeMenu(); setPopover(null);}}}>
    <header class="page-header">
      <div class="titlerow"><div class="titletext"><h1>Landing Page</h1><p class="subtitle">Click to open, Ctrl/Cmd+click for a new window. Drag a group to reorder it, right-click to customise.</p></div><div class="header-actions">
        <div class="menu-anchor">
          <button class="btn-primary" aria-expanded={popover==='create'} onClick={()=>setPopover(popover==='create'?null:'create')}><Svg name="plus"/><span>New</span><Svg name="chevronDown"/></button>
          {popover==='create' && <div class="popover">
            <button onClick={()=>create('createGroup')}><Svg name="glyph-folder"/><span>Group</span></button>
            <button onClick={()=>create('createDirectory')}><Svg name="folderPlus"/><span>Folder on disk</span></button>
            <hr/>
            <button onClick={()=>create('createBookmark',{pickFolder:true})}><Svg name="folder"/><span>Bookmark a folder</span></button>
            <button onClick={()=>create('createBookmark',{pickFolder:false})}><Svg name="fileSliders"/><span>Bookmark a file or workspace</span></button>
          </div>}
        </div>
        <div class="menu-anchor">
          <button class="btn-ghost btn-small" title="Clone a repository" aria-expanded={popover==='clone'} onClick={()=>setPopover(popover==='clone'?null:'clone')}><Svg name="gitBranch"/></button>
          {popover==='clone' && <form class="popover popover-clone" onSubmit={event => {event.preventDefault(); const url=(event.currentTarget.elements.namedItem('url') as HTMLInputElement).value.trim(); if (url) {setPopover(null); post('cloneRepository',{url});}}}><input name="url" required autoFocus placeholder="Paste a Git URL"/><button class="btn-secondary">Clone</button></form>}
        </div>
        <button class="btn-ghost btn-small" title="Settings" onClick={()=>post('openSettings')}><Svg name="settings"/></button>
      </div></div>
    </header>
    <div class="commandbar">
      <div class="field field-filter"><span class="field-icon"><Svg name="search"/></span><input ref={filterInput} value={filter} onInput={event=>setFilter((event.target as HTMLInputElement).value)} placeholder="Filter bookmarks...  / or Ctrl/Cmd+F"/>{filter && <button class="btn-ghost" title="Clear filter" onClick={()=>setFilter('')}><Svg name="clear"/></button>}</div>
    </div>
    <div class="content col" onDragEnd={()=>setDrag(null)} onDrop={dropGroup}>{visibleGroups.map(group=>{
      const index=userGroups.indexOf(group);
      // Only one indicator is ever drawn: 'before' the group at the insertion point, or
      // 'after' the last one when dropping at the very end.
      const drop = !drag || drag.over===null || index<0 ? null
        : drag.over===index ? 'before'
        : (drag.over===userGroups.length && index===userGroups.length-1) ? 'after' : null;
      return <GroupShelf key={group.guid} group={group} index={index} total={userGroups.length} needles={needles} composer={composer===group.guid} setComposer={setComposer} openMenu={openMenu}
        refreshing={refreshing} refresh={()=>{setRefreshing(true); post('refreshRecents');}} health={health}
        dragging={drag?.guid===group.guid} drop={drop} onDragStart={()=>setDrag({guid:group.guid,over:null})} onDragOver={dragOver} onDrop={dropGroup}/>;
    })}</div>
    {model.groups.length===0 && <EmptyState/>}
    {needles.length>0 && visibleGroups.length===0 && <div class="placeholder"><h2>No bookmarks match your filter</h2><button class="btn-secondary" onClick={()=>setFilter('')}>Clear filter</button></div>}
    {menu && target && <ActionMenu menu={menu} target={target} rename={rename} setRename={setRename} confirm={confirm} setConfirm={setConfirm} picker={picker} setPicker={setPicker} close={closeMenu} renameTarget={renameTarget} chooseShade={chooseShade} chooseGlyph={chooseGlyph}/>} 
  </main>;
}

function GroupShelf({group,index,needles,composer,setComposer,openMenu,refreshing,refresh,health,dragging,drop,onDragStart,onDragOver,onDrop}:{group:LandingPageGroup;index:number;total:number;needles:string[];composer:boolean;setComposer:(id:string|null)=>void;openMenu:(event:MouseEvent,guid:string)=>void;refreshing:boolean;refresh:()=>void;health:{missing:string[];branches:Record<string,string>};dragging:boolean;drop:'before'|'after'|null;onDragStart:()=>void;onDragOver:(event:DragEvent,index:number)=>void;onDrop:()=>void}) {
  const sealed=group.guid==='@vsc-mru';
  // Naming the group shows all of it; otherwise each bookmark is matched on its own.
  const projects=pinnedFirst(groupMatches(group,needles) ? group.projects : group.projects.filter(project=>matches(project,needles)));
  const layout=group.layout||'list';
  // A filter overrides the stored fold. Searching a board and being shown a collapsed group
  // that silently contains the hit is the worst of both - the query is a temporary intent,
  // so it wins for as long as it lasts and the stored state is left untouched.
  const collapsed=!!group.collapsed && needles.length===0;
  const next:Record<Layout,Layout>={list:'grid',grid:'compact',compact:'list'};
  return <section class={`group${sealed?' sealed':''}${dragging?' dragging':''}${collapsed?' collapsed':''}`} data-guid={group.guid} data-shade={shadeForGroup(group)} data-drop={drop||undefined}
    onContextMenu={event=>openMenu(event,group.guid)}
    onDragOver={event=>onDragOver(event,index)} onDrop={event=>{event.preventDefault(); event.stopPropagation(); onDrop();}}>
    <div class="titlebar" draggable={!sealed} onDragStart={event=>{if (event.dataTransfer) {event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',group.guid);} onDragStart();}}><button class="group-fold" aria-expanded={!collapsed} title={collapsed?'Expand this group':'Collapse this group'} onClick={()=>post('patch',{guid:group.guid,field:'collapsed',value:!group.collapsed})}><Svg name={collapsed?'chevronRight':'chevronDown'}/></button><span class={`group-icon${sealed?'':' draghandle'}`} title={sealed?undefined:'Drag to reorder this group'}><Svg name={iconFor(group)}/></span><h1 class="group-label" title="Double-click to rename" onDblClick={event=>openMenu(event,group.guid)}>{group.label}</h1><span class="group-count">{group.projects.length||''}</span><div class="tools"><button class="ifn-sealed" title="Add to this group" onClick={()=>setComposer(composer?null:group.guid)}><Svg name="plus"/></button>{sealed && <button data-role="refresh" data-busy={refreshing?'yes':undefined} disabled={refreshing} title="Reread VS Code's recently-opened list" onClick={refresh}><Svg name="refreshCw"/></button>}<button data-role="layout" title={`${layout} view - click to change layout`} onClick={()=>post('patch',{guid:group.guid,field:'layout',value:next[layout]})}><Svg name={layout==='list'?'layoutList':layout==='grid'?'layoutGrid':'alignJustify'}/></button><button title="Group settings" onClick={event=>openMenu(event,group.guid)}><Svg name="settings"/></button></div><div class="rule"/></div>
    {!collapsed && composer && <div class="group-composer"><span class="composer-label">Add to <b>{group.label}</b></span><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:true});}}><Svg name="folder"/><span>Folder</span></button><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:false});}}><Svg name="plus"/><span>File or workspace</span></button><button class="btn-secondary" title="Create a new folder on disk and bookmark it" onClick={()=>{setComposer(null);post('createDirectory',{guid:group.guid});}}><Svg name="folderPlus"/><span>New folder</span></button><button class="btn-ghost" onClick={()=>setComposer(null)}>Cancel</button></div>}
    {/* Not rendered at all when folded, rather than hidden with CSS: the cards are tab stops
        and arrow-key targets, and a display:none body would still be found by `cards()`. */}
    {!collapsed && <div class={`projects ${layout}`}>{projects.map(project=><BookmarkCard key={project.guid} project={project} missing={health.missing.includes(project.guid)} branch={health.branches[project.guid]} openMenu={openMenu}/>)}</div>}
  </section>;
}

function BookmarkCard({project,missing,branch,openMenu}:{project:LandingPageProject;missing:boolean;branch?:string;openMenu:(event:MouseEvent,guid:string)=>void}) {
  const type=project.icon||'file'; const shade=project.shade||typeShades[type];
  const path=project.path?.replace(/^file:\/\//,'')||''; const parent=path.slice(0,path.lastIndexOf('/'));
  return <article class="project interactable" tabIndex={0} role="button" aria-label={project.label} data-guid={project.guid} data-shade={shade} data-kind={type} data-missing={missing?'yes':undefined} data-pinned={project.pinned?'yes':undefined} title={missing?`${path}\n\nThis target no longer exists.`:path} onClick={event=>{if (!(event.target as Element).closest('button')) {post('open',{guid:project.guid, newWindow:(event.ctrlKey||event.metaKey) && opensInWindow(project)});}}} onContextMenu={event=>openMenu(event,project.guid)}><div class="spine"/><div class="pictoral"><Svg name={iconFor(project)}/></div><div class="textblock"><div>{project.label}</div><div class="project-path">{missing && <span class="missing-badge"><Svg name="triangleAlert"/>Missing</span>}{branch && <span class="branch-badge" title={`On branch ${branch}`}><Svg name="gitBranch"/>{branch}</span>}{parent}</div></div>{project.pinned && <span class="pin-marker" title="Pinned to the top of this group"><Svg name="pin"/></span>}<button class="rowmenu" title="More actions" onClick={event=>openMenu(event,project.guid)}><Svg name="ellipsis"/></button></article>;
}

function ActionMenu({menu,target,rename,setRename,confirm,setConfirm,picker,setPicker,close,renameTarget,chooseShade,chooseGlyph}:any) {
  const group=target.group as LandingPageGroup; const project=!('projects' in target.item); const sealed=group.guid==='@vsc-mru';
  const style={left:`${menu.x}px`,top:`${menu.y}px`};
  if (picker==='shade') return <Palette type="shade" style={style} choose={chooseShade} close={close}/>;
  if (picker==='glyph') return <Palette type="glyph" style={style} choose={chooseGlyph} close={close}/>;
  return <div id="ctxmenu" class="ctxmenu" data-renaming={rename!==null ? 'yes' : undefined} style={style}>
    {project && <button onClick={()=>{post('open',{guid:target.item.guid});close();}}><Svg name="arrowRightIcon"/><span>Open</span></button>}
    {project && opensInWindow(target.item) && <button onClick={()=>{post('open',{guid:target.item.guid,newWindow:true});close();}}><Svg name="appWindow"/><span>Open in new window</span></button>}
    {project && <button onClick={()=>{post('patch',{guid:target.item.guid,field:'pinned',value:!target.item.pinned});close();}}><Svg name={target.item.pinned?'pinOff':'pin'}/><span>{target.item.pinned?'Unpin':'Pin to top'}</span></button>}
    {!sealed && <>{rename!==null ? <div class="ctxrename"><input autoFocus value={rename} onInput={(event:any)=>setRename(event.currentTarget.value)} onKeyDown={(event:any)=>{if(event.key==='Enter')renameTarget();if(event.key==='Escape')close();}}/><button onClick={renameTarget}>Save</button><button onClick={close}>Cancel</button></div> : <button onClick={()=>setRename(target.item.label)}><Svg name="textCursorInput"/><span>Rename</span></button>}</>}
    <button onClick={()=>setPicker('shade')}><Svg name="paintbrush"/><span>Accent colour</span></button>
    <button onClick={()=>setPicker('glyph')}><Svg name="image"/><span>Custom icon</span></button>
    {project && !sealed && <button onClick={()=>{post('moveToGroup',{guid:target.item.guid});close();}}><Svg name="folderInput"/><span>Move to group</span></button>}
    {!project && sealed && <button onClick={()=>{post('restoreHiddenRecents');close();}}>Restore hidden recents</button>}
    <div class="ctxsep"/>
    {sealed&&project ? (confirm==='hide'?<button class="danger" onClick={()=>{post('hideRecent',{guid:target.item.guid});close();}}>Hide?</button>:<button class="danger" onClick={()=>setConfirm('hide')}><Svg name="trash2"/><span>Hide from Landing Page</span></button>) : !sealed && (confirm==='remove'?<><button class="danger" onClick={()=>{post('remove',{guid:target.item.guid});close();}}>Remove?</button><button onClick={close}>Cancel</button></>:<button class="danger" onClick={()=>setConfirm('remove')}><Svg name="trash2"/><span>Remove</span></button>)}
  </div>;
}

function Palette({type,style,choose,close}:any) {return <div class="modal" onPointerUp={close}><div class={type==='shade'?'palette':'glyphpalette'} style={style} onPointerUp={(event:any)=>event.stopPropagation()}>{type==='shade'?shades.map(shade=><div data-shade={shade} onClick={()=>choose(shade)}/>):<>{glyphs.map(([key])=><button title={key.slice(6)} onClick={()=>choose(key.slice(6))}><Svg name={key}/></button>)}<button class="glyph-clear" onClick={()=>choose('')}><Svg name="circleX"/></button></>}</div></div>}
function EmptyState() {return <div class="placeholder"><h2>Nothing bookmarked yet</h2><p>Create a group, clone a repository, or open a folder to start building your board.</p><button class="btn-secondary" onClick={()=>post('createGroup')}><Svg name="plus"/>New group</button></div>}

render(<App/>,document.getElementById('root')!);
