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

  const filterInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const receive = (event:MessageEvent) => {
      if (event.data?.command==='syncModel') {setModel(event.data.model); setRefreshing(false);}
      // Sent by the Ctrl/Cmd+F keybinding, which VS Code handles outside the webview.
      if (event.data?.command==='setFocusToFilterInput') {filterInput.current?.focus(); filterInput.current?.select();}
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

      if (event.key==='Enter' || event.key===' ') {post('open',{guid:card.dataset.guid}); event.preventDefault(); return;}
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
  const needle=filter.trim().toLocaleLowerCase();
  const visibleGroups=model.groups.filter(group => group.projects.some(project => project.label.toLocaleLowerCase().includes(needle)) || !needle);
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
      <div class="titlerow"><div class="titletext"><h1>Landing Page</h1><p class="subtitle">Click to open. Drag a group to reorder it, right-click to customise.</p></div><div class="header-actions">
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
      return <GroupShelf key={group.guid} group={group} index={index} total={userGroups.length} filter={needle} composer={composer===group.guid} setComposer={setComposer} openMenu={openMenu}
        refreshing={refreshing} refresh={()=>{setRefreshing(true); post('refreshRecents');}}
        dragging={drag?.guid===group.guid} drop={drop} onDragStart={()=>setDrag({guid:group.guid,over:null})} onDragOver={dragOver} onDrop={dropGroup}/>;
    })}</div>
    {model.groups.length===0 && <EmptyState/>}
    {needle && visibleGroups.length===0 && <div class="placeholder"><h2>No bookmarks match your filter</h2><button class="btn-secondary" onClick={()=>setFilter('')}>Clear filter</button></div>}
    {menu && target && <ActionMenu menu={menu} target={target} rename={rename} setRename={setRename} confirm={confirm} setConfirm={setConfirm} picker={picker} setPicker={setPicker} close={closeMenu} renameTarget={renameTarget} chooseShade={chooseShade} chooseGlyph={chooseGlyph}/>} 
  </main>;
}

function GroupShelf({group,index,filter,composer,setComposer,openMenu,refreshing,refresh,dragging,drop,onDragStart,onDragOver,onDrop}:{group:LandingPageGroup;index:number;total:number;filter:string;composer:boolean;setComposer:(id:string|null)=>void;openMenu:(event:MouseEvent,guid:string)=>void;refreshing:boolean;refresh:()=>void;dragging:boolean;drop:'before'|'after'|null;onDragStart:()=>void;onDragOver:(event:DragEvent,index:number)=>void;onDrop:()=>void}) {
  const sealed=group.guid==='@vsc-mru';
  const projects=group.projects.filter(project=>project.label.toLocaleLowerCase().includes(filter));
  const layout=group.layout||'list';
  const next:Record<Layout,Layout>={list:'grid',grid:'compact',compact:'list'};
  return <section class={`group${sealed?' sealed':''}${dragging?' dragging':''}`} data-guid={group.guid} data-shade={shadeForGroup(group)} data-drop={drop||undefined}
    onContextMenu={event=>openMenu(event,group.guid)}
    onDragOver={event=>onDragOver(event,index)} onDrop={event=>{event.preventDefault(); event.stopPropagation(); onDrop();}}>
    <div class="titlebar" draggable={!sealed} onDragStart={event=>{if (event.dataTransfer) {event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',group.guid);} onDragStart();}}><span class={`group-icon${sealed?'':' draghandle'}`} title={sealed?undefined:'Drag to reorder this group'}><Svg name={iconFor(group)}/></span><h1 class="group-label" title="Double-click to rename" onDblClick={event=>openMenu(event,group.guid)}>{group.label}</h1><span class="group-count">{group.projects.length||''}</span><div class="tools"><button class="ifn-sealed" title="Add to this group" onClick={()=>setComposer(composer?null:group.guid)}><Svg name="plus"/></button>{sealed && <button data-role="refresh" data-busy={refreshing?'yes':undefined} disabled={refreshing} title="Reread VS Code's recently-opened list" onClick={refresh}><Svg name="refreshCw"/></button>}<button data-role="layout" title={`${layout} view - click to change layout`} onClick={()=>post('patch',{guid:group.guid,field:'layout',value:next[layout]})}><Svg name={layout==='list'?'layoutList':layout==='grid'?'layoutGrid':'alignJustify'}/></button><button title="Group settings" onClick={event=>openMenu(event,group.guid)}><Svg name="settings"/></button></div><div class="rule"/></div>
    {composer && <div class="group-composer"><span class="composer-label">Add to <b>{group.label}</b></span><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:true});}}><Svg name="folder"/><span>Folder</span></button><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:false});}}><Svg name="plus"/><span>File or workspace</span></button><button class="btn-secondary" title="Create a new folder on disk and bookmark it" onClick={()=>{setComposer(null);post('createDirectory',{guid:group.guid});}}><Svg name="folderPlus"/><span>New folder</span></button><button class="btn-ghost" onClick={()=>setComposer(null)}>Cancel</button></div>}
    <div class={`projects ${layout}`}>{projects.map(project=><BookmarkCard key={project.guid} project={project} openMenu={openMenu}/>)}</div>
  </section>;
}

function BookmarkCard({project,openMenu}:{project:LandingPageProject;openMenu:(event:MouseEvent,guid:string)=>void}) {
  const type=project.icon||'file'; const shade=project.shade||typeShades[type];
  const path=project.path?.replace(/^file:\/\//,'')||''; const parent=path.slice(0,path.lastIndexOf('/'));
  return <article class="project interactable" tabIndex={0} role="button" aria-label={project.label} data-guid={project.guid} data-shade={shade} data-kind={type} title={path} onClick={event=>{if (!(event.target as Element).closest('button')) {post('open',{guid:project.guid});}}} onContextMenu={event=>openMenu(event,project.guid)}><div class="spine"/><div class="pictoral"><Svg name={iconFor(project)}/></div><div class="textblock"><div>{project.label}</div><div class="project-path">{parent}</div></div><button class="rowmenu" title="More actions" onClick={event=>openMenu(event,project.guid)}><Svg name="ellipsis"/></button></article>;
}

function ActionMenu({menu,target,rename,setRename,confirm,setConfirm,picker,setPicker,close,renameTarget,chooseShade,chooseGlyph}:any) {
  const group=target.group as LandingPageGroup; const project=!('projects' in target.item); const sealed=group.guid==='@vsc-mru';
  const style={left:`${menu.x}px`,top:`${menu.y}px`};
  if (picker==='shade') return <Palette type="shade" style={style} choose={chooseShade} close={close}/>;
  if (picker==='glyph') return <Palette type="glyph" style={style} choose={chooseGlyph} close={close}/>;
  return <div id="ctxmenu" class="ctxmenu" data-renaming={rename!==null ? 'yes' : undefined} style={style}>
    {project && <button onClick={()=>{post('open',{guid:target.item.guid});close();}}><Svg name="arrowRightIcon"/><span>Open</span></button>}
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
