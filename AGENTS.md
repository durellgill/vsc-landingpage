# AGENTS.md

Working notes for this repo. Read by Codex natively and by Claude Code via `CLAUDE.md`.

This is a fork of [renebuehling/vsc-landingpage](https://github.com/renebuehling/vsc-landingpage).

## What this extension is

A VS Code extension that replaces the start page with a bookmark board: groups of
bookmarks pointing at folders, workspaces and files, plus a mirror of VS Code's
recently-opened list.

If you have not written a VS Code extension before, the whole thing is three moving parts:

1. **`src/extension.ts` - the extension host.** Plain Node.js. `activate()` runs when the
   extension loads (here: `onStartupFinished`, see `activationEvents` in `package.json`).
   It registers commands and creates the webview panel. This code can use the `vscode` API
   and touch the filesystem.
2. **`src/LandingPage/content/*` - the webview.** An ordinary HTML/CSS/JS page rendered in
   a sandboxed iframe. It **cannot** use the `vscode` API, require modules, or read files.
3. **Message passing between them.** The only bridge. The page calls
   `vscode.postMessage({command:...})`; `src/LandingPage/communication.ts` handles it and
   replies with `webview.postMessage(...)`, which the page receives in its
   `window.addEventListener('message', ...)` handler.

Anything that needs a dialog, the filesystem, or a VS Code command belongs in the extension
host, not the page.

## Build

`npm run compile`. Three steps run in order and **all are required**:

1. `npm run build:css` compiles `landingpage2.scss` to `content/dist/landingpage2.css`.
2. `npm run build:webview` bundles `webview/main.tsx` with Preact to
   `content/dist/landingpage-preact.js`.
3. `webpack` bundles `src/extension.ts` to `dist/extension.js`.

`LandingPageTemplate2.ts` inlines the built CSS, Preact bundle and the raw HTML into one string
via `raw-loader`, substituting these placeholders:

| Placeholder | Replaced with |
|---|---|
| `/*%landingpage2.scss%*/` | the compiled CSS |
| `/*%landingpage-preact.js%*/` | bundled Preact webview |
| `%cspSource%` | `webview.cspSource` (needed by the CSP meta tag) |
| `%assetPath%` | webview URI of `assets/` (custom cursors) |
| `${iconName}` | inline SVG from `iconography.ts` |

Consequences worth knowing:

- **Editing the SCSS or TSX alone does nothing** until its build runs. `npm run watch` starts
  coordinated CSS, Preact and extension watchers for F5.
- **`content/dist/` is generated** and gitignored. Never edit it.
- `landingpage2.js` is retained as the pre-Preact reference implementation. Do not make
  product changes there unless intentionally maintaining the fallback as well.

## Run and debug

- **F5** starts an Extension Development Host with the extension loaded.
- **Ctrl+R** in that window reloads the extension after a rebuild.
- **Ctrl+Shift+I** opens DevTools for the webview - this is the only way to see the page's
  console and inspect its DOM.
- The page only auto-opens in a window with no folder open. Otherwise run
  *Show Landing Page* from the command palette.

## Package and release

- `npx vsce package` builds a `.vsix` (runs `vscode:prepublish` → `package`, so the CSS step
  is included).
- `npx vsce publish` publishes. Bump `version` in `package.json` and update `CHANGELOG.md`
  first.

## Conventions

- All colours in the SCSS must resolve to a `--vscode-*` theme variable. The only literals
  are the `data-shade` bookmark palette. Test dark, light and high-contrast. Do not give the
  page its own background or brand palette - it sits inside the editor and must adopt the
  user's theme.
- Bookmark paint colour belongs on the `.spine` and the type icon, not the card background.
  A wash of a warm shade over a dark editor background goes muddy brown.
- **There are no tool modes and no drag and drop.** Click opens; bookmark-specific actions
  live on the row's `...` menu or right-click menu. Group headers own their visible Add,
  Move up, Move down, and Layout controls; group customisation remains on right-click.
  Bookmarks change group via "Move to group", which shows a native quick pick from the
  extension host.
- **The add flow belongs to its group.** The header Add button opens `.group-composer` directly
  beneath that group and names the destination before the native filesystem picker appears.
  Keep new add actions in this composer rather than moving them to a page-level control.
- **The Explorer context menu is the one exception to the two rules above.**
  `vsc-landingpage.addToGroup` (Explorer and editor tab context menus) is initiated outside the
  page, so it uses native quick pick and input box, and works even when the landing page has
  never been opened in that window. That is why `extension.ts` loads the model in `activate()`
  rather than when the panel is created - starting from an empty model there would save over
  the user's stored groups.
- **Text entry stays in the webview.** Rename uses the compact editor in `#ctxmenu`, and clone
  uses the command-bar field. Do not introduce `vscode.window.showInputBox` for actions
  initiated from this page. Confirmation states also stay beside their action in the menu.
- Anything opened over the page dims it with an **alpha colour, never `opacity`**. `opacity`
  on a parent creates a stacking context children cannot exceed, so a scrim built with
  `opacity` silently renders its own dialog translucent too.
- `webview/main.tsx` owns UI rendering. It receives `syncModel` from the host and emits the
  established `vscode.postMessage` commands. Preserve that boundary when adding features.
- Bookmark and group icons: `LandingPageProject.glyph` and `LandingPageGroup.glyph` hold the
  key suffix of a `glyph-*` entry in `iconography.ts` (`rocket` → `glyph-rocket`). Empty or
  absent bookmark glyphs fall back to their file, folder, or workspace type icon; groups fall
  back to the folder glyph. **Add glyph keys, never rename them** - the key is persisted in
  user data, so renaming orphans existing bookmarks and groups.
- Accent colours are structural: groups use them for their header tab, title and divider;
  bookmarks use them for their spine and icon container. The webview assigns colourful stable
  defaults to groups and type-based defaults to unpainted bookmarks. Restrict swatch CSS to
  `.palette div[data-shade]` - a global `div[data-shade]` selector styles model containers.
- Group layouts are `list` (default), `grid` and `compact`; the button in the group header
  cycles them in that order. Adding a layout means updating `main.tsx`, the union in
  `LandingPageModel.ts`, and the matching SCSS block.
- Group ordering is explicit, not drag-and-drop. `moveGroup` swaps adjacent user-created
  groups, persists the result, and keeps generated `@vsc-mru` Recent at the end. A reordered
  sync must use `forceRebuild` because the DOM sync is keyed by GUID and does not otherwise
  reposition existing group elements.
- Prefer `outline` over `border` for hover/selection indicators - a border occupies layout
  space and reflows the row when it appears.
- Never set `overflow` on one axis alone for a container that anything escapes (tooltips,
  menus). CSS computes the other axis from `visible` to `auto`, silently creating a clipping
  context.
- The Preact webview is keyed by GUID. Keep `data-guid` and `data-shade` on rendered
  groups and bookmarks because the CSS and harness use them.
- MRU bookmark GUIDs must be derived from the target path, never from list position. See the
  note in `history.ts`. The Recent group is generated and sealed: its entries can only be
  hidden locally through `landingPageHiddenMruGuids`, never removed from VS Code history.
  The Recent group's menu restores all locally hidden entries.
