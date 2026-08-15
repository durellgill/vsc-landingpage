import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
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

/**
 * Whether motion should be suppressed for this user.
 *
 * The two JS animations on this page - the FLIP card flight and the group's height - both move
 * things, which is exactly what reduced motion asks us to stop doing, so both are skipped
 * outright rather than shortened. The CSS half of the same decision lives in the
 * `prefers-reduced-motion` block of landingpage.scss, and it is deliberately *not* a blanket
 * off switch: colour and opacity still respond there, because they are feedback rather than
 * movement.
 *
 * Queried per call rather than cached. It is a single `matchMedia` against a query the browser
 * already has evaluated, it runs a handful of times per render at most, and caching it in a
 * module-level constant would leave the page moving until reload for anyone who changes the
 * setting while it is open.
 */
function stillness() {return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}

/**
 * The JS animations on this page - the FLIP card flight and the group's height - are the same
 * gestures as the CSS ones and must be timed like them, so they read their duration and curve
 * from the same `--dur-*` / `--ease-move` tokens rather than restating the numbers. Both were
 * hand-typed here before, which is exactly how a page ends up with a 220ms transform next to a
 * 200ms one and a vague sense that something is out of step.
 *
 * The duration is a parameter because the group's height is not always the same gesture. A fold,
 * a layout switch and a filter are all considered changes and take `--dur-move`; the space that
 * opens under a dragged bookmark is pointer feedback and takes `--dur-hover`, because the cards
 * sliding into that space are transitioned at `--dur-hover` and the box containing them has to
 * arrive when they do. It did not: measured against the harness, the cards settled at 150ms and
 * the group carried on growing until 212ms, so everything below it was still being pushed down
 * for 62ms after the movement that caused it had visibly finished, and the board appeared to
 * settle twice. Same defect as the fold chevron finishing ahead of the group it describes, from
 * the opposite direction.
 *
 * Read once per token and cached: these are custom properties on `.landingpage`, which is
 * rendered once and never re-themed, and `getComputedStyle` inside the layout effects that use
 * this would put a style resolution on the path of every render. The fallbacks cover only the
 * first call happening before the element is mounted - the tokens themselves always exist.
 */
const motionTokens = new Map<string,{duration:number; easing:string}>();
const motionFallback:Record<string,number> = {'--dur-move':220, '--dur-hover':150, '--dur-arm':300};
function motion(token:'--dur-move'|'--dur-hover'|'--dur-arm'='--dur-move') {
  const cached = motionTokens.get(token);
  if (cached) {return cached;}
  const fallback = {duration:motionFallback[token], easing:'cubic-bezier(.2, .7, .3, 1)'};
  const page = document.querySelector('.landingpage');
  if (!page) {return fallback;}
  const style = getComputedStyle(page);
  // The durations are authored in CSS time syntax (`.22s`); WAAPI wants milliseconds.
  const seconds = parseFloat(style.getPropertyValue(token));
  const resolved = {
    duration: Number.isFinite(seconds) ? seconds*1000 : fallback.duration,
    easing: style.getPropertyValue('--ease-move').trim() || fallback.easing,
  };
  motionTokens.set(token, resolved);
  return resolved;
}
/**
 * Places a surface that opens at the pointer - the action menu and the two palettes - and keeps
 * it on screen.
 *
 * These were positioned with a plain inline `left`/`top` at the raw click coordinates and never
 * measured, so a right-click near the bottom-right corner opened a menu that ran off both edges:
 * at a 1280x577 viewport, 164px past the right edge and 250px below the bottom, with most of
 * the items unreachable. Flipping to the other side of the pointer is the standard fix and is
 * what the hover popover already did for its own vertical overflow.
 *
 * It also records which corner the surface ended up growing from, as `--origin-x`/`--origin-y`,
 * because that is the corner the entrance animation has to scale out of. A menu that flipped
 * above the pointer but still scaled from its top-left would expand downwards, away from the
 * click - the exact thing the animation exists to avoid.
 *
 * `useLayoutEffect` rather than `useEffect`: this runs after the surface has a box to measure
 * but before the browser paints, so the corrected position is the first one on screen and there
 * is no frame at the unclamped coordinates.
 */
function useAnchored(x:number, y:number) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {return;}
    const place = () => {
      const margin = 8;
      // Safe to measure at the unclamped position: both surfaces size to their content and are
      // `position: fixed`, so neither is squeezed by being partly off screen.
      const box = element.getBoundingClientRect();
      const flipX = x + box.width > window.innerWidth - margin;
      const flipY = y + box.height > window.innerHeight - margin;
      // `Math.max` for the surface that fits on neither side - it is pinned to the near edge
      // rather than pushed off the opposite one.
      element.style.left = `${flipX ? Math.max(margin, x - box.width) : x}px`;
      element.style.top = `${flipY ? Math.max(margin, y - box.height) : y}px`;
      element.style.setProperty('--origin-x', flipX ? 'right' : 'left');
      element.style.setProperty('--origin-y', flipY ? 'bottom' : 'top');
    };
    place();

    // Placing once is not enough, because these surfaces change size while they are open. The
    // action menu swaps its Remove row for a confirmation *and* a Cancel row, and the rename
    // row is taller than the button it replaces. A menu that was clamped to sit just inside the
    // bottom margin then grew straight back out of it - measured at 14px past the edge, with
    // Cancel the item that fell off, which is the one item that must never be unreachable.
    //
    // `x` and `y` do not change when that happens, so the effect does not re-run and there is
    // nothing else to notice it. A ResizeObserver watches the box itself. It cannot loop here:
    // `place()` only ever writes `left`/`top`, never anything that affects size.
    const resize = new ResizeObserver(place);
    resize.observe(element);
    // The viewport can move out from under an open surface too - the webview is a panel the
    // user can drag-resize at any time.
    window.addEventListener('resize', place);
    return () => {resize.disconnect(); window.removeEventListener('resize', place);};
  },[x,y]);
  return ref;
}

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

/** The bookmark's target as a reader would write it: no `file://`, no percent-escapes. */
function displayPath(project:LandingPageProject):string {
  const raw = project.path ? project.path.replace(/^file:\/\//,'') : '';
  try {return decodeURIComponent(raw);} catch {return raw;}
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

/**
 * Whether anything on the card is actually cut off.
 *
 * The hover card exists to reveal what the row could not fit - the label, the path, or the
 * branch. When all three fit, it would pop up to repeat text already on screen, so it stays
 * shut. `scrollHeight` covers the grid layout, where the label is clamped to two lines
 * vertically rather than ellipsised horizontally.
 */
function isClipped(card:HTMLElement):boolean {
  const parts = Array.from(card.querySelectorAll<HTMLElement>('.project-label, .path-text, .branch-name'));
  return parts.some(part => part.scrollWidth > part.clientWidth+1 || part.scrollHeight > part.clientHeight+1);
}

/** Every bookmark card currently on the page, in document order. */
// Array.from rather than spread: tsconfig's `lib` is ES2022 with no DOM.Iterable, so a
// NodeList is not iterable as far as the compiler is concerned.
function cards():HTMLElement[] {return Array.from(document.querySelectorAll<HTMLElement>('.content .project'));}

/**
 * Everything the FLIP effect moves: the groups, then the cards inside them.
 *
 * Groups are in the list because reordering one used to move its header, accent bar, rule and
 * count badge in a single frame while its own bookmarks slid to the same place over 220ms - the
 * cards visibly came away from their own header and caught up with it. Measured at a 133px jump
 * against a 250ms glide.
 *
 * Groups come first so their deltas are known before any card is considered, since a card inside
 * a moving group animates only what it does relative to that group.
 *
 * Keys are namespaced because a group and a bookmark are separate GUID spaces and nothing stops
 * them colliding.
 *
 * A GUID does not identify a card on its own either. The same bookmark can sit in a group *and*
 * in `Recent` - opening one from the group puts it in VS Code's recently-opened list, and the
 * overlay then rebuilds a `Recent` entry for it - so two cards on the board carry the same GUID.
 * Keyed on the GUID alone the two share one baseline, each render overwrites it with whichever
 * card was measured last, and the next render reads the *other* card's position as movement:
 * switching `Recent` between layouts flew a card in an untouched group across its neighbour and
 * back, which is the whole bug. Repeats are therefore numbered in DOM order, which is stable
 * across renders for as long as both cards are on the board.
 */
function movingParts():{key:string; element:HTMLElement; card:boolean}[] {
  const parts:{key:string; element:HTMLElement; card:boolean}[] = [];
  const seen = new Map<string,number>();
  const unique = (key:string) => {
    const count = seen.get(key) ?? 0;
    seen.set(key, count+1);
    return count ? `${key}#${count}` : key;
  };
  for (const group of Array.from(document.querySelectorAll<HTMLElement>('.content .group'))) {
    if (group.dataset.guid) {parts.push({key:unique(`group:${group.dataset.guid}`), element:group, card:false});}
  }
  for (const card of cards()) {
    if (card.dataset.guid) {parts.push({key:unique(`card:${card.dataset.guid}`), element:card, card:true});}
  }
  return parts;
}

/**
 * Which bookmark a dragged card would land in front of, measured from the cards' rectangles
 * rather than from an index - the same reason `neighbour()` measures.
 *
 * List is a flex column, so the boundary between two cards is horizontal. Grid and compact
 * wrap, so it is vertical and whole rows above the pointer are skipped.
 *
 * @param dragged GUID of the card being carried, which is never its own landing point.
 * @returns GUID of the card to insert before, or null to drop at the end of the group.
 */
function insertionPoint(event:DragEvent, section:HTMLElement, layout:Layout, dragged:string):string|null {
  const rows = Array.from(section.querySelectorAll<HTMLElement>('.project')).filter(card => card.dataset.guid!==dragged);
  const sideways = layout!=='list';
  // Offsets, not `getBoundingClientRect()`. List layout slides the cards past the landing point
  // out of the way to open a gap, and that shift is a transitioned transform - so a rect read
  // mid-drag reports wherever the card has slid to, and part-way through the transition at
  // that. Deciding against those positions makes the landing point flap between two values
  // several times a second as cards cross back over the pointer. `offsetTop` and friends are
  // layout, which a transform never touches, so they answer where the card actually lives.
  // The section is `position: relative`, which makes it the offset parent for every card in it.
  const origin = section.getBoundingClientRect();
  for (const card of rows) {
    const top = origin.top+card.offsetTop, left = origin.left+card.offsetLeft;
    if (sideways && event.clientY > top+card.offsetHeight) {continue;}
    const middle = sideways ? left+card.offsetWidth/2 : top+card.offsetHeight/2;
    if ((sideways ? event.clientX : event.clientY) < middle) {return card.dataset.guid ?? null;}
  }
  return null;
}

/**
 * How far the cards below a landing point have to slide to open a space for a carried card:
 * its own height plus the gap the list already puts between two rows.
 *
 * @param card The card being picked up, measured before anything has moved.
 */
function gapFor(card:HTMLElement):number {
  const list = card.parentElement;
  const rowGap = list ? parseFloat(getComputedStyle(list).rowGap)||0 : 0;
  return card.getBoundingClientRect().height+rowGap;
}

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
  // A bookmark being dragged. `from` is the group it started in, which decides whether the
  // drop moves it or copies it: Recent is generated, so a bookmark taken out of it is copied.
  // `into`/`before` are where it would land - `before` null means the end of that group.
  // `gap` is how far the cards below the landing point slide to open a space for it: the
  // carried card's own height plus the row gap, measured once at dragstart because it does
  // not change while the drag runs and re-measuring it per dragover would be a layout read
  // on every pointer move.
  const [carry,setCarry] = useState<{guid:string;from:string;into:string|null;before:string|null;gap:number}|null>(null);
  // True between posting `refreshRecents` and the model coming back, so the control can show
  // that something is happening. Any `syncModel` clears it - the host only ever answers with
  // one, and a refresh that changed nothing still arrives as a sync.
  const [refreshing,setRefreshing] = useState(false);
  // What the host observed on disk: GUIDs it could not stat, and the checked-out branch of
  // each folder that is a repository. Webview-only - none of this is something the user set,
  // and persisting it would let a stale verdict outlive the thing it describes.
  const [health,setHealth] = useState<{missing:string[];branches:Record<string,string>}>({missing:[],branches:{}});

  const filterInput = useRef<HTMLInputElement>(null);
  // The hover detail card. One element for the whole page - only one bookmark can be under
  // the pointer at a time, and a popover per card would be hundreds of top-layer elements.
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

  useEffect(() => {
    const receive = (event:MessageEvent) => {
      if (event.data?.command==='syncModel') {setModel(event.data.model); setRefreshing(false);}
      // Sent by the Ctrl/Cmd+F keybinding, which VS Code handles outside the webview.
      if (event.data?.command==='setFocusToFilterInput') {filterInput.current?.focus(); filterInput.current?.select();}
      if (event.data?.command==='bookmarkHealth') {setHealth({missing:event.data.missing ?? [], branches:event.data.branches ?? {}});}
      if (event.data?.command==='pathCopied') {setCopied(event.data.guid);}
    };
    window.addEventListener('message',receive);
    post('documentReady');
    return () => window.removeEventListener('message',receive);
  },[]);

  // The tick is a transient acknowledgement, not a state, so it clears itself.
  useEffect(() => {
    if (!copied) {return;}
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  },[copied]);

  // Shows and places the hover card. The Popover API puts it in the top layer, so it escapes
  // every `overflow` and stacking context on the page without z-index games - which is the
  // whole reason for using it here rather than an absolutely positioned div.
  useEffect(() => {
    const card = hovercard.current;
    if (!card) {return;}
    if (!hover) {
      if (card.matches(':popover-open')) {card.hidePopover();}
      return;
    }
    if (!card.matches(':popover-open')) {card.showPopover();}

    // Measured only once it is open; a closed popover has no box to measure.
    const box = card.getBoundingClientRect();
    const margin = 8;
    // Below the bookmark by default, flipped above when it would run off the bottom.
    let top = hover.bottom + 6;
    let side = 'below';
    if (top + box.height > window.innerHeight - margin) {top = hover.top - box.height - 6; side = 'above';}
    const left = Math.max(margin, Math.min(hover.left, window.innerWidth - box.width - margin));
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(margin, top)}px`;
    // Which way it opened, so the stylesheet can grow it out of the edge nearest the bookmark
    // rather than out of its own middle. Written here because this is the only place that knows
    // the popover was flipped - nothing about the open card says which side of it the bookmark is
    // on, and a scale that expands away from its trigger reads as arriving from nowhere.
    card.dataset.side = side;
  },[hover]);

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
  // Only the falling edge is worth saying, and only after a refresh actually ran - otherwise
  // the first render would announce a refresh that never happened.
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

  /*
   * Cards glide to wherever they end up, instead of appearing there. This is FLIP: remember
   * every card's box, let the render happen, then start each card from the offset back to
   * where it used to be and animate that offset away. The layout is never touched - only a
   * transform - so nothing reflows while it plays.
   *
   * One effect covers every way a card can change position, which is the point of doing it
   * this way rather than animating each feature separately: switching a group between list,
   * grid and compact; filtering the board down and back; a bookmark moved to another group;
   * a group reordered or folded above it. All of them are 'the boxes are somewhere else now'.
   *
   * It deliberately does nothing mid-drag. The gap that opens under the pointer is itself a
   * transform, so measuring then would record the shifted positions and the drop would animate
   * from the wrong place. Skipping also leaves `boxes` holding the pre-drag layout, which is
   * exactly the right origin for the card's flight once it lands.
   *
   * Interrupting a flight is the case that has to be handled explicitly, and it is the common
   * one: every keystroke in the filter re-renders and moves cards, far faster than the 220ms a
   * flight takes. `getBoundingClientRect()` includes an in-progress transform, so a card
   * measured mid-flight reports where it currently *appears*, not the layout box it is heading
   * for - the same pollution the mid-drag guard above exists to avoid, arriving from this
   * effect's own animations instead of the drag's.
   *
   * Left alone, that inverts the offset. The card sits at `layout + offset`, so `was - now`
   * comes out as `(previousLayout - layout) - offset` when the correct origin is
   * `(previousLayout - layout) + offset` - a card interrupted mid-flight flew off in the wrong
   * direction, measured at -17px where it should have been +17px, with the error always exactly
   * twice the offset.
   *
   * So each card is measured twice: once as it appears, then again after its previous flight has
   * been cancelled, which is the only way to get the real layout box back. The difference
   * between the two is the offset, and it is added rather than subtracted. Cancelling also keeps
   * `boxes` clean, so the next render compares against a layout position rather than a
   * half-finished animation.
   */
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
      // With the flight gone, this is the element's true layout box.
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

    // Anything that has left the board takes its flight with it.
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
  // A group survives if its own label matches or any of its bookmarks do. Note this is
  // 'filtered to nothing', not 'empty' - an untouched board still shows its empty groups.
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
    // Moving between children of the same card is not a new hover.
    if (!card || (from && card.contains(from))) {return;}
    window.clearTimeout(hoverTimer.current);
    if (menuOpen.current) {return;} //a context menu owns the interaction until it closes
    if (!isClipped(card)) {setHover(null); return;} //nothing hidden, nothing to reveal
    const show = () => {
      const rect = card.getBoundingClientRect();
      setHover({guid:card.dataset.guid ?? '', left:rect.left, top:rect.top, bottom:rect.bottom});
    };
    // A delay on pointer only. Keyboard focus is deliberate, so it shows at once.
    if (event.type==='focusin') {show();}
    else {hoverTimer.current = window.setTimeout(show, 350);}
  }
  function pointerOut(event:MouseEvent|FocusEvent) {
    const card = (event.target as Element|null)?.closest?.<HTMLElement>('.project');
    const to = (event as MouseEvent).relatedTarget as Element|null;
    if (!card || (to && card.contains(to))) {return;}
    window.clearTimeout(hoverTimer.current);
    // Closed at once. The card holds nothing to click any more - copy lives on the bookmark
    // itself - so it is `pointer-events: none` and there is no gap for the pointer to cross.
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

  // Drag reorder. `index` is the position among user-created groups; the sealed Recent group
  // reports -1 and is neither draggable nor a drop target.
  function dragOver(event:DragEvent, index:number, group:LandingPageGroup) {
    if (drag) {
      if (index<0) {return;}
      event.preventDefault();
      const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
      const over=index + (event.clientY > rect.top+rect.height/2 ? 1 : 0);
      if (drag.over!==over) {setDrag({...drag,over});}
      return;
    }
    // A bookmark. Recent is generated and rebuilt from VS Code's history on every sync, so it
    // takes no drop: anything landed there would be gone by the next message. Leaving it
    // undecorated says so before the pointer is released.
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
      <div class="titlerow"><div class="titletext"><h1>Landing Page</h1><p class="subtitle">Click to open, Ctrl/Cmd+click for a new window. Drag to rearrange, right-click to customise.</p></div><div class="header-actions">
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
    <div class="commandbar">
      <div class="field field-filter"><span class="field-icon"><Svg name="search"/></span><input ref={filterInput} aria-label="Filter bookmarks" value={filter} onInput={event=>setFilter((event.target as HTMLInputElement).value)} placeholder="Filter bookmarks...  / or Ctrl/Cmd+F"/>{filter && <button class="btn-ghost" title="Clear filter" onClick={()=>setFilter('')}><Svg name="clear"/></button>}</div>
    </div>
    <div class="content col" onMouseOver={pointerInto} onMouseOut={pointerOut} onFocusIn={pointerInto} onFocusOut={pointerOut}
      onDragEnd={()=>{setDrag(null); setCarry(null); setHover(null);}}
      onDragLeave={event=>{const to=event.relatedTarget as Node|null; if (carry && (!to || !(event.currentTarget as HTMLElement).contains(to))) {setCarry({...carry,into:null,before:null});}}}
      onDrop={dropGroup}>{visibleGroups.map(group=>{
      const index=userGroups.indexOf(group);
      // Only one indicator is ever drawn: 'before' the group at the insertion point, or
      // 'after' the last one when dropping at the very end.
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
    {/* Only while a bookmark is actually being carried. A permanently visible delete target is
        a permanent invitation to destroy something, and it would occupy page width that the
        board itself does not use. */}
    {carry && <DeleteZone from={carry.from} onRelease={armed=>{
      const {guid,from} = carry;
      setCarry(null); setDrag(null); setHover(null);
      if (!armed) {return;}
      // Recent is generated and cannot be edited, so its entries are hidden rather than
      // removed - exactly as the action menu does for the same two cases.
      post(from==='@vsc-mru' ? 'hideRecent' : 'remove', {guid});
    }}/>}
    <div class="sr-only" role="status" aria-live="polite">{announcement}</div>
    <HoverCard reference={hovercard} project={hovered} branch={hovered ? health.branches[hovered.guid] : undefined} missing={!!hovered && health.missing.includes(hovered.guid)}/>
    {menu && target && <ActionMenu menu={menu} target={target} rename={rename} setRename={setRename} confirm={confirm} setConfirm={setConfirm} picker={picker} setPicker={setPicker} close={closeMenu} renameTarget={renameTarget} chooseShade={chooseShade} chooseGlyph={chooseGlyph} groupIndex={userGroups.indexOf(target.group)} groupCount={userGroups.length}/>}
  </main>;
}

function GroupShelf({group,index,needles,composer,setComposer,openMenu,refreshing,refresh,health,dragging,drop,onDragStart,onDragOver,onDrop,carried,landing,gap,onCarry,onDropBookmark,copiedGuid}:{group:LandingPageGroup;index:number;total:number;needles:string[];composer:boolean;setComposer:(id:string|null)=>void;openMenu:(event:MouseEvent,guid:string)=>void;refreshing:boolean;refresh:()=>void;health:{missing:string[];branches:Record<string,string>};dragging:boolean;drop:'before'|'after'|null;onDragStart:()=>void;onDragOver:(event:DragEvent,index:number,group:LandingPageGroup)=>void;onDrop:()=>void;carried:string|undefined;landing:string|null|undefined;gap:number;onCarry:(guid:string,card:HTMLElement)=>void;onDropBookmark:(event:DragEvent,group:LandingPageGroup,section:HTMLElement)=>void;copiedGuid:string|null}) {
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

function BookmarkCard({project,missing,branch,openMenu,carried,onCarry,dropEdge,copied,shift}:{project:LandingPageProject;missing:boolean;branch?:string;openMenu:(event:MouseEvent,guid:string)=>void;carried:boolean;onCarry:(guid:string,card:HTMLElement)=>void;dropEdge?:'before'|'after';copied:boolean;shift:number}) {
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

function ActionMenu({menu,target,rename,setRename,confirm,setConfirm,picker,setPicker,close,renameTarget,chooseShade,chooseGlyph,groupIndex,groupCount}:any) {
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
function HoverCard({reference,project,branch,missing}:{reference:any;project:LandingPageProject|null;branch?:string;missing:boolean}) {
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
function Palette({type,x,y,choose,close}:any) {
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
 * It exists because removing a bookmark was a two-step trip through the `...` menu, which is a
 * lot of ceremony for tidying up a board - but a drag is a much easier gesture to make by
 * accident than a menu item is to click, so it cannot simply post `remove` the moment something
 * lands on it. It is **armed by dwell**: entering the zone starts a `--dur-arm` timer and only
 * a drop after that timer has run does anything at all. That is the same safeguard, and the
 * same duration, as the menu's `Remove?` confirmation, which is held non-interactive while it
 * fades in so a double-click cannot carry through onto it. A flick across the zone on the way
 * somewhere else releases nothing.
 *
 * There are three states and the labels name all three, because the dwell is otherwise invisible:
 * "Drag here to remove" at rest, "Hold to remove" once the pointer is inside but the timer has
 * not run, and "Release to remove" once it has. The middle one is the one that had to be added -
 * the zone turns red as soon as it is hovered, since that is what the target is, so something
 * other than colour has to carry the fact that a release at that instant would do nothing.
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
function DeleteZone({from,onRelease}:{from:string;onRelease:(armed:boolean)=>void}) {
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

function EmptyState() {return <div class="placeholder"><h2>Nothing bookmarked yet</h2><p>Create a group, clone a repository, or open a folder to start building your board.</p><button class="btn-secondary" onClick={()=>post('createGroup')}><Svg name="plus"/>New group</button></div>}

render(<App/>,document.getElementById('root')!);
