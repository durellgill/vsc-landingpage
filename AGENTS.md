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

`npm run compile`. Two Vite builds run **in that order, and the order matters**:

1. `npm run build:webview` (`vite.config.webview.mts`) bundles `webview/main.tsx` with Preact
   to `content/dist/landingpage-preact.js`, as a single self-contained IIFE.
2. `npm run build:extension` (`vite.config.extension.mts`) bundles `src/extension.ts` to
   `dist/extension.js` as CommonJS, with `vscode` and Node builtins external.

Step 2 imports the output of step 1 as text, so a stale webview bundle silently ships an old
page. There is no separate CSS step: `LandingPageTemplate2.ts` imports the SCSS with
`?inline`, so Vite compiles Sass as part of the extension build.

`LandingPageTemplate2.ts` inlines the compiled CSS, the Preact bundle and the raw HTML into
one string using Vite's `?raw` and `?inline` imports, substituting these placeholders:

| Placeholder | Replaced with |
|---|---|
| `/*%landingpage2.scss%*/` | the compiled CSS |
| `/*%landingpage-preact.js%*/` | bundled Preact webview |
| `%cspSource%` | `webview.cspSource` (needed by the CSP meta tag) |
| `%assetPath%` | webview URI of `assets/` (custom cursors) |
| `${iconName}` | inline SVG from `iconography.ts` |

Consequences worth knowing:

- **Editing the SCSS or TSX alone does nothing** until its build runs. `npm run watch` starts
  both Vite watchers for F5.
- **Icon SVGs are imported with `?raw`**, which returns the file untouched - including the
  `width="24" height="24"` the old `svg-inline-loader` stripped. `iconography.ts` strips them
  itself now, so icons stay sized by the SCSS.
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

### The browser harness

`npm run harness` builds everything and serves the *real* page at `http://localhost:5599`
with a stubbed extension host. This is the fast loop: an ordinary browser console, an
ordinary DOM inspector, and every message the page posts recorded on `window.__posted`.

- `?empty` renders the empty state, `?theme=light` the light theme. The harness supplies the
  `--vscode-*` variables itself, so colours are real rather than missing.
- The stub replies to `documentReady` before sending `syncModel`, exactly as
  `communication.ts` does. Dispatching earlier races the Preact listener, which is installed
  in an effect.
- Assert on messages, not on looks: stub-posted commands are the behaviour. Screenshots only
  confirm appearance.

The page it serves is built by `vite.config.harness.mts` from `renderLandingPage()`, the same
pure function `LandingPageTemplate2.makeHTML()` calls - so what you see is what the webview
gets.

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
- **There are no tool modes, and dragging reorders groups only.** Click opens;
  bookmark-specific actions live on the row's `...` menu or right-click menu. Group headers
  own their visible Add and Layout controls; group customisation remains on right-click.
  Bookmarks change group via "Move to group", which shows a native quick pick from the
  extension host - bookmarks themselves are not draggable.
- **Creating has two entry points, and they differ by destination.** The group header's Add
  button opens `.group-composer` beneath that group, so the destination is implied by where
  it was clicked. The page header's **New** menu is global and names no group, so the host
  resolves the destination with `pickDestinationGroup()` - a native quick pick, skipped when
  only one group exists. Both end in the same `createBookmark` / `createDirectory` handlers;
  a missing `guid` on those messages is what marks the action as page-level.
- **Cloning is deliberately small.** It is a rare action, so it lives as an icon button in
  the header that opens a one-field popover. Do not promote it back into the command bar -
  that bar belongs to the filter, which is the frequent action.
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
- Groups are reordered by dragging their title bar. `moveGroup` accepts either a one-step
  `direction` or an explicit `toIndex`, persists the result, and keeps generated `@vsc-mru`
  Recent at the end - Recent is neither draggable nor a drop target. A reordered sync must
  use `forceRebuild` because the DOM sync is keyed by GUID and does not otherwise reposition
  existing group elements.
  Two things about the drag are easy to get wrong:
  - **`toIndex` is measured before the dragged group is lifted out.** It is the insertion
    point the drop indicator was drawn at, so a downward move loses one place once the gap
    closes behind it. That adjustment lives in `moveGroup`, not the webview.
  - **Stop the drop event at the group.** `.content` carries a drop handler for the gaps
    between groups, so a drop on a group that bubbles fires both handlers and posts
    `moveGroup` twice.
- Prefer `outline` over `border` for hover/selection indicators - a border occupies layout
  space and reflows the row when it appears.
- Never set `overflow` on one axis alone for a container that anything escapes (tooltips,
  menus). CSS computes the other axis from `visible` to `auto`, silently creating a clipping
  context.
- The Preact webview is keyed by GUID. Keep `data-guid` and `data-shade` on rendered
  groups and bookmarks because the CSS and harness use them.
- MRU bookmark GUIDs must be derived from the target path, never from list position. See the
  note in `history.ts`. That is also why every `Recent` resync sets `forceRebuild`: a
  reordered history changes positions without changing keys, and the DOM sync is keyed by GUID.
- **`Recent` goes stale on its own and has three ways to be refreshed.** The list mirrors VS
  Code history, which changes while the panel sits in a background tab. `refreshRecents` in
  `communication.ts` is the single implementation, reached from the refresh control on the
  Recent group header, from `onDidChangeViewState` when the panel becomes visible, and from
  the *Landing Page: Refresh Recent* palette command. The Recent group is generated and sealed: its entries can only be
  hidden locally through `landingPageHiddenMruGuids`, never removed from VS Code history.
  The Recent group's menu restores all locally hidden entries.
- **Anything a user sets on a Recent *entry* belongs in `landingPageMruCustomisations`, not on
  the project object.** `populateVscMru()` runs before almost every message and replaces
  `@vsc-mru`'s `projects` wholesale from VS Code's history, so a field written onto one of
  those objects is gone by the next message. The overlay is keyed by MRU GUID and re-applied
  after every rebuild; `patch` routes `shade` and `glyph` into it via `customiseMru()`. The
  Recent *group* itself is an ordinary model object and keeps its own shade, glyph and layout
  directly - only its generated children need the overlay.
- Accent colour and custom icon are available on **every** group and bookmark including the
  sealed Recent group, which is why those two entries sit outside the `!sealed` branch of the
  action menu and why the group header's settings button is not marked `ifn-sealed`.
