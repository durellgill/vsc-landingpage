# Progress

Fork of `renebuehling/vsc-landingpage`. Tracks work done in this fork and what is still open.

## 2026-08-07 - Motion tokens, accessibility, and the colour palette

Three strands, driven by a review of the running page rather than by the build.

- **The motion is on seven tokens** - three curves, four durations - and the two JS animations
  read theirs out of the computed style instead of restating them. `npm run motion-check`
  asserts fourteen behaviours against a running harness; every one of them is a behaviour
  rather than a value, which is why all fourteen were invisible to the build, the lint and the
  typecheck.
- **One real jitter, found by measuring rather than by eye.** The space that opens under a
  dragged bookmark: the cards slide into it at `--dur-hover` while the group box containing
  them grew at `--dur-move`, so everything below the group carried on being pushed down for
  62ms after the movement had visibly stopped and the board appeared to settle twice. Measured
  at 150ms against 212ms; both now settle on the same frame. `motion()` takes the duration
  token as an argument for this.
- **The jitter the user actually meant was a different bug entirely, and a worse one.** Reported
  as "the page just randomly jumps a little bit, and when I right-click the context menu it
  sometimes shifts when I scroll". `getBoundingClientRect()` is viewport-relative and the FLIP
  effect compares its results across renders, so a scroll between two renders was
  indistinguishable from every element on the board having moved by the scroll distance. No
  layout change was needed: scroll 150px, then re-render by any means - right-click, hover, one
  character in the filter - and the whole board flew 150px and settled. Reproduced at exactly
  that, three flights of `translate(0px, 150px)` from opening a menu. Stored positions are now
  document-relative.
- **A delete zone.** Dragging a bookmark to the right edge removes it, or hides it if it came
  from Recent. Armed by dwell over `--dur-arm` rather than acting on contact, because a drag is
  far easier to make by accident than a menu item is to click.
- **Three load-jitter hypotheses were tested and rejected before that one was found**: the
  `bookmarkHealth` badges arriving do not change any card's height, the layout switch is
  monotonic with no direction reversals across 29 sampled frames, and the interleaved
  read/cancel in the FLIP effect is not measurable at this board size. Recording them so they
  are not re-investigated.
- **The board is genuinely keyboard-usable now.** The colour palette was fifteen bare `<div>`s
  with a click handler, and because the menu renders the palette *in place of* itself, choosing
  "Accent colour" without a mouse landed in a surface holding nothing focusable at all.
  Reordering groups had no keyboard route. Enter on a card's Copy button opened the bookmark
  instead of copying. Keyboard-opened menus were pinned to the viewport's top-left corner.
- **Colour was carrying meaning it could not carry.** The fourteen accent literals are picked
  to be painted as fills and several are illegible as text - white 1.04:1 on light, black
  1.02:1 on dark. `--shade-readable` mixes 30% accent into the theme foreground wherever the
  accent is drawn as a glyph or a word; fills keep the literal. The palette itself was then
  redesigned in OKLCH: its lightness ran .248 to .985, which at a 5px spine reads as painted
  versus unpainted rather than as two hues, and four of its entries sat in a 38 degree warm arc
  while nothing sat between 131 and 183.

**Open**, and deliberately not acted on. `typeShades` in `main.tsx` gives every unpainted
bookmark a type-based accent, which is documented intent - but it means `data-shade` is never
empty, so three SCSS branches written for unpainted bookmarks can never match:
`--type-color` (the `--vscode-charts-*` fallbacks), `--shade-presence: .35`, and
`--spine-rest: .6`. Either the defaults should come from the theme's chart colours or the dead
branches should go; it is a product decision, not a cleanup. `--shade-foreground` is likewise
declared fourteen times and read only by the retained pre-Preact `landingpage2.js`.

## 2026-08-02 - Hover detail, copying, and two open bugs

Follow-up work after the feature run, driven by review of the running page.

- **Group hover no longer changes size.** The accent bar grew and the title tracked out, both
  of which occupy layout, so the count badge and divider shifted and the group appeared to
  swell under the pointer. Hover is colour and opacity only now.
- **Bookmarks have a hover detail card**, built on the Popover API so it sits in the top layer
  and escapes every `overflow` and stacking context on the page. It shows the full path, the
  branch and the missing-target notice, and only opens when something on the card is actually
  cut off.
- **Paths can be copied** from a button on that card, from the bookmark menu, and with
  Ctrl/Cmd+C. The clipboard write goes through `vscode.env.clipboard` and the tick is driven
  by the host's reply, so a failure cannot show a false confirmation. Paths are shell-quoted
  when - and only when - they contain whitespace or a shell metacharacter; verified by running
  sixteen awkward paths back through `/bin/sh`.
- **Several defects fixed along the way**: eleven icons blanked by an over-broad regex in the
  Vite migration, bookmark labels unstyled since the Preact migration because the SCSS hooked
  a `data-field` attribute only the old page emitted, `maxRecentItems` applied before its
  exclusions rather than after, and a branch name cut mid-word because `display: flex`
  disables `text-overflow`.

Two things are **open**, see `TODO.md` items 11 and 12: the hover card is still reported to
leave an empty square behind despite testing clean in the harness - check for a stale
installed build first - and a project filed into a group still appears again in Recent, which
needs a path-comparison plan before any code.

## 2026-08-02 - Start page features

Seven features on top of the Vite migration, one commit each. Everything was verified in
the browser harness by asserting on posted messages and DOM state rather than by eye.

- **Recent can be refreshed.** `refreshRecents()` in `communication.ts`, reached from the
  Recent group header, from `onDidChangeViewState` when the panel becomes visible, and from
  the *Landing Page: Refresh Recent* palette command.
- **The board is keyboard-drivable.** Cards are tab stops; arrows move by geometry so all
  three layouts behave the same, Enter opens, Home/End jump, `/` reaches the filter, Escape
  unwinds. This also fixed Ctrl/Cmd+F, which had been posting `setFocusToFilterInput` to a
  webview that never handled it.
- **The filter searches paths and group names**, and every whitespace-separated term must
  match.
- **Open in a new window**, via Ctrl/Cmd+click, Ctrl/Cmd+Enter and the bookmark menu. Folders
  and workspaces only - `vscode.open` has no new-window form for a file.
- **Groups fold**, persisted as `LandingPageGroup.collapsed`. An active filter overrides the
  fold without writing to it.
- **Bookmarks whose target is gone are flagged**, from a `bookmarkHealth` message that never
  enters the model. Marked, not hidden or disabled.
- **Bookmarks can be pinned** to the top of their group. A stable sort, so unpinning returns
  a bookmark to where it was.
- **Folder bookmarks show their branch**, read from `.git/HEAD` directly rather than through
  the Git extension. Worktrees and detached HEAD included.

Two of these turned up problems in the harness rather than the product, both now fixed
there: it reposted the host's model object by reference, which made `useState` bail out on
`Object.is` and any model-state feature look dead; and it cached the built renderer for the
life of the process, so rebuilds were invisible until it was restarted.

## 2026-08-02 - Vite build, and a permanent browser harness

Replaced webpack with two Vite builds: the webview (`vite.config.webview.mts`, IIFE) and the
extension host (`vite.config.extension.mts`, CommonJS with `vscode` external). The webview
build must run first, because the extension bundle inlines its output as text.

- The separate `build:css` step is gone. `LandingPageTemplate2.ts` imports the SCSS with
  Vite's `?inline`, so Sass runs inside the extension build.
- `raw-loader`, `svg-inline-loader`, `ts-loader`, `sass-loader`, `webpack` and `webpack-cli`
  are all removed. `?raw` replaced the first two.
- `?raw` returns SVGs untouched, so `iconography.ts` now strips the `width`/`height`
  attributes that `svg-inline-loader` used to remove. Without that, icons render at a fixed
  24px and ignore the SCSS.
- Added `npm run harness`: `scripts/harness.mjs` serves the real page at `localhost:5599`
  with a stubbed extension host, records posted messages on `window.__posted`, and supplies
  the `--vscode-*` theme variables so colours are real. `?empty` and `?theme=light` cover the
  other states. The page comes from `renderLandingPage()`, the same pure function the webview
  gets, built by `vite.config.harness.mts`.
- Verified in a browser: both themes render, all three layouts render, 31 icons resolve with
  none empty, and the console is clean.

## 2026-07-27 - Preact webview migration

Moved the production webview from manually synchronized DOM code to Preact. The extension
host protocol is unchanged: the webview emits the same commands and receives the same
`syncModel` payload, so persistence and VS Code integration stay in the host.

- Added Preact, `webview/main.tsx`, and a dedicated webview webpack build.
- `npm run watch` now runs coordinated CSS, Preact and extension webpack watchers, so F5
  rebuilds TSX edits as well as extension-host changes.
- The production HTML shell now inlines `landingpage-preact.js`; the old ES implementation is
  retained as a reference during the transition.
- Component boundaries are `App`, `GroupShelf`, `BookmarkCard`, `ActionMenu`, and palette
  overlays. Local UI state now owns menus, inline rename, confirmation states, filter text,
  and the group-local add composer.
- Group shelves have visible Add, Move up, Move down, and Layout controls. Add opens beside
  its destination, and adjacent ordering uses the persisted `moveGroup` host command.
- Verified with an HTTP browser harness using a stubbed VS Code bridge: model render, group
  controls, add composer, menu actions, expanded icon picker, and inline rename all emitted
  the expected messages.

## 2026-07-27 - Build fix, redesign, Git clone

### Fixed: the build did not work from a clean checkout

`LandingPageTemplate2.ts` imported `content/dist/landingpage2.css`, but nothing generated
it - `sass` was an unused devDependency and the sass-loader rule in `webpack.config.js` was
commented out. Added `build:css` / `watch:css` scripts, chained them into `compile`,
`watch` and `package`, added a watch task to `.vscode/tasks.json`, and gitignored
`content/dist/`.

Also added `"mocha"` to `types` in `tsconfig.json`; without it `npm run compile` failed on
`src/test/extension.test.ts` with `TS2593: Cannot find name 'suite'`.

### Fixed: clicking a bookmark could open the wrong project

MRU bookmark GUIDs were positional (`MRU-1`, `MRU-2`, ...), assigned by index into VS Code's
recently-opened list. That list reorders whenever anything is opened, and
`handleMessageFromWebview` re-imports it before resolving a GUID - so a GUID captured when
the page rendered could resolve to a different project by the time it was clicked. GUIDs are
now derived from the target path (`history.ts`, `mruGuid`).

Related: bookmarks to plain files were opened with `vscode.openFolder`, which treats the
file as a workspace root instead of opening it. Now branches to `vscode.open` for files.

### Redesigned the page

Rewrote `landingpage2.scss` and the `landingpage2.html` shell:

- Real page header, and a command bar with a **clone repository** field over the filter
  field, replacing the old floating search bar.
- Layout is now normal document flow beside a fixed rail (`--rail-width`) instead of three
  regions with the same hand-computed offset repeated in three places.
- Bookmark cards use `grid-template-columns: repeat(auto-fill, minmax(...))` and the content
  column caps at `--page-max`, so cards reflow instead of sitting at a fixed 150x120.
- First-run empty state (Clone / Open folder / New group) and a no-match state for the
  filter. Groups with no visible bookmarks collapse.
- Cards show the containing directory as a dimmed second line.
- Bug fixes: theme-blind `rgba(255,255,255,.5)` modal scrim, hardcoded `--danger-color`,
  a `transition` declaration overwritten by the next line, `border`-based tool indicators
  that reflowed the page on every tool switch, 4x-scaled blurry card icons, contradictory
  `max-width`/`width` on list rows, tooltips with no `z-index` running off the bottom of
  the rail, and a missing base font on the page body.
- Filter now matches the bookmark label only. It previously used `innerText`, which after
  the redesign would also match the path line.

### Added: clone a repository

Clone field in the command bar, a button in the empty state, and a
`Landingpage: Clone Repository` palette command - all routed through `cloneRepository()` in
`communication.ts`, which delegates to VS Code's built-in `git.clone`. VS Code owns the
folder picker, progress, credentials and the Open/Add-to-Workspace prompt.

### Security

Added a CSP meta tag using `webview.cspSource`, and set `localResourceRoots` to `assets/`.

### Verified

Clean `npm install && npm run compile`, `npm run lint`, and the page rendered in a browser
against stubbed VS Code theme variables in dark and light themes: model sync, filter and
both empty states, clone message payload, and identical card geometry across all five tool
modes (confirming the border→outline fix).

### Startup performance

Reported as "takes a really long time to start up". Measured before changing anything:

| Suspect | Measurement | Verdict |
|---|---|---|
| Rendering the recents list | 4ms @ 10 items, 31ms @ 200 | Not the cause |
| `build:css` | ~200ms | Not the cause |
| `webpack` initial compile | ~960ms | Not the cause |

The page render is not the bottleneck; the cost is the Extension Development Host itself
launching a second VS Code with the full extension set. That is a dev-loop cost, not
something users of the packaged extension pay.

Real inefficiencies found and fixed anyway:

- `addProject()` called `applyFilter()` per inserted bookmark, and `applyFilter` walks every
  project and group in the document - a full sync was quadratic. The sync handler already
  calls it once at the end.
- The GUID→element lookup in the sync handler used `Array.find()` inside a nested loop, an
  O(n²) scan. Now a `Map`, with a `Set` for the removal check.
- `handleMessageFromWebview` called `populateVscMru()` at the top of *every* message,
  re-running `_workbench.getRecentlyOpened` on each keystroke in the filter box (which
  sends `setViewState`). Now skipped for messages that do not touch the model.
- `activate()` called `importVscRecentList()` and discarded the result; the webview's
  `documentReady` message repeats the work immediately afterwards.

Net: 200-item sync went 31ms → 11ms and now scales roughly linearly.

Added `vsc-landingpage.maxRecentItems` (default 20, 0 = unlimited). This is a readability
setting, not a performance one - a few hundred recents pushed the custom groups below the
fold.

### Three layouts, and a visual direction

Layouts per group, cycled by the button in the group header:

| Layout | Shape | Use |
|---|---|---|
| `list` (**new default**) | one bookmark per full-width row, label over path | reading and scrolling |
| `grid` | card tiles | visual picking |
| `compact` | dense multi-column rows | groups with many bookmarks |

`list` is new. The old `list` value now maps to the single-column layout (which is what
made stored `list` groups readable), and the previous dense multi-column behaviour moved to
`compact`. Groups with no stored layout default to `list` instead of `grid`.

Addressing "the styling is kinda dead and bland". This page lives inside the editor, so it
cannot bring its own palette - a custom background reads as broken against the user's theme.
The character comes from structure and type instead:

- **Colour spine** down the leading edge of every bookmark - the signature element. Paint
  colours moved here from the card background. Flooding the card fought every theme and made
  pale shades unreadable; worse, mixing a warm shade into a dark background turned muddy
  brown (tried it, dropped it). Painted bookmarks get a full-strength 4px spine and a matching
  icon; unpainted ones keep a quiet 3px marker so a group reads as a shelf, not a stack of
  grey boxes.
- **Monospace paths** in `--vscode-editor-font-family`. It is the vernacular of what is being
  bookmarked, and directory segments line up between rows.
- **Group headers** carry a count badge and a hairline rule running to the group's tools. The
  count is information - it is what tells you a filtered group is not actually empty.
- More generous spacing throughout: bigger gaps between cards and rows, taller rows.
- Content column narrowed from 1100px to 920px; full-width rows on a wide display read badly.

Also fixed: `setLayout()` posted a `patch` message every time it ran, including from the
model sync - so every render wrote a layout patch back per group. It now only persists on
user action (verified: 4 clicks produce exactly 4 patches, a sync produces none).

### Load time (as opposed to build time)

The earlier numbers were build steps only, and they are not the wait. The wait is the
Extension Development Host booting a second VS Code that activates every installed
extension - 33 of them here, 1.4 GB in `~/.vscode/extensions`, including Pylance, Python,
Tailwind IntelliSense and several agent extensions.

The default `Run Extension` launch config now passes
`--extensions-dir=${workspaceFolder}/.vscode-dev-extensions`, an empty directory. Third-party
extensions are skipped; built-in extensions still load because they ship inside the VS Code
app bundle (`.../Contents/Resources/app/extensions/`), not the extensions dir - so the
built-in Git extension the Clone feature depends on is unaffected. This is why
`--extensions-dir` was chosen over `--disable-extensions`, whose treatment of built-ins the
docs do not pin down.

It also passes `--user-data-dir`. Without it the dev host inherits your window restore state
and reopens the last folder you had open, so `workspaceFolders` is set and the landing page
never auto-opens (it only auto-opens in an empty window - see `extension.ts`). A fresh
profile always starts empty. Side benefit: the dev host keeps its own bookmarks, so
debugging cannot corrupt real data.

A second config, `Run Extension (with my installed extensions)`, keeps the old behaviour for
when a bug involves the real environment.

Also added webpack's filesystem cache: warm rebuilds went 653ms → ~100ms.

Not changed: `activationEvents` is already `onStartupFinished`, which is the deferred option.

Note: the marketplace build (`renebuehling.vsc-landingpage`) is still installed alongside
this fork. Same extension ID, so the two collide in the normal window. The dev host is
unaffected now that it uses an isolated extensions dir.

### Fork identity, v0.1.0

| Field | Was | Now |
|---|---|---|
| `version` | 0.0.4 | **0.1.0** |
| `publisher` | renebuehling | **local** (placeholder) |
| `displayName` | Landingpage | **Landingpage (Dev)** |
| `repository` | renebuehling/vsc-landingpage | **atechaccount/vsc-landingpage** |

The extension ID is `publisher.name`, so changing the publisher alone makes this
`local.vsc-landingpage` and removes the clash with the marketplace build. `name`, the four
command IDs and the two settings keys are deliberately unchanged - verified there are no
personal keybindings or user settings referencing them, but leaving them alone keeps the
diff small and upstream merges clean.

Consequence: stored bookmarks are namespaced by extension ID, so this build starts with an
empty page rather than inheriting the marketplace copy's saved model.

`publisher` is a placeholder. `vsce publish` will fail until it is a real marketplace
account. `vsce package` works fine, verified.

LICENSE is untouched - MIT requires the original copyright notice (© René Bühling) be
retained, and the fork is attributed in the README instead.

**CHANGELOG.md has not been updated** - per the working agreement it is not hand-edited.
It still describes 0.0.4. An entry for 0.1.0 needs adding by whatever tool maintains it.

### Per-bookmark icons, labelled sidebar

- **Icon tool.** New tool in the sidebar, symmetric with Paint: pick an icon from a
  20-glyph palette, then click bookmarks to apply it. Stored as
  `LandingPageProject.glyph` (the key suffix of a `glyph-*` entry in `iconography.ts`).
  The crossed-out slot clears it and falls back to the file/folder/workspace type icon;
  because only the extension knows that fallback, clearing pushes a `syncModel` back rather
  than letting the webview guess.
- **Labelled sidebar.** The rail was a 24px strip of unexplained glyphs. It is now 172px
  with an icon and a text label per button (Open, Rearrange, Rename, Paint, Icon, Delete /
  New group, Settings). Tooltip headings were reworded to match the labels exactly - the
  same tool was previously called "Reader Tool" in the tooltip and nothing on the button.
- **Group tools** no longer hide until hover, and sit next to the group name instead of
  being pushed to the far right by the rule.

Fixed while doing this: `modalHide()` used `querySelector('.modal')`, which only hid the
first modal - fine with one, broken as soon as the icon picker was added.

### Clone destination

Already handled, no change needed: `git.clone` is called with a URL and no `parentPath`, so
VS Code shows its native folder picker. Verified by finding the prompt string
`"Choose a folder to clone {0} into"` in the built-in Git extension's own bundle.

### Interaction model: modes removed

The extension inherited a modal tool palette - pick a tool, then clicks mean something
different. That is a 1990s paint-program metaphor, it costs a round trip to the sidebar for
every action, nothing in VS Code behaves that way, and leaving it in Delete made a stray
click destructive (there was even a Ctrl-to-skip-confirmation shortcut).

Replaced with direct manipulation:

| Was | Now |
|---|---|
| pick Open tool, click | click |
| pick Move tool, drag | drag (4px movement threshold decides click vs drag) |
| pick Rename tool, click | `...` menu or right-click → Rename |
| pick Paint tool, pick colour, click | right-click → Change colour |
| pick Icon tool, pick icon, click | right-click → Change icon |
| pick Delete tool, click | right-click → Remove |

The sidebar is gone entirely; New group and Settings moved into the page header, and the
content is full width. `--rail-width` is kept at `0px` so the handful of rules that offset
against it stay valid.

One `#ctxmenu` serves both bookmarks and groups, with entries hidden by CSS on `data-kind`
and `data-sealed`. The colour and icon pickers now apply to the row the menu was opened on,
so there is no "currently selected colour" state to get out of sync.

Verified in the browser harness: plain click opens; a >4px drag sets the drag state and the
click that follows sends nothing; sub-threshold jitter still opens; right-click on a
bookmark offers open/rename/colour/icon/remove, on a group rename/add/add/layout/remove, and
on the sealed Recent group only layout.

Also fixed: `overflow-y:auto` on the old sidebar silently made `overflow-x` compute to
`auto` as well, turning it into a clipping context that cut off every tooltip.

### Drag removed, "Move to group" added

Drag and drop is gone - all pointer tracking, the drop hotspot elements, and their CSS.
Bookmarks move between groups through **Move to group** on the row menu, which asks the
extension host to show a native quick pick of the existing groups. Copying out of the
generated `Recent` group is preserved: moving from `@vsc-mru` clones instead of moving,
because that list is rebuilt from VS Code history and anything removed would reappear.

Also fixed, both introduced by me earlier:

- **The colour picker rendered washed out.** The scrim used `opacity: .6` on `.modal`, and
  `opacity` on a parent creates a stacking context that children cannot exceed - the
  `.palette { opacity: 1 }` meant to counter it was inert. The alpha now lives in
  `background-color` via `color-mix`, so the picker renders at full strength.
- **`LAYOUTS`/`LAYOUT_UI` were deleted** along with the drag block they happened to sit
  beside, so `setLayout()` threw on every model sync. Caught by checking the webview console
  rather than the build, which stayed green throughout.

The colour palette is now a single row of swatches rather than a 5-wide block.

### Two regressions from the redesign

- **"New group" appeared to do nothing.** The group was created correctly - the bug was in
  the webview: `applyFilter()` collapsed any group with no *visible* bookmarks, which also
  caught genuinely empty ones. A new group was hidden the instant it was made. It now only
  collapses a group that a running filter emptied (`needle.length>0 && total>0 && visible===0`).
- **The row "..." button sat at the bottom-left of cards.** It was in flow, and the card
  layout is a flex *column*, so it landed under the text and added ~28px to every card's
  height. Now absolutely positioned top-right in both layouts; card height went 126px → 116px.

### Menu separators, card anatomy

- **Two dividers with nothing between them.** Menu entries are hidden per target type, which
  could leave a separator at the top or bottom - a bookmark in the sealed `Recent` group hid
  Remove and left a trailing divider. `tidySeparators()` now hides any separator that does not
  actually divide two visible entries, rather than special-casing each combination.
- **Card anatomy rebuilt.** The icon sat alone above a bottom-anchored label, leaving a dead
  band across the middle of every card with a short name. Icon and label now share the top
  line with the path beneath, matching the list layout. Card height 116px → 73px.
- Hover now thickens the colour spine - the only motion on the page, and it belongs to the
  signature element.

Note: the group layout switcher was reported as broken but tests correct in the harness
(grid → compact → list, one patch per click, no errors). Most likely an installed build older
than the fix; `npm run install-local` re-installs.

## Open / not done

- **Partly exercised in a real VS Code instance.** `npm test` now launches VS Code 1.130.0 and
  the extension activates cleanly ("vsc-landingpage is now active!", 1 passing). Still needs
  an F5 run to exercise the UI: drag-and-drop reordering, the custom cursors under the new
  CSP, and the clone flow end to end. See the verification checklist below.
- Harmless test-log noise: `Blocked vscode-file request .../assets/icon.png` appears
  intermittently (seen in 2 of 4 runs) *after* the extension host exits. It is a shutdown
  race, not caused by `localResourceRoots` - the runs that did not log it had the same
  setting in place.
- `src/test/extension.test.ts` is still a 15-line stub; there is no automated coverage.
- `iconography.ts` still carries unused icons (its own `//TODO`).
- The webview's `alert()` posts `{command:'test'}`, which no handler in `communication.ts`
  understands.
- `npm audit` reports **7 vulnerabilities (2 low, 5 high)**, down from 11. All of them are
  transitive dependencies of `mocha`, which comes from `@vscode/test-cli`. **None of them
  ship**: `.vscodeignore` excludes `node_modules`, the packaged .vsix contains 23 files with
  zero node_modules entries, and the 96 KB `dist/extension.js` contains no reference to
  `brace-expansion`, `minimatch`, `serialize-javascript`, `test-exclude`, `mocha` or `c8`.
  They exist only in the local dev tree.

  `npm audit fix` (without `--force`) is a no-op here - the patched versions fall outside the
  ranges the parents allow. `@vscode/test-cli` was bumped 0.0.11 → 0.0.15 (the latest), which
  cleared 2; the rest have no published fix, and npm's remaining suggestion is a semver-major
  *downgrade* back to 0.0.11, which is circular. Deliberately not chased further: forcing
  `minimatch` 3 → 10 or `diff` 7 → 9 via `overrides` would risk breaking `glob` and `mocha`
  to silence advisories that never reach a user.

  Note `eslint` was bumped ^9.16.0 → **^10.8.0** by an earlier `npm audit fix --force`. That
  is a major version change; verified it still lints all 9 files with 0 errors.

## Verification checklist for the next F5 run

- Custom delete/paint cursors still load (would be the first casualty of a wrong CSP).
- Right-click bookmarks and groups: check inline rename, accent colour, custom icon, remove,
  and group layout. The group header intentionally has no `...` button.
- Recent: hide one item, reload the page, then use the Recent group menu to restore hidden
  entries. VS Code's own File > Open Recent list must remain unchanged.
- Clone: valid URL, empty field (must stay local and focused), garbage URL (should show a
  clear error).
- Reset content and confirm the empty state; check dark, light and high-contrast themes.

## 2026-07-27 - Local controls, colour system, and Recent hiding

The webview now keeps interaction close to the item being changed:

- Delete is confirmed inside the action menu. Rename uses an inline text field with Save and
  Cancel, including when a group name is double-clicked. Clone requires the existing command
  bar input instead of opening a VS Code header input box.
- Groups can have persisted `shade` and `glyph` values. A group header renders a prominent
  coloured tab, custom glyph, matching title and divider. The `...` button beside the layout
  control was removed; right-click a group to open its menu.
- Bookmark cards now get visual defaults even before the user personalizes them: folders are
  blue, workspaces purple, and files teal. Explicit bookmark accents still take precedence.
  The glyph palette grew from 20 to 37 options.
- Fixed a selector regression where `div[data-shade]` styled every group container as a large
  patterned circle. Only `.palette div[data-shade]` is now treated as a swatch. This was an
  application CSS bug, not a VS Code webview colour limitation.
- `Recent` entries can be hidden from this landing page without changing VS Code history. Their
  stable MRU GUIDs are stored in the extension's `landingPageHiddenMruGuids` state, and the
  Recent group menu restores them all.

Verified after these changes: `npm run compile`, `npm run lint`, and `git diff --check`.
