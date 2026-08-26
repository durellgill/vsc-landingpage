#!/usr/bin/env node
/**
 * Serves the real landing page outside VS Code, with a stubbed extension host.
 *
 * F5 is a slow feedback loop and its DevTools console is awkward to read. `makeHTML()` is
 * pure string substitution, so the identical page can be produced in Node and driven in a
 * browser. The stub does three things the extension host does:
 *
 *  - provides `acquireVsCodeApi()` and records every posted message on `window.__posted`
 *  - waits for the page's `documentReady` before replying with `syncModel`, exactly as
 *    `communication.ts` does - dispatching earlier races the Preact listener, which is
 *    installed in an effect
 *  - answers `refreshRecents` by rebuilding the Recent group, so the refresh control can
 *    actually be exercised
 *
 * Usage: `npm run demo` then open the printed URL. `?empty` renders the empty state.
 */

import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rendererPath = join(root, 'out', 'demo-render.mjs');
const demoCspNonce = 'vsc-landingpage-demo';

/**
 * Loads the renderer, reloading it whenever the build has produced a newer one.
 *
 * Node caches ES modules by specifier for the life of the process, so importing once at
 * startup means every rebuild is invisible until the server is restarted - and a page that
 * silently serves the previous build is worse than no demo at all. The mtime query string
 * is what makes the specifier change.
 */
let cached = {mtime: 0, render: null};
async function renderer() {
  const {mtimeMs} = await stat(rendererPath);
  if (mtimeMs !== cached.mtime) {
    const module = await import(`${pathToFileURL(rendererPath).href}?v=${mtimeMs}`);
    cached = {mtime: mtimeMs, render: module.renderLandingPage};
  }
  return cached.render;
}

const port = Number(process.env.DEMO_PORT || 5599);

/** A model wide enough to exercise every layout, both group kinds and a dead path. */
const model = {
  groups: [
    {
      guid: 'g-work', label: 'Work', layout: 'list', shade: 'purple', projects: [
        {guid: 'p-1', label: 'landing-page', path: 'file:///Users/dev/Projects/landing-page', icon: 'folder', glyph: 'rocket'},
        {guid: 'p-2', label: 'api', path: 'file:///Users/dev/Projects/api', icon: 'folder', shade: 'green'},
        {guid: 'p-3', label: 'notes.md', path: 'file:///Users/dev/Documents/notes.md'},
        {guid: 'p-6', label: 'moved-away', path: 'file:///Users/dev/Projects/moved-away', icon: 'folder'}
      ]
    },
    {
      guid: 'g-play', label: 'Playground', layout: 'grid', projects: [
        {guid: 'p-4', label: 'visual-experiments', path: 'file:///Users/dev/play/visual-experiments', icon: 'folder'},
        {guid: 'p-5', label: 'everything.code-workspace', path: 'file:///Users/dev/play/everything.code-workspace', icon: 'workspace'},
        // Deliberately the same GUID as the `Recent` entry below. A bookmark that is also in
        // the recently-opened list appears twice on the board under one GUID, which is the
        // state the twin check in e2e/flip.spec.ts exists for. It twins the second
        // `Recent` entry rather than the first, because only that one changes position when
        // `Recent` switches layout - and a twin that never moves proves nothing.
        {guid: 'MRU:b', label: 'scratch', path: 'file:///Users/dev/scratch', icon: 'folder'}
      ]
    },
    {
      guid: '@vsc-mru', label: 'Recent', layout: 'compact', projects: [
        {guid: 'MRU:a', label: 'vsc-landingpage', path: 'file:///Users/dev/Projects/vsc-landingpage', icon: 'folder'},
        {guid: 'MRU:b', label: 'scratch', path: 'file:///Users/dev/scratch', icon: 'folder'}
      ]
    }
  ]
};

/**
 * The `--vscode-*` variables the CSS resolves against, taken from Dark Modern, Light Modern
 * and Dark High Contrast. Without these every color in the page falls back to nothing and a
 * visual check is worthless. `?theme=light` and `?theme=hc` render the other two sets.
 *
 * High contrast is not decoration here: the repo's own convention is that every color must
 * resolve to a `--vscode-*` variable and be checked in all three themes, and that theme is the
 * one that punishes anything relying on a subtle fill or a low-contrast border. It is also the
 * theme where a hover effect built from opacity alone stops being visible at all.
 */
const themes = {
  dark: {
    'editor-background': '#1f1f1f', foreground: '#cccccc', 'descriptionForeground': '#9d9d9d',
    'font-family': 'system-ui, sans-serif', 'font-size': '13px', 'editor-font-family': 'ui-monospace, monospace',
    'activityBar-background': '#181818', 'activityBar-foreground': '#d7d7d7',
    'badge-background': '#616161', 'badge-foreground': '#f8f8f8',
    'button-background': '#0078d4', 'button-foreground': '#ffffff', 'button-hoverBackground': '#026ec1',
    'button-secondaryBackground': '#313131', 'button-secondaryForeground': '#cccccc', 'button-secondaryHoverBackground': '#3c3c3c',
    'charts-blue': '#3794ff', 'charts-green': '#89d185', 'charts-purple': '#b180d7',
    'editorHoverWidget-background': '#202020', 'editorHoverWidget-border': '#454545', 'editorHoverWidget-foreground': '#cccccc',
    'editorWidget-background': '#202020', 'editorWidget-border': '#454545',
    errorForeground: '#f85149', focusBorder: '#0078d4', 'icon-foreground': '#cccccc',
    'input-background': '#313131', 'input-border': '#3c3c3c', 'input-foreground': '#cccccc', 'input-placeholderForeground': '#989898',
    'list-hoverBackground': '#2a2d2e',
    'menu-background': '#1f1f1f', 'menu-border': '#454545', 'menu-foreground': '#cccccc',
    'menu-selectionBackground': '#0078d4', 'menu-selectionForeground': '#ffffff', 'menu-separatorBackground': '#454545',
    'panel-border': '#2b2b2b', 'toolbar-hoverBackground': '#383a49', 'terminal-ansiGreen': '#23d18b'
  },
  light: {
    'editor-background': '#ffffff', foreground: '#3b3b3b', 'descriptionForeground': '#3b3b3b99',
    'font-family': 'system-ui, sans-serif', 'font-size': '13px', 'editor-font-family': 'ui-monospace, monospace',
    'activityBar-background': '#f8f8f8', 'activityBar-foreground': '#1f1f1f',
    'badge-background': '#cccccc', 'badge-foreground': '#3b3b3b',
    'button-background': '#005fb8', 'button-foreground': '#ffffff', 'button-hoverBackground': '#0258a8',
    'button-secondaryBackground': '#e5e5e5', 'button-secondaryForeground': '#3b3b3b', 'button-secondaryHoverBackground': '#cccccc',
    'charts-blue': '#1a85ff', 'charts-green': '#388a34', 'charts-purple': '#652d90',
    'editorHoverWidget-background': '#f8f8f8', 'editorHoverWidget-border': '#cecece', 'editorHoverWidget-foreground': '#3b3b3b',
    'editorWidget-background': '#f8f8f8', 'editorWidget-border': '#cecece',
    errorForeground: '#f85149', focusBorder: '#005fb8', 'icon-foreground': '#3b3b3b',
    'input-background': '#ffffff', 'input-border': '#cecece', 'input-foreground': '#3b3b3b', 'input-placeholderForeground': '#767676',
    'list-hoverBackground': '#f2f2f2',
    'menu-background': '#ffffff', 'menu-border': '#cecece', 'menu-foreground': '#3b3b3b',
    'menu-selectionBackground': '#005fb8', 'menu-selectionForeground': '#ffffff', 'menu-separatorBackground': '#d4d4d4',
    'panel-border': '#e5e5e5', 'toolbar-hoverBackground': '#b8b8b850', 'terminal-ansiGreen': '#0dbc79'
  },
  // Dark High Contrast. Pure black ground, white text, and a bright focus color - the theme
  // that shows up anything depending on a faint outline or a translucent fill.
  hc: {
    'editor-background': '#000000', foreground: '#ffffff', 'descriptionForeground': '#ffffff',
    'font-family': 'system-ui, sans-serif', 'font-size': '13px', 'editor-font-family': 'ui-monospace, monospace',
    'activityBar-background': '#000000', 'activityBar-foreground': '#ffffff',
    'badge-background': '#000000', 'badge-foreground': '#ffffff',
    'button-background': '#0078d4', 'button-foreground': '#ffffff', 'button-hoverBackground': '#0078d4',
    'button-secondaryBackground': '#3c3c3c', 'button-secondaryForeground': '#ffffff', 'button-secondaryHoverBackground': '#3c3c3c',
    'charts-blue': '#3794ff', 'charts-green': '#89d185', 'charts-purple': '#b180d7',
    'editorHoverWidget-background': '#0c141f', 'editorHoverWidget-border': '#6fc3df', 'editorHoverWidget-foreground': '#ffffff',
    'editorWidget-background': '#0c141f', 'editorWidget-border': '#6fc3df',
    errorForeground: '#f48771', focusBorder: '#f38518', 'icon-foreground': '#ffffff',
    'input-background': '#000000', 'input-border': '#6fc3df', 'input-foreground': '#ffffff', 'input-placeholderForeground': '#ffffff',
    'list-hoverBackground': '#000000',
    'menu-background': '#000000', 'menu-border': '#6fc3df', 'menu-foreground': '#ffffff',
    'menu-selectionBackground': '#0078d4', 'menu-selectionForeground': '#ffffff', 'menu-separatorBackground': '#6fc3df',
    'panel-border': '#6fc3df', 'toolbar-hoverBackground': '#3c3c3c', 'terminal-ansiGreen': '#23d18b'
  }
};

function themeStyle(name) {
  const vars = Object.entries(themes[name] ?? themes.dark).map(([key, value]) => `--vscode-${key}:${value};`).join('');
  return `<style>:root{${vars}}html,body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);}</style>`;
}

const stub = `<script>
  const model = __MODEL__;
  window.__posted = [];
  window.acquireVsCodeApi = () => ({
    postMessage(message) {
      window.__posted.push(message);
      // Stands in for the host's paging: a refresh carrying "more" appends the next page and
      // clears "hasMore" once the reserve is empty. A plain refresh must not do either, which is
      // the distinction the "Show more" checks turn on.
      // (No backticks in this block: it sits inside a template literal.)
      if (message.command === 'refreshRecents' && message.more) { showMore(); }
      if (message.command === 'unhideRecent') { unhide(message.guid); }
      if (message.command === 'restoreHiddenRecents') { unhideAll(); }
      if (message.command === 'documentReady' || message.command === 'refreshRecents') { sync(); }
      // 'patch' is the host's persist-then-resync path. Applying it here means state that
      // lives in the model - layout, shade, collapsed - actually round-trips in the demo
      // instead of appearing to do nothing.
      if (message.command === 'patch') { patch(message); sync(); }
      // Stands in for copyPath(): the host writes the clipboard and confirms, which is what
      // drives the tick. The webview never assumes success.
      if (message.command === 'copyPath') {
        setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data: {command: 'pathCopied', guid: message.guid}})), 0);
      }
      // The VS Code host opens this in the system browser. The hosted demo has no host, so
      // let its HTTPS deployment provide the equivalent new-tab link without affecting local tests.
      if (message.command === 'openLiveDemo' && location.protocol === 'https:') {
        window.open('https://vsc-landingpage-demo.vercel.app/', '_blank', 'noopener');
      }
      // Stands in for moveBookmark(): a card dragged to another group, or to a new position in
      // its own. Applying it here means a drop that lands in the wrong place is visible on the
      // board rather than only in the message log.
      if (message.command === 'moveBookmark') { moveBookmark(message); sync(); }
      // Stands in for moveGroup(). Without it a group drag was a no-op here and the reorder
      // could only be read off the message log, which is exactly the sort of thing that hides a
      // rendering problem.
      if (message.command === 'moveGroup') { moveGroup(message); sync(); }
      if (message.command === 'documentReady' || message.command === 'refreshRecents') { health(); }
    },
    getState() { return undefined; },
    setState() {}
  });
  // Stands in for reportBookmarkHealth(): the host stats every file: target and reports the
  // ones it could not find, as a separate message that never enters the model.
  //
  // Only user bookmarks appear here in practice. Recent entries that no longer exist are
  // dropped by the host before the model is built, so they never reach the page at all.
  function health() {
    setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data: {command: 'bookmarkHealth', missing: __MISSING__, branches: __BRANCHES__}})), 0);
  }
  function patch(message) {
    for (const group of model.groups) {
      const target = group.guid === message.guid ? group : group.projects.find(p => p.guid === message.guid);
      if (target) { target[message.field] = message.value; return; }
    }
  }
  // toIndex is measured before the dragged group is lifted out, so a downward move loses one
  // place as the gap closes behind it. That adjustment lives in the host's moveGroup(), not the
  // webview, so it has to live here too or the stub disagrees with the real thing.
  // (No backticks anywhere in this function: it sits inside a template literal.)
  function moveGroup(message) {
    const from = model.groups.findIndex(g => g.guid === message.guid);
    if (from < 0) { return; }
    let to = typeof message.toIndex === 'number'
      ? (message.toIndex > from ? message.toIndex - 1 : message.toIndex)
      : from + (message.direction === 'up' ? -1 : 1);
    const [group] = model.groups.splice(from, 1);
    // Generated Recent is pinned to the end and is neither draggable nor a drop target.
    const limit = model.groups.findIndex(g => g.guid === '@vsc-mru');
    const ceiling = limit < 0 ? model.groups.length : limit;
    to = Math.max(0, Math.min(to, ceiling));
    model.groups.splice(to, 0, group);
  }
  function moveBookmark(message) {
    const destination = model.groups.find(g => g.guid === message.toGroup);
    const source = model.groups.find(g => g.projects.some(p => p.guid === message.guid));
    if (!destination || !source || destination.guid === '@vsc-mru') { return; }
    const project = source.projects.find(p => p.guid === message.guid);
    // Recent is a source only: dragging out of it copies, as the host does.
    const copy = source.guid === '@vsc-mru';
    if (!copy) { source.projects.splice(source.projects.indexOf(project), 1); }
    const landed = copy ? {...project, guid: 'copy-' + Math.random().toString(36).slice(2, 8)} : project;
    const at = message.beforeGuid ? destination.projects.findIndex(p => p.guid === message.beforeGuid) : -1;
    destination.projects.splice(at < 0 ? destination.projects.length : at, 0, landed);
  }
  function recent() { return model.groups.find(g => g.guid === '@vsc-mru'); }
  function showMore() {
    const group = recent();
    if (!group) { return; }
    group.projects = group.projects.concat(model.reserve || []);
    model.reserve = [];
    group.hasMore = false;
  }
  // Restoring returns the entry to the visible list, which is the half of the feature a message
  // log cannot show: a page that posts the right guid and never sees the bookmark come back is
  // still broken from where the user sits.
  function unhide(guid) {
    const group = recent();
    if (!group || !group.hidden) { return; }
    const at = group.hidden.findIndex(p => p.guid === guid);
    if (at < 0) { return; }
    const [entry] = group.hidden.splice(at, 1);
    group.projects.push(entry);
    sync();
  }
  function unhideAll() {
    const group = recent();
    if (!group || !group.hidden) { return; }
    group.projects = group.projects.concat(group.hidden);
    group.hidden = [];
    sync();
  }
  function sync() {
    // Mirrors communication.ts: the host replies on its own turn, never synchronously.
    //
    // structuredClone is not decoration. The host mutates its model in place and posts the
    // same object every time, but webview.postMessage serialises across a process boundary,
    // so the page always receives a fresh object. Reposting the same reference in-process
    // makes useState bail out on Object.is and the page silently stops re-rendering - which
    // looks exactly like a broken feature.
    setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data: {command: 'syncModel', model: structuredClone(model)}})), 0);
  }
  window.addEventListener('error', event => { window.__error = String(event.error || event.message); });
</script>`;

/**
 * The board `?recents` serves: a `Recent` group that is hiding entries and has another page
 * behind it.
 *
 * Its own state rather than the default model, because both of those put a control on `Recent`
 * that the default board must not show - and folding them into the shared model would rewrite
 * every appearance baseline to add a button most boards do not have.
 *
 * `reserve` is the rest of the history: what the host would return on the second page. The stub
 * hands it over when the page asks for more, which is what makes `Show more` actually lengthen
 * the list here instead of only appearing in the message log.
 */
function recentsModel() {
  const board = structuredClone(model);
  const recent = board.groups.find(g => g.guid === '@vsc-mru');
  recent.hasMore = true;
  recent.hidden = [
    {guid: 'MRU:hidden-1', label: 'buried-project', path: 'file:///Users/dev/Projects/buried-project', icon: 'folder'},
    {guid: 'MRU:hidden-2', label: 'old-scratch', path: 'file:///Users/dev/old-scratch', icon: 'folder'}
  ];
  board.reserve = [
    {guid: 'MRU:c', label: 'dotfiles', path: 'file:///Users/dev/dotfiles', icon: 'folder'},
    {guid: 'MRU:d', label: 'talks', path: 'file:///Users/dev/talks', icon: 'folder'}
  ];
  return board;
}

/** Renders the landing page demo for the local server and Vercel function. */
export async function renderLandingPageDemo(url) {
  const payload = url.searchParams.has('empty') ? {groups: []}
    : url.searchParams.has('recents') ? recentsModel()
    : model;
  let html = (await renderer())("'self'", demoCspNonce);
  // The stub must be installed before the bundle runs, so it goes ahead of the page script.
  // ?healthy suppresses the missing-target verdict, for checking the undecorated board.
  const missing = url.searchParams.has('healthy') ? [] : ['p-6'];
  // Branch labels the host would have read from .git/HEAD, including a long one to check
  // that the badge truncates rather than pushing the path out of the card.
  const branches = {'p-1': 'main', 'p-2': 'feature/very-long-branch-name-here', 'MRU:a': 'main'};
  const pageScriptTag = `<script nonce="${demoCspNonce}">`;
  html = html.replace(pageScriptTag, stub.replace('__MODEL__', JSON.stringify(payload)).replace('__MISSING__', JSON.stringify(missing)).replace('__BRANCHES__', JSON.stringify(branches)) + `\n${pageScriptTag}`);
  // Theme variables go last in <head> so they win over anything the page defines itself.
  html = html.replace('</head>', themeStyle(url.searchParams.get('theme')) + '</head>');
  // The demo is served over http, where the webview CSP meta tag only gets in the way.
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  return html;
}

const runsAsDemoCommand = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (runsAsDemoCommand) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const html = await renderLandingPageDemo(url);
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    response.end(html);
  });

  server.listen(port, () => {
    console.log(`Landing page demo: http://localhost:${port}/  (append ?empty for the empty state, ?recents for hidden entries and paging)`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { server.close(); process.exit(0); });
  }
}
