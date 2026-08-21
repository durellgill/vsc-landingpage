import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LandingPageGroup, LandingPageModel, LandingPageProject } from '../LandingPageModel';
import { post } from './bridge';
import { ActionMenu, DeleteZone, EmptyState, GroupShelf, HoverCard } from './components';
import { groupMatches, matches, terms } from './bookmark-filter';
import { cards, gapFor, insertionPoint, isClipped, movingParts, neighbour } from './drag-geometry';
import { motion, stillness } from './motion';
import { Svg } from './presentation';
import type { Target } from './types';


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
  // Carry state records origin, destination, landing GUID, and the drag-start gap measurement. Recent origins copy instead of move.
  const [carry,setCarry] = useState<{guid:string;from:string;into:string|null;before:string|null;gap:number}|null>(null);
  // Refresh busy state starts on request and ends on any returned model sync.
  const [refreshing,setRefreshing] = useState(false);
  const [health,setHealth] = useState<{missing:string[];branches:Record<string,string>}>({missing:[],branches:{}});

  const filterInput = useRef<HTMLInputElement>(null);
  const [hover,setHover] = useState<{guid:string;left:number;top:number;bottom:number}|null>(null);
  const hovercard = useRef<HTMLDivElement>(null);
  const menuOpen = useRef(false);
  const hoverTimer = useRef<number>(0);
  // Whatever opened the action menu, so focus can be handed back when it closes. Held as a ref
  // and not in `menu` state: it is never rendered from, and putting a DOM node in state would
  // pin the element alive across renders that no longer contain it.
  const menuTrigger = useRef<HTMLElement|null>(null);
  // GUID whose path was just copied, driving the tick. Set by the host's reply rather than
  // optimistically on click, so a clipboard failure cannot show a false confirmation.
  const [copied,setCopied] = useState<string|null>(null);

  const [codeCliAvailable, setCodeCliAvailable] = useState(false);

  useEffect(() => {
    const receive = (event:MessageEvent) => {
      if (event.data?.command==='syncModel') {setModel(event.data.model); setRefreshing(false);}
      // Sent by the Ctrl/Cmd+F keybinding, which VS Code handles outside the webview.
      if (event.data?.command==='setFocusToFilterInput') {filterInput.current?.focus(); filterInput.current?.select();}
      if (event.data?.command==='bookmarkHealth') {setHealth({missing:event.data.missing ?? [], branches:event.data.branches ?? {}});}
      if (event.data?.command==='pathCopied') {setCopied(event.data.guid);}
      if (event.data?.command==='codeCliAvailable') {setCodeCliAvailable(event.data.available);}
    };
    window.addEventListener('message',receive);
    post('documentReady');
    return () => window.removeEventListener('message',receive);
  },[]);

  useEffect(() => {
    if (!copied) {return;}
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  },[copied]);

  useEffect(() => {
    const card = hovercard.current;
    if (!card) {return;}
    if (!hover) {
      if (card.matches(':popover-open')) {card.hidePopover();}
      return;
    }
    if (!card.matches(':popover-open')) {card.showPopover();}

    const box = card.getBoundingClientRect();
    const margin = 8;
    let top = hover.bottom + 6;
    let side = 'below';
    if (top + box.height > window.innerHeight - margin) {top = hover.top - box.height - 6; side = 'above';}
    const left = Math.max(margin, Math.min(hover.left, window.innerWidth - box.width - margin));
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(margin, top)}px`;
    card.dataset.side = side;
  },[hover]);

  // The Popover API positions the card against the viewport, so it does not move with the
  // document and would float over unrelated content once the page scrolls. A pointer hover is
  // dropped; a focused card keeps its card and has it re-measured, because focusing a card
  // scrolls it into view and dismissing here would close the card before it ever painted.
  useEffect(() => {
    const onScroll = () => setHover(current => {
      if (!current) {return null;}
      const focused = (document.activeElement as Element|null)?.closest?.<HTMLElement>('.project');
      if (!focused || focused.dataset.guid!==current.guid) {return null;}
      const rect = focused.getBoundingClientRect();
      return {guid:current.guid, left:rect.left, top:rect.top, bottom:rect.bottom};
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      // Only swallows the keystroke when there is a field to send it to. An empty board hides
      // the filter, and a `/` that preventDefaults into nothing is a key that stopped working.
      if (event.key==='/' && !typing && filterInput.current) {filterInput.current.focus(); filterInput.current.select(); event.preventDefault(); return;}

      if (active && active===filterInput.current && event.key==='ArrowDown') {cards()[0]?.focus(); event.preventDefault(); return;}
      if (typing) {return;}
      // Copy works from a hovered card as well as a focused one, so it is checked before the
      // guard below that requires focus to be on a card.
      if ((event.key==='c' || event.key==='C') && (event.ctrlKey || event.metaKey)) {
        const guid = card?.dataset.guid ?? hover?.guid;
        if (guid && (window.getSelection()?.isCollapsed ?? true)) {post('copyPath',{guid}); event.preventDefault();}
        return;
      }
      // Focus can be on a button *inside* a card - the row's Copy and More-actions buttons both
      // live there - and everything below this point assumes it is on the card itself. This
      // listener is on `window` at bubble phase, so its `preventDefault()` cancelled the
      // synthetic click the button was about to receive: Enter on Copy opened the bookmark
      // instead of copying, Space did both, and the arrow keys jumped to another card from
      // inside the button. Ctrl/Cmd+C above is deliberately left reachable from there.
      if (active?.closest('button')) {return;}
      if (!card) {return;}

      if (event.key==='Enter' || event.key===' ') {
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

  /*
   * One polite live region for the page's asynchronous acknowledgements, none of which were
   * announced at all before.
   *
   * All three are confirmations of something the user just did, delivered purely visually: the
   * tick on the copy button, the spinner on the Recent refresh - which exists precisely because
   * a refresh that changes nothing otherwise looks like a dead button, and that argument applies
   * with more force to someone who cannot see the list either way - and the result count as the
   * filter narrows the board.
   *
   * `polite` rather than `assertive`: none of them is urgent, and the filter one fires on every
   * keystroke, where interrupting would make the field unusable.
   */
  const [announcement,setAnnouncement] = useState('');
  useEffect(()=>{if (copied) {setAnnouncement('Path copied');}},[copied]);
  // Announce refresh completion only on the busy-to-idle transition after a real refresh.
  const refreshWasRunning = useRef(false);
  useEffect(()=>{
    if (refreshing) {refreshWasRunning.current=true; return;}
    if (refreshWasRunning.current) {refreshWasRunning.current=false; setAnnouncement('Recent list refreshed');}
  },[refreshing]);
  useEffect(()=>{
    if (!needles.length) {return;}
    const hits = model.groups.reduce((sum,group)=>sum+group.projects.filter(project=>matches(project,needles)).length,0);
    setAnnouncement(hits===1 ? '1 bookmark matches the filter' : `${hits} bookmarks match the filter`);
  },[needles,model]);

  /* FLIP compares stable layout boxes and does nothing mid-drag. When interrupting a flight, cancel it, recover the real layout box, and add the prior visual offset to preserve direction. */
  const boxes = useRef(new Map<string,{left:number; top:number}>());
  const flights = useRef(new Map<string,Animation>());
  const settle = useRef(0);
  /**
   * Record where everything currently sits, without animating anything.
   *
   * Document-relative for the same reason the effect stores document-relative positions: the
   * baseline is compared across renders, and a scroll in between must not read as movement.
   * Only ever called when nothing is in flight, so every rect here is a real layout box.
   */
  const rebaseline = ()=>{
    const dx = window.scrollX, dy = window.scrollY;
    for (const part of movingParts()) {
      const rect = part.element.getBoundingClientRect();
      boxes.current.set(part.key, {left:rect.left+dx, top:rect.top+dy});
    }
  };
  useLayoutEffect(()=>{
    // Bumped before the mid-drag bail-out, so a settle scheduled by an earlier pass can never
    // write a baseline over a layout this pass has already moved on from.
    const token = ++settle.current;
    if (carry) {return;}
    const next = new Map<string,{left:number; top:number}>();
    const quiet = stillness();
    // `getBoundingClientRect()` is relative to the viewport, and `boxes` is compared across
    // renders - so scrolling between two renders was indistinguishable from every element on
    // the board having moved. Scroll down 150px, then do anything at all that re-renders
    // (right-click a card, hover one, type in the filter) and the whole board flew 150px and
    // settled: `translate(0px, 150px)` on every group, measured. That is the page "randomly
    // jumping", and it needed no layout change to happen, only a scroll and a render.
    //
    // Stored positions are therefore document-relative. The `seen`/`now` pair below stays in
    // viewport terms because both are read in this same pass, so the scroll cancels between
    // them and only the in-flight transform is left, which is exactly what that pair is for.
    const sx = window.scrollX, sy = window.scrollY;

    // Measure everything before animating anything. A group's transform displaces the cards
    // inside it, so starting one group's flight partway through the loop would corrupt the
    // measurement of every card belonging to it - the same pollution as the interrupted-flight
    // case, arriving from a different element.
    /*
     * A group whose height is in the air is already carrying everything *below* it, and nothing
     * below it measures as a layout box while that runs - see the note by the settle at the foot
     * of this effect. Those parts are therefore measured and stored as usual but not flown: a
     * flight started from a provisional baseline is exactly the double motion this effect exists
     * to prevent. Same guard as `carry` above, for the same reason.
     *
     * It has to be per element rather than a blanket bail-out, which is what it was first written
     * as. The animating group's *own* cards are laid out normally - the box grows around them,
     * it does not move them - and a layout switch is precisely a height change plus a card
     * rearrangement, so suppressing the whole board there stopped the switched group's cards
     * gliding at all. Everything at or above the animating group is honest; everything after it
     * is not.
     */
    const shelves = Array.from(document.querySelectorAll<HTMLElement>('.content .group'));
    const settling = shelves.findIndex(group => group.querySelector('.foldable')?.getAnimations().length);
    const carriedByFold = (element:HTMLElement) => {
      if (settling<0) {return false;}
      const owner = element.classList.contains('group') ? element : element.closest<HTMLElement>('.group');
      return !!owner && shelves.indexOf(owner) > settling;
    };

    const parts = movingParts();
    const measured = parts.map(part => {
      const seen = part.element.getBoundingClientRect();
      // Only this effect's own flights are cancelled, never everything `getAnimations()` returns
      // - that would take the CSS transitions and the `card-in` entrance with them.
      const flight = flights.current.get(part.key);
      if (flight) {flight.cancel(); flights.current.delete(part.key);}
      const now = part.element.getBoundingClientRect();
      // Document-relative, so the next render compares like with like however far the page has
      // been scrolled since.
      next.set(part.key, {left:now.left+sx, top:now.top+sy});
      return {...part, seen, now};
    });

    if (!quiet) {
      const moved = new Map<string,{dx:number; dy:number}>();
      for (const part of measured) {
        const was = boxes.current.get(part.key);
        if (!was) {continue;}
        // `was` is document-relative, so `now` is put back into the same frame of reference
        // before the two are compared. The second term stays in viewport terms: `seen` and
        // `now` were both read in this pass, so the scroll offset cancels out of it.
        moved.set(part.key, {
          dx: (was.left-(part.now.left+sx)) + (part.seen.left-part.now.left),
          dy: (was.top-(part.now.top+sy)) + (part.seen.top-part.now.top),
        });
      }
      for (const part of measured) {
        const delta = moved.get(part.key);
        if (!delta || carriedByFold(part.element)) {continue;}
        let {dx,dy} = delta;
        // A card inside a group that is itself flying only animates what it does *relative* to
        // that group, because the group's transform is already carrying it. Reordering moves a
        // group and its cards by exactly the same amount, so this cancels to zero and the card
        // is left alone; a reorder that also re-lays-out the group animates only the difference.
        // Without it the two transforms compose and the card travels twice the distance.
        const owner = part.card ? part.element.closest<HTMLElement>('.group') : null;
        const carried = owner?.dataset.guid ? moved.get(`group:${owner.dataset.guid}`) : undefined;
        if (carried) {dx -= carried.dx; dy -= carried.dy;}
        // Sub-pixel drift is not movement, and animating it costs a composited layer each.
        if (Math.abs(dx)<1 && Math.abs(dy)<1) {continue;}
        const flying = part.element.animate([{transform:`translate(${dx}px, ${dy}px)`},{transform:'none'}], motion());
        flights.current.set(part.key, flying);
        // Forget it once it lands, so the map holds only what is actually in the air. `finished`
        // rejects when an animation is cancelled, hence the empty rejection handler - the cancel
        // path above has already removed the entry.
        flying.finished.then(()=>{if (flights.current.get(part.key)===flying) {flights.current.delete(part.key);}},()=>{});
      }
    }

    for (const key of [...flights.current.keys()]) {if (!next.has(key)) {flights.current.delete(key);}}
    boxes.current = next;

    /*
     * The baseline just stored is provisional whenever a group's height is in the air, and
     * correcting it is what stops the board twitching a beat after something is added to a
     * group.
     *
     * `GroupShelf` animates its own height, and a child's layout effect runs before the
     * parent's - so on the render that grows a group, the height animation has already started
     * from the *old* height, and every rect this effect then measures below that group is the
     * pre-growth one. That is the position stored. The animation then carries those groups to
     * where they really belong, nothing re-measures, and the next render for any reason at all
     * - the `bookmarkHealth` reply that follows every sync, a hover, a keystroke - compares
     * against the stale baseline and flies the whole board back up and down again. Adding one
     * bookmark to a group made both groups below it jump 20.6px and settle, measured in the
     * harness, which is exactly the "weird refresh" of groups that were not touched.
     *
     * So the positions are measured once more after everything has landed. Both sets have to be
     * waited on: the heights, and this effect's own flights, since a rect read while either is
     * running is not a layout box. Nothing is animated from here - this only corrects what the
     * *next* render will compare against.
     */
    const inAir = [
      ...Array.from(document.querySelectorAll<HTMLElement>('.content .foldable')).flatMap(box=>box.getAnimations()),
      ...flights.current.values(),
    ];
    if (!inAir.length) {return;}
    // `finished` rejects on cancel, which is an ordinary outcome here, hence `allSettled`.
    Promise.allSettled(inAir.map(animation=>animation.finished)).then(()=>{
      if (token!==settle.current) {return;}
      rebaseline();
    });
  });

  /*
   * The baseline is only ever written during a render, so a reflow that happens *without* one
   * leaves it describing a layout that no longer exists. Dragging the editor panel narrower
   * re-wraps every grid and re-flows every group, nothing re-renders, and then the next render
   * for any reason at all reads that stale baseline as movement and flies groups nobody touched.
   *
   * Measured in the harness: narrow the panel, then switch `Recent` to another layout, and an
   * untouched group above it slid its card 34px sideways - the width it lost to the resize,
   * animated a beat late by the click that came after it.
   *
   * Re-measured rather than cleared, so the change that *did* happen still animates; clearing
   * the map would take the switched group's own flight with it and the layout switch would snap.
   *
   * Nothing is done while anything is in the air: a rect read then is not a layout box, and the
   * settle above is already waiting to write the correct baseline once it lands.
   */
  useEffect(()=>{
    const onResize = ()=>{
      if (flights.current.size) {return;}
      const folding = Array.from(document.querySelectorAll<HTMLElement>('.content .foldable'));
      if (folding.some(box=>box.getAnimations().length)) {return;}
      rebaseline();
    };
    window.addEventListener('resize', onResize);
    return ()=>window.removeEventListener('resize', onResize);
  },[]);
  const hovered = useMemo(() => {
    if (!hover) {return null;}
    for (const group of model.groups) {
      const project = group.projects.find(project => project.guid===hover.guid);
      if (project) {return project;}
    }
    return null; //hovered card was removed from the model while pointed at
  },[hover,model]);
  // Distinguish a group filtered to no matches from an actually empty group.
  const visibleGroups=model.groups.filter(group => groupMatches(group,needles) || group.projects.some(project => matches(project,needles)));
  const userGroups=model.groups.filter(group => group.guid!=='@vsc-mru');

  function openMenu(event:MouseEvent,guid:string) {
    event.preventDefault(); event.stopPropagation();
    // The hover card and the context menu describe the same bookmark and would sit on top of
    // one another. Opening the menu is a deliberate act, so it wins: the card goes, and its
    // pending timer goes with it or it would reappear over the menu a moment later.
    window.clearTimeout(hoverTimer.current); setHover(null);
    // A click synthesised from the keyboard reports `clientX`/`clientY` as 0, so every menu
    // opened with Enter or Space was pinned to the top-left corner of the viewport, arbitrarily
    // far from the control that asked for it - and, before the focus move below, left behind
    // entirely. Falling back to the trigger's own box puts it where a pointer user would have
    // clicked. `currentTarget` is read before the state update, because it is nulled once the
    // event finishes dispatching.
    const trigger = event.currentTarget as HTMLElement|null;
    const box = trigger?.getBoundingClientRect();
    menuTrigger.current = trigger;
    setMenu({guid, x:event.clientX || box?.left || 0, y:event.clientY || box?.bottom || 0});
    setPicker(null); setConfirm(null); setRename(null);
  }
  function closeMenu() {
    setMenu(null); setPicker(null); setConfirm(null); setRename(null);
    // Focus follows the menu back out. Without this, Escape unmounted the menu and dropped
    // focus onto `document.body`, so the next Tab restarted from the top of the page and the
    // arrow keys stopped working until a card was clicked.
    const trigger = menuTrigger.current;
    menuTrigger.current = null;
    if (trigger?.isConnected) {trigger.focus();}
  }
  menuOpen.current = menu!==null;
  function renameTarget() {
    if (target && rename?.trim()) {post('rename',{guid:target.item.guid,value:rename.trim()}); closeMenu();}
  }
  function chooseShade(shade:string) {if (target) {post('patch',{guid:target.item.guid,field:'shade',value:shade});} closeMenu();}
  function chooseGlyph(glyph:string) {if (target) {post('patch',{guid:target.item.guid,field:'glyph',value:glyph});} closeMenu();}

  function create(command:string, data:Record<string,unknown>={}) {setPopover(null); post(command,data);}

  /**
   * Hover and focus are delegated from the board rather than bound per card, so adding a
   * layout or a card variant cannot forget to wire it up. `mouseover`/`mouseout` are used
   * because `mouseenter`/`mouseleave` do not bubble and so cannot be delegated at all.
   */
  function pointerInto(event:MouseEvent|FocusEvent) {
    const card = (event.target as Element|null)?.closest?.<HTMLElement>('.project');
    const from = (event as MouseEvent).relatedTarget as Element|null;
    if (!card || (from && card.contains(from))) {return;}
    window.clearTimeout(hoverTimer.current);
    if (menuOpen.current) {return;} //a context menu owns the interaction until it closes
    if (!isClipped(card)) {setHover(null); return;}
    const show = () => {
      const rect = card.getBoundingClientRect();
      setHover({guid:card.dataset.guid ?? '', left:rect.left, top:rect.top, bottom:rect.bottom});
    };
    if (event.type==='focusin') {show();}
    else {hoverTimer.current = window.setTimeout(show, 350);}
  }
  function pointerOut(event:MouseEvent|FocusEvent) {
    const card = (event.target as Element|null)?.closest?.<HTMLElement>('.project');
    const to = (event as MouseEvent).relatedTarget as Element|null;
    if (!card || (to && card.contains(to))) {return;}
    window.clearTimeout(hoverTimer.current);
    setHover(null);
  }

  /**
   * Ends a drag that was released outside the window.
   *
   * Chromium never dispatches `dragend` when the pointer comes up outside the host window, so
   * everything hung off it - the ghosted source card, the delete zone, the gap held open at the
   * landing point - stayed stuck until some unrelated event happened to arrive.
   *
   * Every event below is suppressed by Chromium for the whole of a live native drag, so none of
   * them can end a drag that is still running, and any one of them arriving is proof that the
   * drag is already over. It is a list rather than a single event because which one shows up
   * first depends on how the pointer comes back: sliding in over the board fires `mouseover` and
   * `pointerover` before any `mousemove`, and clicking straight back in may fire only
   * `mousedown`. `buttons` is the second guard - a stray move with the button still down is the
   * gesture in progress, not the end of it.
   *
   * `keydown` is deliberately absent. It is delivered *during* a drag, because Escape cancels
   * one, so it would tear down a live drag on any keypress.
   *
   * Cancel only. A release anywhere but inside the delete zone destroys nothing, so this
   * deliberately does not go through `onRelease`.
   */
  useEffect(()=>{
    if (!carry && !drag) {return;}
    function abandoned(event:Event) {
      if ('buttons' in event && (event as MouseEvent).buttons!==0) {return;}
      setCarry(null); setDrag(null); setHover(null);
    }
    const proof = ['mousemove','mouseover','mousedown','pointermove','pointerover','pointerdown','wheel'];
    for (const type of proof) {window.addEventListener(type,abandoned,true);}
    return ()=>{for (const type of proof) {window.removeEventListener(type,abandoned,true);}};
  },[!!carry,!!drag]);

  // Group drag indexes exclude Recent; Recent reports `-1` and is neither draggable nor a destination.
  function dragOver(event:DragEvent, index:number, group:LandingPageGroup) {
    if (drag) {
      if (index<0) {return;}
      event.preventDefault();
      const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
      const over=index + (event.clientY > rect.top+rect.height/2 ? 1 : 0);
      if (drag.over!==over) {setDrag({...drag,over});}
      return;
    }
    if (!carry || index<0) {return;}
    event.preventDefault();
    if (event.dataTransfer) {event.dataTransfer.dropEffect = carry.from==='@vsc-mru' ? 'copy' : 'move';}
    const before=insertionPoint(event, event.currentTarget as HTMLElement, group.layout||'list', carry.guid);
    if (carry.into!==group.guid || carry.before!==before) {setCarry({...carry,into:group.guid,before});}
  }
  function dropGroup() {
    if (drag && drag.over!==null) {post('moveGroup',{guid:drag.guid,toIndex:drag.over});}
    setDrag(null);
    setCarry(null);
  }
  /**
   * Lands a dragged bookmark. The destination is measured again here rather than read from
   * `carry`: a drop that arrives in the same frame as the dragover before it would otherwise
   * use state Preact has not rendered yet. The highlight is state; the decision is geometry.
   */
  function dropBookmark(event:DragEvent, group:LandingPageGroup, section:HTMLElement) {
    if (!carry) {return;}
    const before=insertionPoint(event, section, group.layout||'list', carry.guid);
    setCarry(null);
    post('moveBookmark',{guid:carry.guid, toGroup:group.guid, beforeGuid:before??undefined});
  }

  return <main class="page" onPointerDown={event => {if (!(event.target as Element).closest('#ctxmenu,.modal,.menu-anchor')) {closeMenu(); setPopover(null);}}}>
    <header class="page-header">
      <div class="titlerow"><div class="titletext"><h1>Landing Page</h1></div><div class="header-actions">
        <button class="btn-secondary" title="Open a folder in this window" onClick={()=>{setPopover(null); post('openFolder');}}><Svg name="folder"/><span>Open</span></button>
        <div class="menu-anchor">
          <button class="btn-primary" aria-haspopup="true" aria-expanded={popover==='create'} onClick={()=>setPopover(popover==='create'?null:'create')}><Svg name="plus"/><span>New</span><Svg name="chevronDown"/></button>
          {popover==='create' && <div class="popover">
            <button onClick={()=>create('createGroup')}><Svg name="glyph-folder"/><span>Group</span></button>
            <button onClick={()=>create('createDirectory')}><Svg name="folderPlus"/><span>Folder on disk</span></button>
            <hr/>
            <button onClick={()=>create('createBookmark',{pickFolder:true})}><Svg name="folder"/><span>Bookmark a folder</span></button>
            <button onClick={()=>create('createBookmark',{pickFolder:false})}><Svg name="fileSliders"/><span>Bookmark a file or workspace</span></button>
          </div>}
        </div>
        <div class="menu-anchor">
          <button class="btn-ghost btn-small" title="Clone a repository" aria-label="Clone a repository" aria-haspopup="true" aria-expanded={popover==='clone'} onClick={()=>setPopover(popover==='clone'?null:'clone')}><Svg name="gitBranch"/></button>
          {popover==='clone' && <form class="popover popover-clone" onSubmit={event => {event.preventDefault(); const url=(event.currentTarget.elements.namedItem('url') as HTMLInputElement).value.trim(); if (url) {setPopover(null); post('cloneRepository',{url});}}}><input name="url" required autoFocus aria-label="Git repository URL" placeholder="Paste a Git URL"/><button class="btn-secondary">Clone</button></form>}
        </div>
        <button class="btn-ghost btn-small" title="Settings" onClick={()=>post('openSettings')}><Svg name="settings"/></button>
      </div></div>
    </header>
    {model.groups.length>0 && <div class="commandbar">
      <div class="field field-filter"><span class="field-icon"><Svg name="search"/></span><input ref={filterInput} aria-label="Filter bookmarks" value={filter} onInput={event=>setFilter((event.target as HTMLInputElement).value)} placeholder="Filter bookmarks...  / or Ctrl/Cmd+F"/>{filter && <button class="btn-ghost" title="Clear filter" onClick={()=>setFilter('')}><Svg name="clear"/></button>}</div>
    </div>}
    <div class="content col" onMouseOver={pointerInto} onMouseOut={pointerOut} onFocusIn={pointerInto} onFocusOut={pointerOut}
      onDragEnd={()=>{setDrag(null); setCarry(null); setHover(null);}}
      onDragLeave={event=>{const to=event.relatedTarget as Node|null; if (carry && (!to || !(event.currentTarget as HTMLElement).contains(to))) {setCarry({...carry,into:null,before:null});}}}
      onDrop={dropGroup}>{visibleGroups.map(group=>{
      const index=userGroups.indexOf(group);
      const drop = !drag || drag.over===null || index<0 ? null
        : drag.over===index ? 'before'
        : (drag.over===userGroups.length && index===userGroups.length-1) ? 'after' : null;
      return <GroupShelf key={group.guid} group={group} index={index} total={userGroups.length} needles={needles} composer={composer===group.guid} setComposer={setComposer} openMenu={openMenu}
        refreshing={refreshing} refresh={()=>{setRefreshing(true); post('refreshRecents');}} health={health}
        dragging={drag?.guid===group.guid} drop={drop} onDragStart={()=>setDrag({guid:group.guid,over:null})} onDragOver={dragOver} onDrop={dropGroup}
        carried={carry?.guid} landing={carry?.into===group.guid ? carry.before : undefined} gap={carry?.gap??0}
        onCarry={(guid,card)=>{setHover(null); closeMenu(); setCarry({guid,from:group.guid,into:null,before:null,gap:gapFor(card)});}} onDropBookmark={dropBookmark} copiedGuid={copied}/>;
    })}</div>
    {model.groups.length===0 && <EmptyState/>}
    {needles.length>0 && visibleGroups.length===0 && <div class="placeholder" data-transient><h2>No bookmarks match your filter</h2><button class="btn-secondary" onClick={()=>setFilter('')}>Clear filter</button></div>}
    {carry && <DeleteZone from={carry.from} onRelease={armed=>{
      const {guid,from} = carry;
      setCarry(null); setDrag(null); setHover(null);
      if (!armed) {return;}
      post(from==='@vsc-mru' ? 'hideRecent' : 'remove', {guid});
    }}/>}
    <div class="sr-only" role="status" aria-live="polite">{announcement}</div>
    <HoverCard reference={hovercard} project={hovered} branch={hovered ? health.branches[hovered.guid] : undefined} missing={!!hovered && health.missing.includes(hovered.guid)}/>
    {menu && target && <ActionMenu menu={menu} target={target} rename={rename} setRename={setRename} confirm={confirm} setConfirm={setConfirm} picker={picker} setPicker={setPicker} close={closeMenu} renameTarget={renameTarget} chooseShade={chooseShade} chooseGlyph={chooseGlyph} groupIndex={userGroups.indexOf(target.group)} groupCount={userGroups.length} codeCliAvailable={codeCliAvailable}/>}
  </main>;
}

render(<App/>,document.getElementById('root')!);
