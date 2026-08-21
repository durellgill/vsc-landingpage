import type { LandingPageGroup, LandingPageProject } from '../LandingPageModel';


/**
 * Searches labels and decoded display paths with the `file://` scheme removed.
 */
export function haystack(project:LandingPageProject):string {
  let path = project.path ? project.path.replace(/^file:\/\//,'') : '';
  try {path = decodeURIComponent(path);} catch {/* a malformed escape is not worth failing a search over */}
  return `${project.label}\n${path}`.toLocaleLowerCase();
}


export function displayPath(project:LandingPageProject):string {
  const raw = project.path ? project.path.replace(/^file:\/\//,'') : '';
  try {return decodeURIComponent(raw);} catch {return raw;}
}


/**
 * Splits the query into terms; every term must match, in any order.
 */
export function terms(filter:string):string[] {return filter.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);}


export function matches(project:LandingPageProject, needles:string[]):boolean {
  if (needles.length===0) {return true;}
  const hay = haystack(project);
  return needles.every(needle => hay.includes(needle));
}


export function groupMatches(group:LandingPageGroup, needles:string[]):boolean {
  if (needles.length===0) {return true;}
  const label = group.label.toLocaleLowerCase();
  return needles.every(needle => label.includes(needle));
}


export function opensInWindow(project:LandingPageProject):boolean {return project.icon==='folder' || project.icon==='workspace';}


export function offersNewWindow(project:LandingPageProject, codeCliAvailable:boolean):boolean
{
  return opensInWindow(project) || (project.icon==='file' && codeCliAvailable);
}


export function pinnedFirst(projects:LandingPageProject[]):LandingPageProject[] {
  return projects.map((project,index) => ({project,index}))
    .sort((a,b) => (Number(!!b.project.pinned) - Number(!!a.project.pinned)) || (a.index - b.index))
    .map(entry => entry.project);
}
