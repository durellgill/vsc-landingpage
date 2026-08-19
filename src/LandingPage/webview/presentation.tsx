/**
 * Turning model values into the things drawn for them: icons, glyphs and shade keys.
 *
 * The shade lists are user data - see the palette note in `landingpage.scss`, and D012a for why
 * a bookmark's shade is drawn only on its spine.
 */
import type { LandingPageGroup, LandingPageProject } from '../LandingPageModel';
import { icons } from '../iconography';

export const iconMap = icons as Record<string,string>;

export const shades = ['red','orange','yellow','green','teal','pink','purple','blue','cyan','gray','silver','brown','white','black',''];

export const groupShades = ['purple','teal','orange','pink','blue'];

export const typeShades:Record<string,string> = {folder:'blue', workspace:'purple', file:'teal'};

export const glyphs = Object.entries(icons).filter(([key]) => key.startsWith('glyph-'));


export function Svg({name}:{name:string}) {return <span class="icon" dangerouslySetInnerHTML={{__html:iconMap[name] ?? ''}} />;}

export function shadeForGroup(group:LandingPageGroup) {
  if (group.shade) {return group.shade;}
  if (group.guid==='@vsc-mru') {return 'gray';}
  let hash=0; for (const char of group.guid) {hash=((hash*31)+char.charCodeAt(0))>>>0;}
  return groupShades[hash%groupShades.length];
}

export function iconFor(item:LandingPageProject|LandingPageGroup) {
  if (item.glyph && iconMap[`glyph-${item.glyph}`]) {return `glyph-${item.glyph}`;}
  if ('projects' in item) {return 'glyph-folder';}
  // A plain file, not `fileQuestion`. Bookmarking a file is an ordinary, supported thing, and
  // a question mark on the glyph told every one of them it was unrecognised.
  return item.icon==='folder' ? 'glyph-folder' : item.icon==='workspace' ? 'fileSliders' : 'file';
}
