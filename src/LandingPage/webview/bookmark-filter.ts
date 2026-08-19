/**
 * Matching and ordering bookmarks. Every function here is pure, which is the point: these are
 * the only parts of the page testable without a DOM, so keep them that way.
 */
import type { LandingPageGroup, LandingPageProject } from '../LandingPageModel';


/**
 * The text a filter query is matched against: the label plus the readable path.
 *
 * Labels alone are not enough to find anything on a real board. Two checkouts of the same
 * project are both called `api`, a folder is only identifiable by where it lives, and typing
 * a directory name used to return nothing at all. The path is decoded and stripped of its
 * `file://` scheme so what you type is what you see on the card.
 */
export function haystack(project:LandingPageProject):string {
  let path = project.path ? project.path.replace(/^file:\/\//,'') : '';
  try {path = decodeURIComponent(path);} catch {/* a malformed escape is not worth failing a search over */}
  return `${project.label}\n${path}`.toLocaleLowerCase();
}


/** The bookmark's target as a reader would write it: no `file://`, no percent-escapes. */
export function displayPath(project:LandingPageProject):string {
  const raw = project.path ? project.path.replace(/^file:\/\//,'') : '';
  try {return decodeURIComponent(raw);} catch {return raw;}
}


/**
 * Splits a query into terms. Every term must match, in any order and anywhere in the
 * haystack, so `vsc land` finds `vsc-landingpage` and `proj api` finds one `api` of several.
 */
export function terms(filter:string):string[] {return filter.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);}


/** Whether a bookmark survives the filter. An empty query matches everything. */
export function matches(project:LandingPageProject, needles:string[]):boolean {
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
export function groupMatches(group:LandingPageGroup, needles:string[]):boolean {
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
export function opensInWindow(project:LandingPageProject):boolean {return project.icon==='folder' || project.icon==='workspace';}


/**
 * Puts pinned bookmarks first, leaving everything else in its stored order.
 *
 * A stable sort rather than a reorder of the model: unpinning has to return a bookmark to
 * where it was, which it cannot do if pinning has already destroyed that position.
 */
export function pinnedFirst(projects:LandingPageProject[]):LandingPageProject[] {
  return projects.map((project,index) => ({project,index}))
    .sort((a,b) => (Number(!!b.project.pinned) - Number(!!a.project.pinned)) || (a.index - b.index))
    .map(entry => entry.project);
}
