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

Two Vite 8 details that cost time:

- `minify: 'esbuild'` fails - esbuild is no longer bundled. Use `'oxc'`.
- `tsconfig.json` needs an explicit `"include": ["src"]`, or `tsc` pulls the `.mts` config
  files into the program and fails them against `rootDir`.

Consequences worth knowing:

- **Editing the SCSS or TSX alone does nothing** until its build runs. `npm run watch` starts
  both Vite watchers for F5.
- **Icon SVGs are imported with `?raw`**, which returns the file untouched - including the
  `width="24" height="24"` the old `svg-inline-loader` stripped. `iconography.ts` strips them
  itself now, so icons stay sized by the SCSS. **It must only touch the opening `<svg>` tag.**
  Eleven of the icons are drawn from `<rect>` children whose own `width`/`height` are geometry,
  not sizing; stripping those collapses them to nothing and the icon renders blank - which is
  what happened to both layout buttons.
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

- `?empty` renders the empty state, `?theme=light` the light theme and `?theme=hc` Dark High
  Contrast. The harness supplies the `--vscode-*` variables itself, so colours are real rather
  than missing. The convention above says to check all three themes, and `hc` existed nowhere
  until it was needed - it is the theme that punishes anything leaning on a faint outline or a
  translucent fill, so it is the one worth opening after a visual change.
- `npm run motion-check` asserts the six motion behaviours that have actually broken here, against
  a running harness: interrupted card flights keeping their direction, a group and its cards
  moving as one body, the destructive confirmation refusing a double-click but accepting a
  deliberate one, the action menu staying on screen both when opened and when it grows, the focus
  ring not easing, and reduced motion downgrading every entrance to opacity while leaving the
  confirmation safeguard armed. All six were invisible to the build, the typecheck and the lint,
  because every one is a behaviour rather than a value. The checks were validated by
  reintroducing two of the bugs and confirming they fail - a check that has never been seen to
  fail is not evidence of anything, which this repo already learned the hard way from a CSS rule
  that tested green while matching no element at all.
- The stub applies `moveGroup` as well as `moveBookmark` and `patch`, so a group drag actually
  reorders the board here. Until it did, a group reorder could only be read off the message log,
  which is precisely the kind of gap that hides a rendering bug - the group chrome teleporting
  while its cards glided was invisible for exactly that reason.
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
- **An accent that is painted as a fill cannot be written as text.** The fourteen `data-shade`
  literals are chosen to sit *against* a background. Used as a foreground they are frequently
  illegible: measured against the page background, white is 1.04:1 on the light theme, black
  1.02:1 on dark and 1.30:1 on high contrast, where small text needs 4.5:1 - and the palette
  offers all fourteen with no hint that half of them vanish on the current theme. Anything
  drawing a glyph or a word in the accent therefore takes `--shade-readable`
  (`color-mix(in srgb, var(--shade-color) 30%, var(--vscode-foreground))`), or
  `--group-accent-text`, which is the group-scoped form of the same thing. 30% is a measured
  floor, not a taste call: it clears 4.5:1 for all fourteen shades in all three themes, worst
  case 4.65:1, and 40% does not - white lands at 3.57:1 on light. Fills keep the raw literal:
  the spine, the group's header tab, the divider and the icon container are all backgrounds.
  `--shade-foreground` is a different, older variable that is declared fourteen times and
  consumed nowhere; it is not this.
- **There are no tool modes.** Click opens; bookmark-specific actions live on the row's `...`
  menu or right-click menu. Group headers own their visible Add and Layout controls; group
  customisation remains on right-click.
- **Bookmarks are dragged, and "Move to group" stays.** A card can be dropped on another group
  or at a new position inside its own; the menu item, which shows a native quick pick, is the
  keyboard-reachable route and the sane one on a long board where the destination is off
  screen. Both end in the model change described below. Four things the drag needs:
  - **Recent is a source, never a destination.** `@vsc-mru` is rebuilt from VS Code's history
    on almost every message, so a bookmark moved into it would vanish on the next sync and one
    moved out of it would come straight back. Dragging out of Recent therefore *copies*, which
    is what `moveToGroup()` already does from the menu. Recent is left undecorated during a
    drag so this is visible before the pointer is released.
  - **`beforeGuid` names the landing point, not an index.** Pinned bookmarks are rendered
    first, so a rendered position is not a stored one. `moveBookmark()` resolves the index
    against the destination array *after* the bookmark has been lifted out, so moving one down
    inside its own group does not lose a place as the gap closes behind it - the opposite of
    `moveGroup()`, which is given a `toIndex` measured before the lift and adjusts for it.
  - **The drop path must not read rendered state.** Which group receives the drop comes from
    the carried GUID, set at dragstart, and the insertion point is measured again in the drop
    handler. A drag that ends in the same frame as the dragover before it would otherwise use
    a `carry` state Preact has not painted. The highlight is state; the decision is geometry.
  - **The card clips its own children** so the spine follows its rounded corners, which also
    clips away a landing line drawn in the gap outside it - hence `overflow: visible` while
    `[data-drop]` is set. The line is horizontal in list layout and vertical in the two
    wrapping ones, matching how `insertionPoint()` measures.
- **The delete zone is armed by dwell, and that is a safeguard rather than an animation.** It
  is rendered only while a bookmark is being carried - a permanently visible delete target is a
  permanent invitation - and pinned to the right edge, which is the one part of the window the
  board never uses because `.page` is capped at `--page-max` and left-aligned. A drag is far
  easier to make by accident than a menu item is to click, so a drop does nothing until the
  pointer has rested in the zone for `--dur-arm`: the same duration and the same reasoning as
  the menu's `Remove?` confirmation, which is held non-interactive while it fades in. The
  middle state matters as much as the other two - hovered-but-not-armed stays dashed and muted
  and advertises `dropEffect: 'none'`, so neither the panel nor the cursor claims a release
  will do something it will not. **Recent is hidden, never removed**, exactly as the action
  menu already splits those two cases, and the label says which one will happen. The zone is
  `aria-hidden`: it is a drop target that cannot be operated from a keyboard at all, and both
  actions it offers are already on the bookmark's menu.
- **"New folder on disk" opens the native dialog first and never asks for a group.** It is an
  action about creating a folder; asking which group to file it under before anything exists
  is a bookmarking question asked too early. The destination falls back to the first
  user-created group (`defaultGroup()`), resolved only *after* the folder exists so a failed
  create cannot leave a stray empty group behind. The group header's Add button remains the
  way to choose a destination explicitly.
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
- **The branch label comes from `.git/HEAD`, not from the Git extension.** `readGitBranch()`
  reads at most two small files. Going through `vscode.git` would make the label depend on an
  extension the user can disable and on which repositories it has chosen to open. It handles
  all three shapes `.git` takes: a directory, a `gitdir:` pointer file (worktrees and
  submodules, absolute or relative), and a detached HEAD, which reports a short commit id.
  Not being a repository is the common case, not an error.
- **`bookmarkHealth` carries everything the host observed on disk** - currently missing
  targets and branches. Add to that message rather than inventing a second one; it is sent
  unawaited after each sync so the board paints first and gets decorated a moment later.
- **Pinning sorts, it does not reorder.** `LandingPageProject.pinned` moves a bookmark to
  the top of its group through a stable sort in `pinnedFirst()`; the stored order is left
  untouched, so unpinning returns it to where it was rather than to wherever the pin dropped
  it. Two pinned bookmarks keep their stored order relative to each other, not their pin
  order. Recent entries can be pinned too, which is why `pinned` is in `MruCustomisation` -
  on the project object it would not survive the next `populateVscMru()`. Unpinning sends
  `undefined`, not `false`, so the overlay entry is dropped instead of accumulating.
- **A missing target is dropped from `Recent` but flagged in a user group.** Recent mirrors
  what you have opened and is rebuilt every sync, so a dead entry there is noise you have no
  way to remove - it is filtered out. A bookmark in your own group is one you deliberately
  made, so it is flagged and left for you to deal with.
- **`maxRecentItems` counts what is *shown*, so both Recent exclusions happen before the
  cap.** Hidden entries and vanished targets are removed first, and `takeExisting()` reaches
  further down VS Code's history to fill the quota - otherwise hiding five entries left
  fifteen on screen, and the group's count badge disagreed with the list. Both exclusions
  belong in the host for that reason: the badge renders `projects.length`, so anything the
  webview filtered out would desync it. `takeExisting()` stats in batches and stops once the
  quota is full, so the common case checks barely more than `limit` paths, not the hundreds
  of entries the history can hold.
- **A bookmark whose target is gone is marked, never hidden or disabled.** The host stats
  every `file:` target and posts a `bookmarkHealth` message listing the GUIDs it could not
  find. This is observed state and deliberately stays out of the model: persisting it would
  let a stale verdict outlive the file coming back. Only `file:` targets are checked - a
  remote or virtual path can be perfectly valid while its provider is not registered, and
  flagging those would be worse than not checking. The card keeps its accent, icon, tab stop
  and click behaviour; only the spine colour and a badge change, because removing someone's
  bookmark is not this page's decision.
- **Groups fold, and the fold is model state.** `LandingPageGroup.collapsed` is persisted
  through `patch`, so a tidied board stays tidy across reloads and windows - including the
  generated `Recent` group, which is an ordinary model object and only needs the MRU overlay
  for its *children*. An active filter overrides the stored fold for as long as the query
  lasts, without writing to it: showing someone a collapsed group that silently contains
  their search hit is the worst of both. A folded group does not render its cards at all
  rather than hiding them with CSS, because the cards are tab stops and `cards()` would
  otherwise still find them.
- **Opening in a new window is folder- and workspace-only.** `vscode.open` has no
  new-window form for a plain file, so the `newWindow` flag on the `open` message is withheld
  for files rather than sent and quietly ignored. Three entry points, all gated the same way:
  Ctrl/Cmd+click, Ctrl/Cmd+Enter, and the *Open in new window* item in the bookmark menu.
- **The filter searches labels, paths and group names, and every term must match.** A board
  has two checkouts called `api`; a label-only search cannot tell them apart, and typing a
  directory name found nothing at all. `haystack()` in `main.tsx` is label plus decoded path;
  `terms()` splits the query on whitespace and all terms must hit, so `vsc land` finds
  `vsc-landingpage`. Naming a group shows that whole group rather than filtering inside it.
- **The page is keyboard-drivable and must stay that way.** Bookmark cards are tab stops
  (`tabindex="0"`); arrow keys move focus, Enter or Space opens, Home/End jump, `/` and
  Ctrl/Cmd+F reach the filter, Escape unwinds menu then filter then focus. Arrow movement is
  *geometric* - `neighbour()` in `main.tsx` measures the cards' rectangles rather than
  indexing an array, because list is a flex column, grid is a width-dependent CSS grid, and
  compact wraps. Anything that adds a new card layout gets this for free; anything that adds
  a new interactive surface must not become a keyboard dead end.
  Four things that were dead ends and are now load-bearing rules:
  - **The window key handler must not treat focus inside a card as focus on the card.** The
    row's Copy and More-actions buttons live inside `.project`, and the handler is on `window`
    at bubble phase - so its `preventDefault()` cancelled the synthetic click the button was
    about to receive. Enter on Copy opened the bookmark, Space did both, and the arrow keys
    jumped away from inside the button. `active?.closest('button')` bails out before the
    card branch; Ctrl/Cmd+C is deliberately checked above it and stays reachable.
  - **Anything that opens takes focus, and gives it back.** The action menu renders at the end
    of `<main>`, after every group, so a menu opened from the first card was thirty tab stops
    away. Both palettes are worse: `ActionMenu` returns the palette *in place of* itself, so
    without a focus move the keyboard user was left in a surface with nothing focusable in it
    at all. `menuTrigger` holds the opener and `closeMenu()` restores to it.
  - **A click synthesised from the keyboard reports its coordinates as 0.** `useAnchored` was
    then pinning every keyboard-opened menu to the viewport's top-left corner. `openMenu`
    falls back to the trigger's own `getBoundingClientRect()`.
  - **A control that only a pointer can reach is not finished.** Reordering groups was a
    title-bar drag and nothing else; the host's `moveGroup` had accepted a one-step
    `direction` the whole time and only the menu item was missing.
- **`aria-label` replaces the name computed from content, so a card must not carry one.**
  Bookmark cards used `aria-label={project.label}`, which silently threw away everything else
  on the card - the path, the branch badge, and the `Missing` badge, which is rendered as that
  literal word precisely so the state is not carried by colour alone. Cards point
  `aria-labelledby` at `.project-label` and `aria-describedby` at `.project-path` instead, so
  there is no second copy of the text to fall out of step. Icon-only buttons that repeat per
  group (Add, Layout, Settings) name their group, or a screen reader reads six identical ones.
- **Asynchronous acknowledgements go through the one live region.** The copied-path tick, the
  finished Recent refresh and the filter's result count are all confirmations of something the
  user just did, delivered visually only. `.sr-only` + `role="status"` in `App` carries all
  three. `polite`, never `assertive`: the filter one fires on every keystroke.
- **The bookmark label is `.project-label`, and the path line is a flex row.** The SCSS used
  to hook the label with `[data-field="project.label"]`, an attribute only the pre-Preact page
  emitted - so every label in all three layouts silently lost its weight, ellipsis and line
  clamp. Style card internals through real classes, and check a rule actually matches before
  trusting it. The path line carries inline badges as well as text, so it is `display: flex`
  with `align-items: center`; baseline alignment left the badges off by a fraction of a pixel.
- **In grid layout the icon pins to the label's first line**, not the centre of the card.
  Centring it re-positions the icon whenever a label wraps to two lines, so neighbouring cards
  in the same grid ended up with icons at different heights. `.textblock` is `display: contents`
  there, so the label and path need explicit `grid-column`/`grid-row` or the path auto-places
  underneath the icon.
- **Hovering a bookmark opens a detail popover, built on the Popover API.** The card
  truncates its path, so this is the only place the whole target is legible; it also carries
  the branch and the missing-target notice. `popover` puts it in the **top layer**, which is
  the reason to use it here - it escapes every `overflow` and stacking context on the page
  without a z-index, and this page has a history of exactly that bug. Three things it needs:
  the UA stylesheet's `inset: 0; margin: auto; border; padding` must all be undone before it
  can be placed by hand; it must be `pointer-events: none`, or it steals the hover that
  opened it and flickers; and one element is shared by the whole board, since only one
  bookmark can be pointed at. Nothing interactive belongs in it - a button inside is what
  forced `pointer-events: auto` and the grace-period timers that came with it.
- **Never set `display` on a `[popover]` outside its open state.** The UA stylesheet hides a
  closed popover with `[popover]:not(:popover-open) { display: none }`, and *any* author
  `display` beats it - author rules win over UA rules regardless of specificity. A bare
  `display: flex` on the hover card left it permanently rendered as an empty bordered box,
  parked at its last position. Scope the layout to `&:popover-open`. The same applies to the
  UA's `inset: 0; margin: auto; border; padding`, which must all be undone before a popover
  can be positioned by hand.
- **The hover card only opens when something is actually cut off.** `isClipped()` checks the
  label, path and branch; when all three fit, the card would pop up to repeat text already on
  screen. That is why **copy lives on the bookmark, not in the card**: `.rowcopy` sits beside
  the `...` button and appears on hover or focus, so the action is reachable whether or not
  anything is truncated. It stays on the bookmark menu and Ctrl/Cmd+C as well. The card is
  display only, which is what lets it stay `pointer-events: none` with no grace period between
  leaving a bookmark and closing it.
- **Out-of-flow row buttons have to be paid for in padding.** `.rowcopy` and `.rowmenu` are
  absolutely positioned at the card's top-right, so nothing reflows when they appear - but
  they will happily sit on top of the text. List and compact reserve `46px` of right padding
  and grid pads the label by `44px`; a third button means all three numbers change together.
- **Copied paths are shell-quoted, but only when they need it.** `shellQuote()` in
  `communication.ts` wraps a path in single quotes (double on Windows) when it contains
  whitespace or a shell metacharacter, escaping embedded single quotes as `'\''`. Quoting
  unconditionally would be wrong the moment the path is pasted somewhere that is not a shell.
  The clipboard write goes through `vscode.env.clipboard`, not the webview's
  `navigator.clipboard`, which needs a permission and gesture the webview cannot guarantee.
  The tick is driven by the host's `pathCopied` reply, never assumed on click.
- **The page carries deep bottom padding on purpose.** The last bookmark needs room beneath
  it for its hover card, and the page must scroll far enough to expose that room.
- **Right-click closes the hover card.** The two describe the same bookmark and would stack;
  opening a menu is deliberate, so it wins, and the pending hover timers are cleared with it
  or the card reappears over the menu.
- **Hover and focus are delegated from `.content`, not bound per card.** `mouseenter` and
  `mouseleave` do not bubble and cannot be delegated at all, so it listens for
  `mouseover`/`mouseout` and ignores moves between children of the same card. Pointer hover
  is delayed; keyboard focus is not, because focusing something is deliberate.
- **Group hover must not change size.** Growing the accent bar and tracking the title out
  shoved the count badge and divider sideways and made the group appear to swell as the
  pointer crossed it. Hover feedback belongs in colour and opacity - things that do not
  occupy layout.
- **`text-overflow: ellipsis` does nothing on a flex item.** It styles a block container's
  own text, so a badge that becomes `display: flex` to align its icon stops truncating and
  starts cutting mid-word instead. Give the text its own block inside - that is what
  `.branch-name` and `.path-text` are for.
- **Resolve a destination only after the irreversible step has succeeded.** `createDirectory`
  originally called `defaultGroup()` before creating the folder, and `defaultGroup()` can
  append a group to the model - so a failed `fs.createDirectory` left a stray empty group
  behind, to be saved by the next unrelated write.
- **Motion comes from tokens, and there are only seven of them.** Three curves (`--ease-out`
  for anything arriving or responding to the pointer, `--ease-move` for something travelling
  between two positions, `--ease-hover` for colour under the pointer) and four durations
  (`--dur-press` .1s, `--dur-hover` .15s, `--dur-enter` .18s, `--dur-move` .22s), all declared
  at the top of `landingpage2.scss`. Nothing on this page is slow enough to need a fifth
  duration; a hand-typed `.16s` at a call site is how the page previously ended up with six
  near-identical values. The two JS animations read `--dur-move` and `--ease-move` out of the
  computed style via `motion()` in `main.tsx` rather than restating them, so the FLIP flight
  and a CSS transition of the same gesture cannot drift apart.
  Two invariants hold the scale together, both of which were broken before they were written
  down. **`--dur-enter` appears only on `animation`, never on `transition`** - everything it
  times is an element arriving, and when it crept onto transitions it collected a hover effect
  (the group hairline) and a drag response (the gap under a carried bookmark), each then running
  at a different speed from the identical gesture beside it. **Anything that follows the pointer
  takes `--dur-hover`**, whether it is a colour, a growth or a movement: the spine, the hairline,
  the drag gap and the drop indicators. That last pair are entrances deliberately timed on
  `--dur-hover` rather than `--dur-enter`, because they retarget continuously mid-drag and a
  pointer waiting on its own feedback reads as lag whatever the curve is doing.
  Two halves of one gesture share a duration: the fold chevron is on `--dur-move` because the
  group height it describes is animated at `--dur-move` from `GroupShelf`, and at different
  speeds the chevron finished early and sat there while the group was still closing. They now
  settle within a frame of each other, measured at 196ms and 213ms.
  **The group's height is not always the same gesture, so `motion()` takes the token as an
  argument.** A fold, a layout switch and a filter are considered changes and take
  `--dur-move`. The space that opens under a dragged bookmark is pointer feedback: the cards
  slide into it on a `--dur-hover` transition, and the box that has to contain them was
  growing at `--dur-move` - so everything below the group carried on being pushed down for
  62ms after the movement had visibly stopped, and the board appeared to settle twice.
  Measured in the harness at 150ms against 212ms, now both at 127ms. This is the same defect
  as the fold chevron above, arriving from the opposite direction, and it is the reason the
  height effect compares the *reserved padding* between renders rather than the height: the
  drag gap is the only height change `GroupShelf` makes that the pointer drives, and the
  height alone cannot say which gesture caused it.
- **Anything that opens grows out of what opened it.** The action menu, both palettes, the
  New/clone popover and the bookmark hover card all scale up from the corner nearest their
  trigger, never from their own middle - a surface that expands away from the click reads as
  unrelated to it. Two of those corners are constants and are written straight into the CSS
  (`.popover` always hangs below-right of its button; the hover card is told `data-side` by its
  positioning effect). The menu and palettes are placed at raw pointer coordinates, so
  `useAnchored()` in `main.tsx` measures them, flips them to the other side of the pointer when
  they would not fit, and writes the resulting corner into `--origin-x`/`--origin-y` for the
  animation to scale from. Before that hook existed these were never measured at all: a
  right-click near the bottom-right corner opened a menu 164px past the right edge and 250px
  below the bottom, with most of its items unreachable. Note the palettes are `position:
  absolute` inside `.modal`, which is fixed at `left: var(--rail-width)` - the clamp arithmetic
  is viewport-relative and stays correct only while `--rail-width` is 0.
  **Placing once is not enough.** These surfaces change size while open: the action menu swaps
  its Remove row for a confirmation *plus* a Cancel row, and the rename row is taller than the
  button it replaces. `x` and `y` do not change when that happens, so the effect does not re-run
  and nothing else notices - a menu clamped just inside the bottom margin grew 14px back out of
  it, and Cancel was the item that fell off, which is precisely the one that must never be
  unreachable. A `ResizeObserver` on the surface re-places it, plus a `window` resize listener,
  since the webview is a panel the user can drag-resize under an open menu. Neither can loop:
  the placement only ever writes `left`/`top`, never anything affecting size.
- **A destructive confirmation is held non-interactive while it fades in, and that is a
  safeguard rather than an animation.** `Remove?` replaces `Remove` in the menu at exactly the
  same coordinates and the same size, so a double-click on Remove used to land its second click
  on the confirmation and destroy the bookmark with the confirmation never having been seen.
  The `confirm-arm` keyframe animates `pointer-events` discretely - `none` until 99%, so the
  release happens at the end rather than at the halfway point discrete interpolation would
  otherwise pick - over `--dur-arm` (.3s, chosen against how fast a real double-click is, not
  against how the fade looks). Cancel is deliberately *not* armed; the safe way out must never
  be the slower one. It is restated inside the `prefers-reduced-motion` block so a future
  blanket `animation: none` cannot silently disarm it. Verified both ways: a second click at
  90ms posts nothing, a deliberate click at 450ms posts `remove`.
- **The `[data-act="..."]` rules in the `.ctxmenu` block are the pre-Preact page's markup and
  match nothing here.** The Preact menu renders plain `<button>` elements with no attributes at
  all, so a rule written against those selectors is silently a no-op - the arming safeguard
  above was written that way first and tested green while doing nothing whatsoever. The block is
  kept because `landingpage2.js` still uses it. Hook Preact menu items with a real class or a
  `data-` attribute added to the JSX, and confirm the selector matches something before
  believing a result.
- **The FLIP effect moves groups as well as cards, and a card inside a moving group animates
  only its movement *relative* to that group.** Reordering a group used to move its header,
  accent bar, rule and count badge in a single frame while its own bookmarks slid to the same
  place over 220ms - a 133px jump against a 250ms glide, with the cards visibly coming away from
  their own header and catching up. Groups are measured first so their deltas are known before
  any card is considered, and the group's delta is subtracted from each card's. For a plain
  reorder that cancels to zero and the cards are left alone; a reorder that also re-lays-out the
  group animates only the difference. Without the subtraction the two transforms compose and the
  card travels twice the distance. The check that this is right is that the gap between a group's
  header and its first card stays constant on every frame of the move.
- **Everything is measured before anything is animated.** A group's transform displaces the cards
  inside it, so starting one group's flight partway through the loop corrupts the measurement of
  every card belonging to it. Same class of bug as the two below, different source.
- **The FLIP effect cancels its own previous flight before measuring, and adds the offset it was
  mid-way through.** `getBoundingClientRect()` includes an in-progress transform, so a card
  measured mid-flight reports where it currently *appears* rather than the layout box it is
  heading for - the same pollution the mid-drag guard exists to avoid, arriving from the
  effect's own animations. Left alone it inverts the sign: the card sits at `layout + offset`,
  so `was - now` yields `(previousLayout - layout) - offset` where the correct origin is
  `... + offset`, and an interrupted card flew off in the wrong direction with the error always
  exactly twice the offset (measured at -17px where it should have been +17px). Each card is
  therefore measured twice - once as it appears, then again after cancelling its previous flight
  - and only flights this effect started are cancelled, never everything `getAnimations()`
  returns, which would take the CSS transitions and the `card-in` entrance with them. This is
  not an edge case: every keystroke in the filter re-renders and moves cards, far faster than
  the 220ms a flight takes.
- **The focus ring does not animate.** Arrow-key navigation is the most repeated action on the
  page, and the ring is the only thing telling you what Enter will open, so `.project:focus`
  restates the transition with `outline-color` and `background-color` at `0s` while leaving
  `scale` and `translate` at their normal durations - zeroing `transition-duration` wholesale
  would also snap the drag gap, which a focused card can be part of. It was visibly wrong
  before: `outline-width` is not transitioned but `outline-color` was, so each move drew a
  full-thickness ring in the old colour and eased it over 150ms while the card being left
  behind faded out on the same curve.
- **When a hover effect changes mechanism, check `:focus` too.** Converting the spine from
  `width` to `transform: scaleX()` left `.project:focus .spine { width: 5px }` in place, where
  it silently became a no-op - the box is always 5px now and the drawn width comes from
  `--spine-scale`. Hover was verified and focus was not, so keyboard users lost the spine
  feedback entirely while every measurement of the hover path passed.
- **The palette scrim fades by animating `background-color`, never `opacity`.** This is the same
  rule that put the alpha in the colour in the first place, extended to the animation: animating
  `opacity` would create the stacking context for the length of the fade, so the palette sitting
  inside would be dimmed by its own scrim on the way in, and a child `opacity: 1` cannot escape
  it. The keyframe declares only `from` - a keyframe naming one end takes the element's computed
  value for the other, so there is no second copy of the `color-mix` to keep in step.
- **`.placeholder` is two different states and only one of them earns a stagger.** The same
  markup renders the first-run empty board and "No bookmarks match your filter". The first is
  rare and never mid-task, so it staggers its children 60ms apart; the second appears *while the
  user is typing* and can come and go on successive keystrokes, so it carries `data-transient`
  and only fades. A frequency argument that justifies motion has to be checked against every
  state the selector actually matches, not just the one it was written for.
- **Menus get an entrance; the board does not.** A context menu is opened a handful of times in
  a session, which is the frequency band where an entrance earns its cost. Card clicks, filter
  typing and keyboard navigation happen constantly and deliberately have nothing - motion on
  something hit a hundred times a day stops being feedback and becomes a tax.
- **Animate `transform` and `opacity`, nothing else.** Both the bookmark spine and the group
  header's hairline used to transition a property that repaints (`width` and `background-size`
  respectively), on hovers that fire constantly. Both are now a `scaleX` from a
  `transform-origin` at the leading edge, over a box sized to the *hovered* state, with the
  resting size expressed as the scale factor. `transform` is out of layout, so this is safe
  even on the flex items where a width change would have shoved neighbours around.
- **Use `scale` and `translate` as their own properties when one element's movements want
  different speeds.** A bookmark card does two unrelated things with its transform: the press
  scale, which should be immediate, and the slide that opens a gap under a dragged bookmark,
  which should be smooth. As a single `transform` transition they had to share one duration and
  the press was pinned to the slower value. They are now separate transitionable properties -
  `scale` at `--dur-press`, `translate` at `--dur-enter` - which compose into the same matrix at
  no cost. The drag gap therefore sets `translate: 0 Npx` inline, not `transform`. Both apply
  before `transform`, which is what the FLIP effect animates; they do not collide because a card
  is never mid-flight and mid-drag at once.
- **Reduced motion reduces; it does not switch everything off.** The block at the foot of
  `landingpage2.scss` rewrites `transition-property` to the non-moving half - colour and
  opacity keep working at full duration - and disables only the keyframes that translate or
  scale. A blanket `transition-duration: 0.01ms`, which is what this used to be, also kills
  every hover colour on the page and reads as broken rather than as calm. Note that
  `transition-duration` has to be replaced along with the property list: durations are matched
  to properties positionally and repeat cyclically, so a rewritten list otherwise hands the
  press duration to whichever colour lands in that slot. `stillness()` in `main.tsx` is the JS
  half and skips both WAAPI animations outright, since both exist only to move things.
- **A custom property that varies by state must be declared on one element only.** The spine's
  scale is set twice on `.project` - once at rest, once on `:hover` - rather than once there
  and once on `.project[data-shade]`, because the painted selector outranks `:hover` and
  painted bookmarks would then be the only ones on the board that ignored the pointer. Where a
  variant needs its own resting value it sets a *separate* variable (`--spine-rest`) that the
  resting declaration falls back to.
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
