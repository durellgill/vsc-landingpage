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
 * Usage: `npm run harness` then open the printed URL. `?empty` renders the empty state.
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLandingPage } = await import(join(root, 'out', 'harness-render.mjs'));

const port = Number(process.env.HARNESS_PORT || 5599);

/** A model wide enough to exercise every layout, both group kinds and a dead path. */
const model = {
  groups: [
    {
      guid: 'g-work', label: 'Work', layout: 'list', shade: 'purple', projects: [
        {guid: 'p-1', label: 'landing-page', path: 'file:///Users/dev/Projects/landing-page', icon: 'folder', glyph: 'rocket'},
        {guid: 'p-2', label: 'api', path: 'file:///Users/dev/Projects/api', icon: 'folder', shade: 'green'},
        {guid: 'p-3', label: 'notes.md', path: 'file:///Users/dev/Documents/notes.md'}
      ]
    },
    {
      guid: 'g-play', label: 'Playground', layout: 'grid', projects: [
        {guid: 'p-4', label: 'shader-toys', path: 'file:///Users/dev/play/shader-toys', icon: 'folder'},
        {guid: 'p-5', label: 'everything.code-workspace', path: 'file:///Users/dev/play/everything.code-workspace', icon: 'workspace'}
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
 * The `--vscode-*` variables the SCSS resolves against, taken from Dark Modern and Light
 * Modern. Without these every colour in the page falls back to nothing and a visual check is
 * worthless. `?theme=light` renders the light set.
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
    'panel-border': '#2b2b2b', 'toolbar-hoverBackground': '#383a49'
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
    'panel-border': '#e5e5e5', 'toolbar-hoverBackground': '#b8b8b850'
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
      if (message.command === 'documentReady' || message.command === 'refreshRecents') { sync(); }
    },
    getState() { return undefined; },
    setState() {}
  });
  function sync() {
    // Mirrors communication.ts: the host replies on its own turn, never synchronously.
    setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data: {command: 'syncModel', model}})), 0);
  }
  window.addEventListener('error', event => { window.__error = String(event.error || event.message); });
</script>`;

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const payload = url.searchParams.has('empty') ? {groups: []} : model;
  let html = renderLandingPage('/assets', "'self'");
  // The stub must be installed before the bundle runs, so it goes ahead of the page script.
  html = html.replace('<script>', stub.replace('__MODEL__', JSON.stringify(payload)) + '\n<script>');
  // Theme variables go last in <head> so they win over anything the page defines itself.
  html = html.replace('</head>', themeStyle(url.searchParams.get('theme')) + '</head>');
  // The harness is served over http, where the webview CSP meta tag only gets in the way.
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  response.end(html);
});

server.listen(port, () => {
  console.log(`Landing page harness: http://localhost:${port}/  (append ?empty for the empty state)`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { server.close(); process.exit(0); });
}
