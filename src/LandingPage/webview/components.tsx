/**
 * The leaf components of the board. `App` owns all the state; these render what it hands them
 * and post user intent back through `bridge`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { LandingPageGroup, LandingPageProject } from '../LandingPageModel';
import { post } from './bridge';
import { displayPath, groupMatches, matches, opensInWindow, pinnedFirst } from './bookmark-filter';
import { motion, stillness, useAnchored } from './motion';
import { Svg, glyphs, iconFor, shadeForGroup, shades, typeShades } from './presentation';
import type { Layout } from './types';


export function GroupShelf({group,index,needles,composer,setComposer,openMenu,refreshing,refresh,health,dragging,drop,onDragStart,onDragOver,onDrop,carried,landing,gap,onCarry,onDropBookmark,copiedGuid}:{group:LandingPageGroup;index:number;total:number;needles:string[];composer:boolean;setComposer:(id:string|null)=>void;openMenu:(event:MouseEvent,guid:string)=>void;refreshing:boolean;refresh:()=>void;health:{missing:string[];branches:Record<string,string>};dragging:boolean;drop:'before'|'after'|null;onDragStart:()=>void;onDragOver:(event:DragEvent,index:number,group:LandingPageGroup)=>void;onDrop:()=>void;carried:string|undefined;landing:string|null|undefined;gap:number;onCarry:(guid:string,card:HTMLElement)=>void;onDropBookmark:(event:DragEvent,group:LandingPageGroup,section:HTMLElement)=>void;copiedGuid:string|null}) {
  const sealed=group.guid==='@vsc-mru';
  // Naming the group shows all of it; otherwise each bookmark is matched on its own.
  // Missing entries are excluded from Recent by the host, not here - the count in the header
  // has to agree with what is rendered, and `maxRecentItems` is a count of visible entries,
  // so the exclusion has to happen before the cap. See takeExisting() in communication.ts.
  const projects=pinnedFirst(groupMatches(group,needles) ? group.projects : group.projects.filter(project=>matches(project,needles)));
  const layout=group.layout||'list';
  // A filter overrides the stored fold. Searching a board and being shown a collapsed group
  // that silently contains the hit is the worst of both - the query is a temporary intent,
  // so it wins for as long as it lasts and the stored state is left untouched.
  const collapsed=!!group.collapsed && needles.length===0;
  const next:Record<Layout,Layout>={list:'grid',grid:'compact',compact:'list'};
  // Undefined means a carried bookmark is somewhere else; null means it would land at the end
  // of this group.
  const receiving = landing!==undefined;
  // A drop at the end of the group is drawn on the last card that is not the one being
  // carried - marking the carried card itself would draw the line where it already is.
  let tail = projects.length-1;
  while (tail>=0 && projects[tail].guid===carried) {tail--;}

  // Cards from the landing point down slide out of the way, so the space the bookmark would
  // take is actually open rather than described by a line drawn in the crack between two rows.
  // The shift is a transform: the list does not reflow, which is the whole reason this can run
  // on every dragover without the jitter a real placeholder element caused.
  //
  // List layout only. In grid and compact a card would have to move to the end of the previous
  // row or the start of the next one as the rows re-wrap, and a transform cannot do that - so
  // those two keep the insertion line, which is honest about where the drop lands without
  // pretending the reflow has already happened.
  const opening = receiving && layout==='list' && landing!==null ? projects.findIndex(project=>project.guid===landing) : -1;

  /*
   * The group's body height, animated on *any* change rather than only on the fold: folding,
   * switching between list, grid and compact, and filtering all resize it, and a group whose
   * header snaps to its new position while its cards glide to theirs looks broken. Everything
   * below on the board moves with it, so this is what makes the layout switch read as one
   * movement instead of two.
   *
   * A CSS transition cannot do this. The cards mount and unmount in the same commit that flips
   * the class, so the box has no content to interpolate against and snaps in both directions -
   * measured at 0px to 220px inside three frames. The cards stay unmounted when folded, which
   * is the rule that matters: they are tab stops and arrow-key targets, and `cards()` would
   * still find them behind a `display: none`.
   *
   * The height is read from the *child*, never from the box. The box may be part-way through
   * one of these animations when another render lands, and reading its interpolated height
   * would record a value the layout never had and animate from the wrong place next time. The
   * child is not animated, so it always reports the height the content actually wants.
   *
   * The duration depends on which gesture caused the change, which is the one thing this effect
   * cannot read off the height alone. A fold, a layout switch and a filter are considered
   * changes and take `--dur-move`. The space that opens under a dragged bookmark is pointer
   * feedback: the cards slide into it on a `--dur-hover` transition, so the box has to arrive
   * with them rather than 70ms later - see the note on `motion()`. The gap is the only height
   * change this component makes that is driven by the pointer, and it is exactly the renders
   * where the reserved padding changes, so that is what the comparison below detects.
   */
  const foldable = useRef<HTMLDivElement>(null);
  const bodyHeight = useRef(-1);
  const reserved = useRef(0);
  useLayoutEffect(()=>{
    const box = foldable.current;
    if (!box) {return;}
    const height = box.firstElementChild?.getBoundingClientRect().height ?? 0;
    const previous = bodyHeight.current;
    const padding = opening>=0 ? gap : 0;
    const byPointer = padding!==reserved.current;
    bodyHeight.current = height;
    reserved.current = padding;
    // First paint: the group is arriving, not resizing.
    if (previous<0 || Math.abs(previous-height)<1 || stillness()) {return;}
    box.animate([{height:`${previous}px`},{height:`${height}px`}], motion(byPointer ? '--dur-hover' : '--dur-move'));
  });

  // Named regions, and a heading level below the page's own. Every group used to render an
  // `<h1>`, so a board of six groups had seven of them and navigating by heading gave no
  // hierarchy at all; the `<section>` had no accessible name, so it was not exposed as a region
  // either. The SCSS hooks `.group-label` rather than the tag, so the level is free to change.
  const groupLabelId=`grp-${group.guid}-label`;
  return <section class={`group${sealed?' sealed':''}${dragging?' dragging':''}${collapsed?' collapsed':''}`} aria-labelledby={groupLabelId} data-guid={group.guid} data-shade={shadeForGroup(group)} data-drop={drop||undefined} data-receiving={receiving?'yes':undefined}
    onContextMenu={event=>openMenu(event,group.guid)}
    onDragOver={event=>onDragOver(event,index,group)}
    onDrop={event=>{event.preventDefault(); event.stopPropagation();
      // Keyed off the carried bookmark, set at dragstart, rather than off `receiving`, which
      // is one render behind and would not be painted yet on a fast flick into a group.
      // Recent is not a drop target: a bookmark released over it falls through to the group
      // reorder path, which ignores it.
      if (carried && !sealed) {onDropBookmark(event,group,event.currentTarget as HTMLElement);} else {onDrop();}}}>
    <div class="titlebar" draggable={!sealed} onDragStart={event=>{if (event.dataTransfer) {event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',group.guid);} onDragStart();}}><button class="group-fold" aria-expanded={!collapsed} aria-label={collapsed?`Expand ${group.label}`:`Collapse ${group.label}`} title={collapsed?'Expand this group':'Collapse this group'} onClick={()=>post('patch',{guid:group.guid,field:'collapsed',value:!group.collapsed})}><Svg name="chevronDown"/></button><span class={`group-icon${sealed?'':' draghandle'}`} aria-hidden="true" title={sealed?undefined:'Drag to reorder this group'}><Svg name={iconFor(group)}/></span><h2 class="group-label" id={groupLabelId} title="Double-click to rename" onDblClick={event=>openMenu(event,group.guid)}>{group.label}</h2><span class="group-count" aria-label={group.projects.length===1?'1 bookmark':`${group.projects.length} bookmarks`}>{group.projects.length||''}</span>{/* Icon-only buttons, and there is one set per group - so the name has to carry which group,
        or a screen reader reads six identical "Add" buttons with no way to tell them apart. */}
    <div class="tools"><button class="ifn-sealed" title="Add to this group" aria-label={`Add to ${group.label}`} onClick={()=>setComposer(composer?null:group.guid)}><Svg name="plus"/></button>{sealed && <button data-role="refresh" data-busy={refreshing?'yes':undefined} aria-busy={refreshing?'true':undefined} disabled={refreshing} title="Reread VS Code's recently-opened list" aria-label="Refresh the recently-opened list" onClick={refresh}><Svg name="refreshCw"/></button>}<button data-role="layout" title={`${layout} view - click to change layout`} aria-label={`${group.label} layout: ${layout}. Change layout`} onClick={()=>post('patch',{guid:group.guid,field:'layout',value:next[layout]})}><Svg name={layout==='list'?'layoutList':layout==='grid'?'layoutGrid':'alignJustify'}/></button><button title="Group settings" aria-label={`Settings for ${group.label}`} onClick={event=>openMenu(event,group.guid)}><Svg name="settings"/></button></div><div class="rule"/></div>
    {!collapsed && composer && <div class="group-composer"><span class="composer-label">Add to <b>{group.label}</b></span><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:true});}}><Svg name="folder"/><span>Folder</span></button><button class="btn-secondary" onClick={()=>{setComposer(null);post('createBookmark',{guid:group.guid,pickFolder:false});}}><Svg name="plus"/><span>File or workspace</span></button><button class="btn-secondary" title="Create a new folder on disk and bookmark it" onClick={()=>{setComposer(null);post('createDirectory',{guid:group.guid});}}><Svg name="folderPlus"/><span>New folder</span></button><button class="btn-ghost" onClick={()=>setComposer(null)}>Cancel</button></div>}
    {/* Not rendered at all when folded, rather than hidden with CSS: the cards are tab stops
        and arrow-key targets, and a display:none body would still be found by `cards()`.
        `.foldable` stays mounted either way, which is what the fold animates - the cards
        themselves cannot animate out when they no longer exist. */}
    {/* The gap is made of transforms, which take up no room - so the last card slides past the
        bottom of the group and straight into the one below it, and `.foldable` clips it away
        entirely. Reserving the same distance as padding gives the group the height the open
        gap needs. It is one reflow when the gap first opens, not one per dragover, because the
        distance does not change while the drag runs. */}
    <div class="foldable" ref={foldable}>{!collapsed && <div class={`projects ${layout}`} style={opening>=0 ? `padding-bottom: ${gap}px` : undefined}>{projects.map((project,position)=><BookmarkCard key={project.guid} project={project} missing={health.missing.includes(project.guid)} branch={health.branches[project.guid]} openMenu={openMenu}
      carried={carried===project.guid} onCarry={onCarry} copied={copiedGuid===project.guid}
      shift={opening>=0 && position>=opening && project.guid!==carried ? gap : 0}
      // The line is what grid and compact use; where the gap opens, the gap *is* the indicator.
      dropEdge={!receiving || opening>=0 ? undefined : landing===project.guid ? 'before' : (landing===null && position===tail) ? 'after' : undefined}/>)}</div>}</div>
  </section>;
}


export function BookmarkCard({project,missing,branch,openMenu,carried,onCarry,dropEdge,copied,shift}:{project:LandingPageProject;missing:boolean;branch?:string;openMenu:(event:MouseEvent,guid:string)=>void;carried:boolean;onCarry:(guid:string,card:HTMLElement)=>void;dropEdge?:'before'|'after';copied:boolean;shift:number}) {
  const type=project.icon||'file'; const shade=project.shade||typeShades[type];
  const path=displayPath(project); const parent=path.slice(0,path.lastIndexOf('/'));
  // The card's name comes from its label element and its description from the path line, rather
  // than from an `aria-label` carrying the label alone. `aria-label` *replaces* the name computed
  // from the content, so everything else on the card was silently unannounced - the path, the
  // branch, and the `Missing` badge, which is rendered as the literal word precisely so that the
  // state is not carried by colour alone. Pointing at the elements also keeps the two in step:
  // there is no second copy of the text to fall out of date.
  const labelId=`bm-${project.guid}-label`; const descId=`bm-${project.guid}-desc`;
  return <article class={`project interactable${carried?' dragging':''}`} tabIndex={0} role="button" aria-labelledby={labelId} aria-describedby={descId} data-guid={project.guid} data-shade={shade} data-kind={type} data-missing={missing?'yes':undefined} data-pinned={project.pinned?'yes':undefined} data-drop={dropEdge}
    // `translate`, not `transform`: the card transitions its scale and its slide at different
    // speeds (see `.project` in the SCSS), which one `transform` declaration cannot do.
    style={shift ? `translate: 0 ${shift}px` : undefined}
    draggable onDragStart={event=>{if (event.dataTransfer) {event.dataTransfer.effectAllowed='copyMove'; event.dataTransfer.setData('text/plain',project.guid);} onCarry(project.guid, event.currentTarget as HTMLElement);}} onClick={event=>{if (!(event.target as Element).closest('button')) {post('open',{guid:project.guid, newWindow:(event.ctrlKey||event.metaKey) && opensInWindow(project)});}}} onContextMenu={event=>openMenu(event,project.guid)}><div class="spine"/><div class="pictoral"><Svg name={iconFor(project)}/></div><div class="textblock"><div class="project-label" id={labelId}>{project.label}</div><div class="project-path" id={descId}>{missing && <span class="missing-badge"><Svg name="triangleAlert"/>Missing</span>}{branch && <span class="branch-badge"><Svg name="gitBranch"/><span class="branch-name">{branch}</span></span>}{project.pinned && <span class="sr-only">Pinned. </span>}<span class="path-text">{parent}</span></div></div>{project.pinned && <span class="pin-marker" role="img" aria-label="Pinned to the top of this group"><Svg name="pin"/></span>}{project.path && <button class="rowcopy" data-copied={copied?'yes':undefined} title={copied?'Path copied':'Copy path'} aria-label={copied?'Path copied':'Copy path'} onClick={()=>post('copyPath',{guid:project.guid})}><Svg name={copied?'check':'copy'}/></button>}<button class="rowmenu" title="More actions" onClick={event=>openMenu(event,project.guid)}><Svg name="ellipsis"/></button></article>;
}


export function ActionMenu({menu,target,rename,setRename,confirm,setConfirm,picker,setPicker,close,renameTarget,chooseShade,chooseGlyph,groupIndex,groupCount}:any) {
  const group=target.group as LandingPageGroup; const project=!('projects' in target.item); const sealed=group.guid==='@vsc-mru';
  // Positioning is owned by `useAnchored`, which measures and clamps after render - so no
  // inline left/top here, or a re-render would put the surface back at the raw click point.
  const anchor = useAnchored(menu.x, menu.y);
  // Focus moves into the menu when it opens, and `closeMenu` hands it back to whatever opened
  // it. Without this the menu rendered at the end of `<main>`, after every group, so opening
  // one from the first card meant tabbing past the entire board to reach it.
  //
  // On mount only. The menu stays mounted while the rename row and the destructive confirmation
  // swap in and out, and both of those move focus themselves - re-running here would take it
  // straight back off the rename input.
  //
  // Queried rather than held on a ref, because which item comes first depends on the target: a
  // bookmark opens with Open, a group with Rename, and sealed Recent with Accent colour.
  useEffect(()=>{anchor.current?.querySelector('button')?.focus();},[]);
  if (picker==='shade') return <Palette type="shade" x={menu.x} y={menu.y} choose={chooseShade} close={close}/>;
  if (picker==='glyph') return <Palette type="glyph" x={menu.x} y={menu.y} choose={chooseGlyph} close={close}/>;
  // `role="dialog"` rather than `role="menu"`. A menu role obliges roving tabindex and arrow-key
  // navigation, and it takes only `menuitem` children - which the rename row, an input and two
  // buttons, is not. Declaring it without the rest would put screen readers into application
  // mode and take away the plain Tab navigation that actually works here.
  return <div id="ctxmenu" class="ctxmenu" role="dialog" aria-label={`Actions for ${target.item.label}`} ref={anchor} data-renaming={rename!==null ? 'yes' : undefined}>
    {project && <button onClick={()=>{post('open',{guid:target.item.guid});close();}}><Svg name="arrowRightIcon"/><span>Open</span></button>}
    {project && opensInWindow(target.item) && <button onClick={()=>{post('open',{guid:target.item.guid,newWindow:true});close();}}><Svg name="appWindow"/><span>Open in new window</span></button>}
    {project && <button onClick={()=>{post('copyPath',{guid:target.item.guid});close();}}><Svg name="copy"/><span>Copy path</span></button>}
    {project && <button onClick={()=>{post('patch',{guid:target.item.guid,field:'pinned',value:!target.item.pinned});close();}}><Svg name={target.item.pinned?'pinOff':'pin'}/><span>{target.item.pinned?'Unpin':'Pin to top'}</span></button>}
    {!sealed && <>{rename!==null ? <div class="ctxrename"><input autoFocus value={rename} onInput={(event:any)=>setRename(event.currentTarget.value)} onKeyDown={(event:any)=>{if(event.key==='Enter')renameTarget();if(event.key==='Escape')close();}}/><button onClick={renameTarget}>Save</button><button onClick={close}>Cancel</button></div> : <button onClick={()=>setRename(target.item.label)}><Svg name="textCursorInput"/><span>Rename</span></button>}</>}
    <button onClick={()=>setPicker('shade')}><Svg name="paintbrush"/><span>Accent colour</span></button>
    <button onClick={()=>setPicker('glyph')}><Svg name="image"/><span>Custom icon</span></button>
    {project && !sealed && <button onClick={()=>{post('moveToGroup',{guid:target.item.guid});close();}}><Svg name="folderInput"/><span>Move to group</span></button>}
    {/* The keyboard route to reordering groups. Dragging the title bar was the only way to do
        it, which made the whole feature mouse-only - the bookmark equivalent has always been
        "Move to group" above, but groups had nothing. The host's `moveGroup` already accepted
        this one-step `direction` form; only the control for it was missing. Hidden rather than
        disabled at the ends of the board, so the menu never offers a dead item. */}
    {!project && !sealed && groupIndex>0 && <button onClick={()=>{post('moveGroup',{guid:target.item.guid,direction:'up'});close();}}><Svg name="chevronUp"/><span>Move group up</span></button>}
    {!project && !sealed && groupIndex<groupCount-1 && <button onClick={()=>{post('moveGroup',{guid:target.item.guid,direction:'down'});close();}}><Svg name="chevronDown"/><span>Move group down</span></button>}
    {!project && sealed && <button onClick={()=>{post('restoreHiddenRecents');close();}}>Restore hidden recents</button>}
    <div class="ctxsep"/>
    {sealed&&project ? (confirm==='hide'?<button class="danger" data-confirm onClick={()=>{post('hideRecent',{guid:target.item.guid});close();}}>Hide?</button>:<button class="danger" onClick={()=>setConfirm('hide')}><Svg name="trash2"/><span>Hide from Landing Page</span></button>) : !sealed && (confirm==='remove'?<><button class="danger" data-confirm onClick={()=>{post('remove',{guid:target.item.guid});close();}}>Remove?</button><button onClick={close}>Cancel</button></>:<button class="danger" onClick={()=>setConfirm('remove')}><Svg name="trash2"/><span>Remove</span></button>)}
  </div>;
}


/**
 * The detail shown while a bookmark is hovered or focused: the full path, plus branch and
 * missing state when they apply.
 *
 * The card truncates its path to fit, so this is the only place the whole target is legible.
 * A native `title` tooltip cannot show the branch alongside it, cannot be styled to match the
 * editor, and appears on its own schedule.
 *
 * Always rendered, empty when nothing is hovered: `showPopover()` needs an element already in
 * the document, and mounting one on hover would mean measuring it before it had been laid out.
 */
export function HoverCard({reference,project,branch,missing}:{reference:any;project:LandingPageProject|null;branch?:string;missing:boolean}) {
  return <div class="hovercard" popover="manual" ref={reference}>
    {project && <>
      <div class="hovercard-head">
        <div class="hovercard-name">{project.label}</div>
      </div>
      <div class="hovercard-path">{displayPath(project) || 'No target set'}</div>
      {(branch || missing) && <div class="hovercard-meta">
        {branch && <span class="hovercard-branch"><Svg name="gitBranch"/>{branch}</span>}
        {missing && <span class="hovercard-missing"><Svg name="triangleAlert"/>This target no longer exists</span>}
      </div>}
    </>}
  </div>;
}


/**
 * The accent-colour and custom-icon pickers.
 *
 * Both are real dialogs rather than decorated `div`s. The colour swatches in particular used to
 * be bare `<div>`s carrying only a click handler, which made the whole feature mouse-only: no
 * tab stop, no name, no focus ring. It was worse than an ordinary unreachable control, because
 * `ActionMenu` renders the palette *in place of* the menu - so choosing "Accent colour" from
 * the keyboard replaced the menu with a surface holding nothing focusable, and the only way out
 * was Escape.
 *
 * Focus is moved to the first swatch on open and returned to whatever opened the menu on close,
 * which `App` owns because it is the only thing that still has a reference to the trigger.
 */
export function Palette({type,x,y,choose,close}:any) {
  const anchor=useAnchored(x,y);
  const first=useRef<HTMLButtonElement>(null);
  useEffect(()=>{first.current?.focus();},[]);
  return <div class="modal" role="dialog" aria-modal="true" aria-label={type==='shade'?'Choose an accent colour':'Choose a custom icon'} onPointerUp={close}>
    <div class={type==='shade'?'palette':'glyphpalette'} ref={anchor} onPointerUp={(event:any)=>event.stopPropagation()}>
      {type==='shade'
        ? shades.map((shade,index)=><button key={shade||'none'} ref={index===0?first:undefined} type="button" data-shade={shade} aria-label={shade?shade[0].toUpperCase()+shade.slice(1):'No accent colour'} onClick={()=>choose(shade)}/>)
        : <>{glyphs.map(([key],index)=><button key={key} ref={index===0?first:undefined} type="button" title={key.slice(6)} aria-label={key.slice(6)} onClick={()=>choose(key.slice(6))}><Svg name={key}/></button>)}<button class="glyph-clear" type="button" title="No icon" aria-label="No custom icon" onClick={()=>choose('')}><Svg name="circleX"/></button></>}
    </div>
  </div>;
}

/**
 * The place a bookmark goes to be got rid of. Rendered only while one is being carried.
 *
 * A drag is far easier to make by accident than a menu item is to click, so this cannot simply
 * post `remove` when something lands on it. It is **armed by dwell**: entering the zone starts a
 * `--dur-arm` timer and only a drop after that timer has run does anything. Same safeguard and
 * same duration as the menu's `Remove?` confirmation, which is held non-interactive while it
 * fades in so a double-click cannot carry through onto it. A flick across releases nothing.
 *
 * Three states, and the labels name all three because the dwell is otherwise invisible: "Drag
 * here to remove", "Hold to remove" once inside but before the timer runs, "Release to remove"
 * after. The middle one matters most - the zone turns red on hover, since that is what the
 * target is, so something other than colour has to say that releasing now would do nothing.
 *
 * The label says which of the two things will happen, because they are genuinely different
 * actions. Recent is generated from VS Code's history and cannot be edited, so an entry dragged
 * here is *hidden* from this page through `hideRecent` - reversible from the Recent group's own
 * menu - while a bookmark in a user group is removed. This is the same split the action menu
 * already makes, and the reason the zone reads the carried bookmark's origin rather than
 * assuming.
 *
 * `aria-hidden`, and deliberately so: it is a drop target and nothing else, it cannot be
 * operated from a keyboard at all, and both actions it offers are already on the bookmark's
 * menu, which is reachable. Exposing an inoperable control would be worse than omitting it.
 */
export function DeleteZone({from,onRelease}:{from:string;onRelease:(armed:boolean)=>void}) {
  const [over,setOver] = useState(false);
  const [armed,setArmed] = useState(false);
  const timer = useRef<number>(0);
  const zone = useRef<HTMLDivElement>(null);
  const overNow = useRef(false);
  const armedNow = useRef(false);
  const finished = useRef(false);
  /**
   * Start the dwell, unless it is already running.
   *
   * Called from both `dragenter` and `dragover`, because neither one alone is reliable.
   * Entering the zone and stopping dead fires `dragenter` and nothing else, so `dragover` alone
   * would never light the zone. And carrying a bookmark out of the webview - onto the terminal
   * panel, or off the window - fires `dragleave` here and resets the zone while Chromium keeps
   * it as the current drop target, so coming back resumes `dragover` with no `dragenter` at all
   * and the zone stayed dead for the rest of the drag: never highlighted, never armed, with no
   * way out but to drop and start again.
   */
  function wake() {
    if (overNow.current) {return;}
    overNow.current = true;
    setOver(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(()=>{
      if (!overNow.current) {return;}
      armedNow.current = true;
      setArmed(true);
    }, motion('--dur-arm').duration);
  }
  function releaseIfOver(event:DragEvent) {
    const rect = zone.current?.getBoundingClientRect();
    const inside = !!rect && event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom;
    if (finished.current || !inside) {return;}
    finished.current = true;
    window.clearTimeout(timer.current);
    onRelease(armedNow.current);
  }
  useEffect(()=>{
    // The timer can arm without another pointer movement. Chromium does not dispatch `drop`
    // until it sees another dragover, even though the target remains under the pointer. Capture
    // dragend as the reliable release signal; refs hold the dwell verdict without waiting for a
    // render, and `finished` prevents a normal drop from posting twice.
    window.addEventListener('dragend',releaseIfOver,true);
    return ()=>{window.clearTimeout(timer.current); window.removeEventListener('dragend',releaseIfOver,true);};
  },[]);
  const sealed = from==='@vsc-mru';
  const verb = sealed ? 'hide' : 'remove';
  return <div ref={zone} class="dropbin" data-over={over?'yes':undefined} data-armed={armed?'yes':undefined} aria-hidden="true"
    onDragOver={event=>{
      // Keep the browser drop target valid for the whole dwell. If `dropEffect` is `none`
      // before the timer arms and the pointer then stays still, Chromium records that old
      // verdict and never dispatches `drop` on release. The handler below still gates the
      // destructive action on `armed`, so an early release remains a no-op.
      event.preventDefault();
      if (event.dataTransfer) {event.dataTransfer.dropEffect = 'move';}
      wake();
    }}
    onDragEnter={wake}
    onDragLeave={event=>{
      const to=event.relatedTarget as Node|null;
      if (to && (event.currentTarget as HTMLElement).contains(to)) {return;}
      overNow.current = false;
      armedNow.current = false;
      setOver(false);
      setArmed(false);
      window.clearTimeout(timer.current);
    }}
    onDrop={event=>{event.preventDefault(); event.stopPropagation(); releaseIfOver(event);}}>
    <Svg name="trash2"/>
    <span class="dropbin-label">{!over ? `Drag here to ${verb}` : armed ? `Release to ${verb}` : `Hold to ${verb}`}</span>
  </div>;
}


// One sentence and one button. The copy used to offer three routes in ("create a group, clone a
// repository, or open a folder") under a single New group button, so two thirds of it pointed at
// controls the reader had to go find in the header. It names the next step instead, and carries
// the drag hint that used to sit permanently under the page title.
export function EmptyState() {return <div class="placeholder"><h2>Nothing bookmarked yet</h2><p>Make a group, then drag folders into it.</p><button class="btn-secondary" onClick={()=>post('createGroup')}><Svg name="plus"/>New group</button></div>}
