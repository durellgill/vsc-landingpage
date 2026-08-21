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
  // Plain files use the ordinary file glyph, not the unknown-file glyph.
  return item.icon==='folder' ? 'glyph-folder' : item.icon==='workspace' ? 'fileSliders' : 'file';
}
