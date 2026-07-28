import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
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

function App() {
  const [model,setModel] = useState<LandingPageModel>({groups:[]});
  const [filter,setFilter] = useState('');
  const [menu,setMenu] = useState<Target>(null);
  const [composer,setComposer] = useState<string|null>(null);
  const [picker,setPicker] = useState<'shade'|'glyph'|null>(null);
  const [rename,setRename] = useState<string|null>(null);
  const [confirm,setConfirm] = useState<'remove'|'hide'|null>(null);

  useEffect(() => {
    const receive = (event:MessageEvent) => {
      if (event.data?.command==='syncModel') {setModel(event.data.model);}
    };
    window.addEventListener('message',receive);
    post('documentReady');
    return () => window.removeEventListener('message',receive);
  },[]);

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

  return <main class="page" onPointerDown={event => {if (!(event.target as Element).closest('#ctxmenu,.modal')) {closeMenu();}}}>
    <header class="page-header"><div class="titlerow"><div class="titletext"><h1>Landingpage</h1><p class="subtitle">Click to open. Right-click a bookmark or group to customise it.</p></div><div class="header-actions"><button class="btn-secondary" onClick={()=>post('createGroup')}><Svg name="plus"/><span>New group</span></button><button class="btn-ghost" title="Settings" onClick={()=>post('openSettings')}><Svg name="settings"/></button></div></div></header>
    <div class="commandbar"><form class="field field-clone" onSubmit={event => {event.preventDefault(); const url=(event.currentTarget.elements.namedItem('url') as HTMLInputElement).value.trim(); if (url) {post('cloneRepository',{url}); event.currentTarget.reset();}}}><span class="field-icon"><Svg name="gitBranch"/></span><input name="url" required placeholder="Clone a repository - paste a Git URL"/><button class="btn-primary">Clone</button></form><div class="field field-filter"><span class="field-icon"><Svg name="search"/></span><input value={filter} onInput={event=>setFilter((event.target as HTMLInputElement).value)} placeholder="Filter bookmarks...  Ctrl/Cmd+F"/><button class="btn-ghost" onClick={()=>setFilter('')}><Svg name="clear"/></button></div></div>
    <div class="content col">{visibleGroups.map(group=><GroupShelf key={group.guid} group={group} index={userGroups.indexOf(group)} total={userGroups.length} filter={needle} composer={composer===group.guid} setComposer={setComposer} openMenu={openMenu}/>)}</div>
    {model.groups.length===0 && <EmptyState/>}
    {needle && visibleGroups.length===0 && <div class="placeholder"><h2>No bookmarks match your filter</h2><button class="btn-secondary" onClick={()=>setFilter('')}>Clear filter</button></div>}
    {menu && target && <ActionMenu menu={menu} target={target} rename={rename} setRename={setRename} confirm={confirm} setConfirm={setConfirm} picker={picker} setPicker={setPicker} close={closeMenu} renameTarget={renameTarget} chooseShade={chooseShade} chooseGlyph={chooseGlyph}/>} 
  </main>;
}

function GroupShelf({group,index,total,filter,composer,setComposer,openMenu}:{group:LandingPageGroup;index:number;total:number;filter:string;composer:boolean;setComposer:(id:string|null)=>void;openMenu:(event:MouseEvent,guid:string)=>void}) {
  const sealed=group.guid==='@vsc-mru';
  const projects=group.projects.filter(project=>project.label.toLocaleLowerCase().includes(filter));
  const layout=group.layout||'list';
  const next:Record<Layout,Layout>={list:'grid',grid:'compact',compact:'list'};
  return <section class={`group${sealed?' sealed':''}`} data-guid={group.guid} data-shade={shadeForGroup(group)} onContextMenu={event=>openMenu(event,group.guid)}>
    <div class="titlebar"><span class="group-icon"><Svg name={iconFor(group)}/></span><h1 class="group-label" title="Double-click to rename" onDblClick={event=>openMenu(event,group.guid)}>{group.label}</h1><span class="group-count">{group.projects.length||''}</span><div class="tools"><button class="ifn-sealed" title="Add to this group" onClick={()=>setComposer(composer?null:group.guid)}><Svg name="plus"/></button><button class="ifn-sealed" disabled={index===0} title="Move group up" onClick={()=>post('moveGroup',{guid:group.guid,direction:'up'})}><Svg name="chevronUp"/></button><button class="ifn-sealed" disabled={index===total-1} title="Move group down" onClick={()=>post('moveGroup',{guid:group.guid,direction:'down'})}><Svg name="chevronDown"/></button><button title={`${layout} view - click to change layout`} onClick={()=>post('patch',{guid:group.guid,field:'layout',value:next[layout]})}><Svg name={layout==='list'?'layoutList':layout==='grid'?'layoutGrid':'alignJustify'}/></button></div><div class="rule"/></div>
    {composer && <div class="group-composer"><span class="composer-label">Add to <b>{group.label}</b></span><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:true});}}><Svg name="folderPlus"/><span>Folder</span></button><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:false});}}><Svg name="plus"/><span>File or workspace</span></button><button class="btn-ghost" onClick={()=>setComposer(null)}>Cancel</button></div>}
    <div class={`projects ${layout}`}>{projects.map(project=><BookmarkCard key={project.guid} project={project} openMenu={openMenu}/>)}</div>
  </section>;
}

function BookmarkCard({project,openMenu}:{project:LandingPageProject;openMenu:(event:MouseEvent,guid:string)=>void}) {
  const type=project.icon||'file'; const shade=project.shade||typeShades[type];
  const path=project.path?.replace(/^file:\/\//,'')||''; const parent=path.slice(0,path.lastIndexOf('/'));
  return <article class="project interactable" data-guid={project.guid} data-shade={shade} data-kind={type} title={path} onClick={event=>{if (!(event.target as Element).closest('button')) {post('open',{guid:project.guid});}}} onContextMenu={event=>openMenu(event,project.guid)}><div class="spine"/><div class="pictoral"><Svg name={iconFor(project)}/></div><div class="textblock"><div>{project.label}</div><div class="project-path">{parent}</div></div><button class="rowmenu" title="More actions" onClick={event=>openMenu(event,project.guid)}><Svg name="ellipsis"/></button></article>;
}

function ActionMenu({menu,target,rename,setRename,confirm,setConfirm,picker,setPicker,close,renameTarget,chooseShade,chooseGlyph}:any) {
  const group=target.group as LandingPageGroup; const project=!('projects' in target.item); const sealed=group.guid==='@vsc-mru';
  const style={left:`${menu.x}px`,top:`${menu.y}px`};
  if (picker==='shade') return <Palette type="shade" style={style} choose={chooseShade} close={close}/>;
  if (picker==='glyph') return <Palette type="glyph" style={style} choose={chooseGlyph} close={close}/>;
  return <div id="ctxmenu" class="ctxmenu" data-renaming={rename!==null ? 'yes' : undefined} style={style}>
    {project && <button onClick={()=>{post('open',{guid:target.item.guid});close();}}><Svg name="arrowRightIcon"/><span>Open</span></button>}
    {!sealed && <>{rename!==null ? <div class="ctxrename"><input autoFocus value={rename} onInput={(event:any)=>setRename(event.currentTarget.value)} onKeyDown={(event:any)=>{if(event.key==='Enter')renameTarget();if(event.key==='Escape')close();}}/><button onClick={renameTarget}>Save</button><button onClick={close}>Cancel</button></div> : <button onClick={()=>setRename(target.item.label)}><Svg name="textCursorInput"/><span>Rename</span></button>}<button onClick={()=>setPicker('shade')}><Svg name="paintbrush"/><span>Accent colour</span></button><button onClick={()=>setPicker('glyph')}><Svg name="image"/><span>Custom icon</span></button></>}
    {project && !sealed && <button onClick={()=>{post('moveToGroup',{guid:target.item.guid});close();}}><Svg name="folderInput"/><span>Move to group</span></button>}
    {!project && sealed && <button onClick={()=>{post('restoreHiddenRecents');close();}}>Restore hidden recents</button>}
    <div class="ctxsep"/>
    {sealed&&project ? (confirm==='hide'?<button class="danger" onClick={()=>{post('hideRecent',{guid:target.item.guid});close();}}>Hide?</button>:<button class="danger" onClick={()=>setConfirm('hide')}><Svg name="trash2"/><span>Hide from Landingpage</span></button>) : !sealed && (confirm==='remove'?<><button class="danger" onClick={()=>{post('remove',{guid:target.item.guid});close();}}>Remove?</button><button onClick={close}>Cancel</button></>:<button class="danger" onClick={()=>setConfirm('remove')}><Svg name="trash2"/><span>Remove</span></button>)}
  </div>;
}

function Palette({type,style,choose,close}:any) {return <div class="modal" onPointerUp={close}><div class={type==='shade'?'palette':'glyphpalette'} style={style} onPointerUp={(event:any)=>event.stopPropagation()}>{type==='shade'?shades.map(shade=><div data-shade={shade} onClick={()=>choose(shade)}/>):<>{glyphs.map(([key])=><button title={key.slice(6)} onClick={()=>choose(key.slice(6))}><Svg name={key}/></button>)}<button class="glyph-clear" onClick={()=>choose('')}><Svg name="circleX"/></button></>}</div></div>}
function EmptyState() {return <div class="placeholder"><h2>Nothing bookmarked yet</h2><p>Create a group, clone a repository, or open a folder to start building your board.</p><button class="btn-secondary" onClick={()=>post('createGroup')}><Svg name="plus"/>New group</button></div>}

render(<App/>,document.getElementById('root')!);
