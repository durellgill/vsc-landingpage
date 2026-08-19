/**
 * Live DOM measurement for dragging and for the FLIP effect.
 *
 * Everything here reads the rendered page rather than the model, because rendered order differs
 * from stored order when bookmarks are pinned - see D007.
 */
import type { Layout } from './types';


/**
 * Whether anything on the card is actually cut off.
 *
 * The hover card exists to reveal what the row could not fit - the label, the path, or the
 * branch. When all three fit, it would pop up to repeat text already on screen, so it stays
 * shut. `scrollHeight` covers the grid layout, where the label is clamped to two lines
 * vertically rather than ellipsised horizontally.
 */
export function isClipped(card:HTMLElement):boolean {
  const parts = Array.from(card.querySelectorAll<HTMLElement>('.project-label, .path-text, .branch-name'));
  return parts.some(part => part.scrollWidth > part.clientWidth+1 || part.scrollHeight > part.clientHeight+1);
}


/** Every bookmark card currently on the page, in document order. */
// Array.from rather than spread: tsconfig's `lib` is ES2022 with no DOM.Iterable, so a
// NodeList is not iterable as far as the compiler is concerned.
export function cards():HTMLElement[] {return Array.from(document.querySelectorAll<HTMLElement>('.content .project'));}


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
export function movingParts():{key:string; element:HTMLElement; card:boolean}[] {
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
export function insertionPoint(event:DragEvent, section:HTMLElement, layout:Layout, dragged:string):string|null {
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
export function gapFor(card:HTMLElement):number {
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
export function neighbour(from:HTMLElement, key:string):HTMLElement|undefined {
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
