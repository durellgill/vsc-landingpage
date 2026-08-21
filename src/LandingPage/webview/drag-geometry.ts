import type { Layout } from './types';


export function isClipped(card:HTMLElement):boolean {
  const parts = Array.from(card.querySelectorAll<HTMLElement>('.project-label, .path-text, .branch-name'));
  return parts.some(part => part.scrollWidth > part.clientWidth+1 || part.scrollHeight > part.clientHeight+1);
}


// Array.from rather than spread: tsconfig's `lib` is ES2022 with no DOM.Iterable, so a
// NodeList is not iterable as far as the compiler is concerned.
export function cards():HTMLElement[] {return Array.from(document.querySelectorAll<HTMLElement>('.content .project'));}


/**
 * Measures groups before their cards so parent deltas are known. Keys namespace groups and bookmarks, and repeated bookmark GUIDs are numbered by stable DOM occurrence.
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
 * List insertion uses horizontal boundaries; grid and compact use vertical position after skipping completed rows. Excludes the dragged card and returns `null` for an end drop.
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


export function gapFor(card:HTMLElement):number {
  const list = card.parentElement;
  const rowGap = list ? parseFloat(getComputedStyle(list).rowGap)||0 : 0;
  return card.getBoundingClientRect().height+rowGap;
}


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
