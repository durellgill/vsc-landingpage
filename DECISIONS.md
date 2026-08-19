# Decision records

This file records decisions that should survive individual tasks and agent sessions. Each entry describes the current rule, why it exists, what was rejected, and what must change with it. Supersede an entry when the rule changes instead of adding contradictory guidance elsewhere.

Read `Considered instead` before proposing a change. It names the option that already lost and why, so a rejected approach is not re-proposed as if it were new. An entry marked `platform constraint` is not a choice this project made and cannot be traded away; it is recorded so it is not mistaken for one.

Every entry uses the same five fields, so a specific field can be searched across the file: `Decision`, `Reason`, `Considered instead`, `Consequences`, and `Status`.

| Looking for | Entry |
|---|---|
| Page implementation, webview bundle, template inlining | D001, D003 |
| Message protocol, host and webview responsibilities | D002 |
| Recent group, VS Code history, per-entry customization | D004, D005 |
| Creating bookmarks, groups, folders; destination prompts | D006 |
| Drag and drop, insertion points, pinning, reordering | D007 |
| Drag-to-delete, dwell, destructive safeguards | D008 |
| Persistence, model sync, acknowledgement | D009 |
| Opening folders, workspaces, and files | D010 |
| Missing targets, Git branches, filesystem checks | D011 |
| Theme variables, contrast, bookmark shades | D012, D012a |
| Motion tokens, durations, reduced motion | D013 |
| Menus, palettes, popovers, focus restoration | D014 |
| Keyboard navigation, screen readers, ARIA | D015 |
| Test layering, harness, regression checks | D016 |
| Accent marks, gutter, spine geometry | D012a, D017 |
| Page width, centring, filter sizing | D018 |
| Focus rings, outlines, ancestor clipping | D019, D014 |
| Browser test tooling, visual baselines, snapshots | D020, D016 |

## D001: One Preact webview

Status: active

Decision: `src/LandingPage/webview/main.tsx` is the only page implementation. `LandingPageTemplate.ts` inlines its compiled JavaScript, `landingpage.scss`, and `landingpage-preact.html` into the VS Code webview.

Reason: Parallel page implementations drift, keep dead message handlers alive, and make a change look complete when only one path was updated.

Considered instead: Keeping a non-Preact fallback page alongside the Preact one. Rejected because the fallback is what drifts - it is the path nobody exercises, so it rots silently and then fails when something makes it load. The `-preact` suffix on the HTML template is a leftover from that migration and no longer distinguishes anything.

Consequences: Do not add a fallback page. A replacement must remove the old implementation and its protocol in the same change.

## D002: Host and webview communicate only through messages

Status: active, platform constraint

Decision: The webview posts commands through `acquireVsCodeApi().postMessage`. The extension host handles them in `communication.ts` and replies with webview messages.

Reason: VS Code webviews are sandboxed and cannot use the `vscode` API or Node directly.

Considered instead: Nothing. The sandbox is imposed by VS Code. What this project decided is only the split below, which is the part open to change.

Consequences: Dialogs, filesystem work, cloning, clipboard writes, persistence, and VS Code commands belong in the host. Rendering, local interaction state, geometry, and keyboard behavior belong in the webview. Add fields to the existing `bookmarkHealth` message when reporting more observed filesystem state.

## D003: The build has two ordered stages

Status: active

Decision: Build the Preact webview first, then build the CommonJS extension host. The second stage imports the first stage's output as text.

Reason: Reversing the order can package a stale page without failing the build. A *missing* webview bundle fails loudly, because `LandingPageTemplate.ts` imports `./content/dist/landingpage-preact.js?raw` and the import cannot resolve. A *stale* bundle resolves fine and ships silently, which is the case worth guarding.

Considered instead: One combined build, and building the extension first. Both were rejected for the same reason: only the ordering makes the staleness detectable, and only at the point where the page bundle is regenerated.

Consequences: `npm run compile`, the watch script, packaging, and CI must preserve this order. Nothing enforces it but the chaining in those scripts, so running `npm run build:extension` alone still ships whatever is currently in `content/dist/`. Generated output stays ignored and must never be edited by hand.

## D004: Recent mirrors VS Code history

Status: active

Decision: The group identified by `RECENT_GROUP_GUID` is rebuilt from VS Code's recently opened list. It remains last, cannot be reordered, and cannot receive bookmarks.

Reason: Changes written directly into Recent disappear on the next rebuild. Moving an entry out would also be undone because VS Code still reports it.

Considered instead: Treating Recent as an ordinary editable group. Rejected because the rebuild is not optional - VS Code owns the list, so any edit stored against it is erased on the next sync, and the user sees their change silently revert.

Consequences: Dragging out of Recent copies. Dragging into Recent is refused. Hiding an entry affects Landing Page only. Missing entries and hidden entries are removed before `maxRecentItems` is applied so the setting counts what the user sees. This special case is load-bearing in every drag, drop, and menu path; expect to handle Recent separately in each.

## D005: Recent customizations use an overlay

Status: active

Decision: Per-entry shade, glyph, and pin state for Recent are stored separately and reapplied during rebuilds.

Reason: Storing those fields only on generated model objects loses them during the next refresh.

Considered instead: Writing the fields onto the rebuilt Recent entries themselves. Rejected for the same reason as D004 - the rebuild discards them. The cost accepted in exchange is a second store running parallel to the model, keyed by entries the host does not own.

Consequences: Add new durable Recent customization fields to the overlay. Remove empty values instead of accumulating false or undefined records; overlay entries for paths the user never opens again are not otherwise pruned.

## D006: Destinations are resolved at the last responsible moment

Status: active

Decision: Group-local creation uses that group. Page-level bookmark creation asks for a destination when needed. Page-level folder creation creates the folder and opens it in the current VS Code window without adding a bookmark or group; VS Code adds it to Open Recent naturally.

Reason: A failed irreversible operation must not leave model changes behind, and a control inside a group already communicates its destination.

Considered instead: Creating the model entry first and reconciling if the filesystem operation failed. Rejected because the reconciliation path is the one that never gets tested, so the failure leaves a bookmark pointing at a directory that was never created. Also considered: always prompting for a destination, rejected because a control rendered inside a group has already answered that question.

Consequences: Only the New folder action inside a group creates a bookmark for the new directory. Keep webview-initiated text input in the page. Explorer and editor context commands may use native quick picks and input boxes because they start outside the page.

## D007: Dragging uses identifiers and geometry

Status: active

Decision: Bookmark drops carry a GUID and compute the insertion point from live geometry in the drop handler. Group drops use a `toIndex` measured before lifting the dragged group. Pinned bookmarks are rendered with a stable sort instead of changing stored order.

Reason: Rendered order differs from stored order when bookmarks are pinned, and state updates may not paint before a drop arrives.

Considered instead: Carrying the rendered index in the drag payload. Rejected because pinning makes rendered index and stored index diverge, so the drop lands in the wrong place for exactly the boards that use pinning most. Also considered: writing pin state into stored order, rejected because unpinning then cannot restore the previous position.

Consequences: `beforeGuid` names the landing point. `moveBookmark` resolves it after removing the source. `moveGroup` adjusts downward indices after the source gap closes. Group drop handlers stop propagation so the page-level gap handler does not post a second move. This is the most timing-sensitive logic in the repository and is only provable through the harness, not through unit tests.

## D008: Drag-to-delete uses a dwell safeguard

Status: active

Decision: The delete zone appears only while carrying a bookmark. It spans the bottom of the viewport and arms after `--dur-arm`. An early release does nothing. An armed release removes a user bookmark or hides a Recent entry.

Reason: Dragging is easier to trigger accidentally than choosing a menu action. The dwell gives the user time to read the destructive target without making the target small or hard to reach.

Considered instead: Setting `dropEffect` to `none` before the zone arms, which is invalid - a stationary pointer can retain that old verdict and suppress the final drop event entirely. Also considered: a small target instead of a dwell, rejected because it trades an accidental delete for a missed one.

Consequences: The label moves from "Drag here" to "Hold" to "Release". The browser drop target remains enabled throughout the dwell; the drop handler gates the destructive action. `e2e/delete-zone.spec.ts` asserts both halves - an early release is refused, an armed stationary release removes - so change the check with the behaviour.

## D009: Persist before acknowledging a model change

Status: active

Decision: Host mutations await `saveLandingPageModel` before sending the updated model to the webview.

Reason: Optimistically redrawing before VS Code finishes storage can show success when the write failed and can reorder overlapping writes.

Considered instead: Optimistic redraw with rollback on failure. Rejected because the rollback path is rarely exercised and the failure it handles is silent, so the user keeps a board that does not match storage. The cost accepted is a storage round-trip before every paint, which is cheap against `globalState`.

Consequences: Entry-point actions catch rejected promises and show a VS Code error. The returned model sync is the normal completion acknowledgement, so short storage writes do not need a flashing spinner.

## D010: Opening behavior depends on target type

Status: active, platform constraint

Decision: Folders and workspace files may open in a new window. Plain files open in the current window.

Reason: `vscode.openFolder` supports `forceNewWindow`; `vscode.open` for a file does not.

Considered instead: Nothing. This is what the VS Code API offers. The decision this project made is only that the same type check applies on every path.

Consequences: Ctrl or Cmd click, keyboard shortcuts, and menu items must all apply the same type check.

## D011: Filesystem health is observed state

Status: active

Decision: Missing local targets and Git branch names are checked by the host and sent through `bookmarkHealth`. They are not persisted in the model.

Reason: Persisted health becomes stale when a file returns or a branch changes. Remote and virtual URIs may be valid while their provider is unavailable.

Considered instead: Storing `missing` and `branch` on the model. Rejected because both change outside this extension, so a stored value is wrong as soon as the user switches branch or restores a folder, and nothing would invalidate it. Also considered: reading branches through the built-in Git extension, rejected because it makes the feature depend on that extension being enabled and on which repositories it decided to open.

Consequences: Check only `file:` targets. Drop missing entries from Recent, but mark and retain deliberate bookmarks in user groups. Read branches from `.git/HEAD` directly. Checks run under `Promise.all`, so the cost is one parallel round of stats per open and per Recent refresh.

## D012: The page follows the editor theme

Status: active

Decision: Page colors use `--vscode-*` variables. Bookmark shades are accent fills, not a page palette. Text derived from a shade uses `--shade-readable` or `--group-accent-text`.

Reason: The page sits inside VS Code and must remain legible in dark, light, and high-contrast themes. Raw accent colors often fail text contrast.

Considered instead: A fixed palette of the extension's own. Rejected because it can only be correct against one theme, and the page would read as pasted into the editor rather than part of it. The cost accepted is that appearance is not fully under this project's control.

Consequences: Test all three themes. Paint the bookmark color on the spine, and nowhere else on a bookmark. Scope swatch rules to `.palette button[data-shade]` so model containers are not styled as swatches.

## D012a: The spine is a bookmark's only accent

Status: active. Supersedes the icon half of D012.

Decision: A bookmark's shade is drawn on its spine. The type icon is `--vscode-icon-foreground`, never the shade or a per-kind color.

Reason: Contrast, then redundancy. D012 originally put the color on "the spine and icon container", where the container was a 16% wash of the glyph's own color with the glyph at full strength on top. That measures 2.50:1, under the 3:1 WCAG 1.4.11 floor for a graphical object, and it fails for the reason it was built: a tint plate made from the glyph's color pulls the background toward the thing drawn on it. Separately, the glyph's shape already says folder, file, or workspace and the spine already says which shade the user chose, so the colored icon was a third statement of two facts - and the loudest mark on a row while carrying the least, since four of eight bookmarks on a default board draw the same folder glyph.

Considered instead: Removing the tint plate but keeping the glyph colored. Rejected because it is not sufficient - the darker shades still only reach 2.87:1 as a bare glyph on the editor background, because a color like `#3A5FC9` is genuinely dark against `#1f1f1f`.

Consequences: One accent per bookmark. Do not reintroduce a colored icon, a tinted icon plate, or a card background wash. `--shade-readable` remains the rule for shade-derived *text*, which is a separate contrast problem with a separate answer.

## D013: Motion uses shared tokens

Status: active

Decision: Motion uses the curves and durations declared at the top of `landingpage.scss`. JavaScript animations read the same tokens through `motion()`.

Reason: Independent values drift and make parts of one gesture settle at different times.

Considered instead: Per-component durations chosen where each animation is written. Rejected because a gesture expressed in two places - the chevron rotation and the group height, for instance - then settles at two different times, and nothing catches it.

Consequences: Pointer feedback uses `--dur-hover`, travel uses `--dur-move`, presses use `--dur-press`, and entrances use `--dur-enter`. Reduced motion removes translation and scale while preserving color, opacity, focus feedback, and destructive safeguards.

## D014: Menus, palettes, and hover details manage their own boundaries

Status: active

Decision: Opened surfaces take focus, restore it to their trigger, and are repositioned when their size or the viewport changes. Bookmark details use one shared non-interactive Popover API element.

Reason: Menus rendered later in the document are otherwise many tab stops away, and fixed coordinates can move a growing confirmation off screen. The popover top layer avoids clipping by page overflow and stacking contexts.

Considered instead: Placing surfaces at raw pointer coordinates, which ran them off the viewport, and then clamping alone, which still let a surface grow back out of view when its confirmation row appeared. Also considered: rendering details inline rather than in the top layer, rejected because page overflow then clips them.

Consequences: Keyboard-opened menus fall back to trigger geometry because synthetic clicks report coordinates at zero. Do not set `display` on a closed `[popover]`. Open hover details only when label, path, or branch text is clipped. Right-click closes the hover detail before opening the action menu. This rule covers surfaces only - ordinary in-page elements are still subject to ancestor clipping and must handle it themselves.

## D015: Accessibility is part of the interaction contract

Status: active

Decision: Bookmark cards are keyboard reachable, use geometric arrow navigation, and expose their label and path through `aria-labelledby` and `aria-describedby`. Icon-only controls name the group they affect. Asynchronous confirmations use one polite live region.

Reason: The page has several visual-only actions and mixed layouts where document order does not match spatial navigation.

Considered instead: `aria-label` on the bookmark card. Rejected because it replaces the accessible content name and hides the path and the missing-target state - the two things a screen reader user most needs from a bookmark. Also considered: document-order tab navigation, rejected because grid and compact layouts put the visually adjacent card several tab stops away.

Consequences: Controls inside a card handle their own keyboard events. Opening a surface moves focus into it and closing restores focus. Do not put `aria-label` on a bookmark card. The colocated Mocha tests are host-only and cannot see the DOM, so this contract is held by `e2e/accessibility.spec.ts`, which asserts the computed accessible names directly.

## D016: Tests are layered by what they can prove

Status: active

Decision: Pure host logic uses colocated Mocha tests inside the VS Code Extension Host. Browser behavior uses the real harness and asserts on posted messages and geometry. Screenshots confirm appearance but do not prove behavior.

Reason: Typechecking, linting, and bundling cannot detect timing, focus, drag, clipping, or animation bugs.

Considered instead: A separate `test/` tree. Rejected because colocation puts a behaviour and its specification in one search, and `.vscodeignore` already excludes `src/**` and `**/*.ts` from the package, so a separate tree buys nothing at packaging time either. Also considered: treating screenshots as proof, rejected because appearance and behaviour fail independently.

Consequences: Run the full matrix in `DEVELOP.md`. A regression check must fail against the broken implementation before the fix. The harness must mirror serialization and message timing from the real host - nothing detects drift between the stub and the real host, so a harness that has diverged keeps passing while proving nothing.

## D017: One accent mark, in one gutter, at one width

Status: active. Extends D012a from the bookmark to the whole board.

Decision: A shade is drawn as a 4px wide, 20px tall capsule in the leading gutter, and nowhere else. A group header draws it for the group, a bookmark card draws it for the bookmark, and the two share the same gutter column and the same dimensions. The bookmark's mark grows to its full 4px under the pointer or on focus; nothing else about it changes. The group icon, the bookmark icon, and the group's bookmark count are neutral.

Reason: The board previously spent the accent four ways in the space of two rows - a 5px full-height band down the leading edge of every card, an 18% shade plate behind the group's folder icon, the group label recoloured on hover, and a bordered count pill beside it. A full-height colour band is the most recognisable tic of a generated dashboard, and it made a run of same-shade bookmarks fuse into one continuous stripe instead of reading as separate things. In grid and compact, where the card draws its own hairline, the band sat on that hairline and read as a coloured border. A short mark in the leading margin is what VS Code itself uses for gutter decorations - dirty diff, breakpoints - so it is the vocabulary a bookmark board belongs to.

Considered instead: Keeping the full-height band and reducing its saturation. Rejected because the fusing problem is geometric, not chromatic - any full-height band on adjacent same-shade cards still reads as one stripe.

Consequences: Do not restore a full-height spine, a shade plate, a shade-tinted card background, or a badge-style count. `--spine-scale` expresses the resting fraction (.5 unpainted, .75 painted, 1 hovered or focused) against a 4px box; `e2e/affordances.spec.ts` asserts that box width, so change both together. The count stays a bare tabular numeral: VS Code reserves its own badge for unread or actionable counts, which this is not.

## D018: The board is a centred column, and its controls span it

Status: active

Decision: The page column is capped at `--page-max` and centred in the webview. Everything in it - header, filter, groups - spans that same column and shares its right edge.

Reason: An editor group can be anything from a split pane to a 32" monitor. A 920px column pinned to the left of the wide one leaves half the window empty on one side, which reads as a layout that failed rather than one that chose a measure. The filter separately capped itself at 640px, so the page presented three different right edges at once.

Considered instead: Letting the column fill the full width. Rejected because the measure then runs past comfortable reading length on a wide monitor, which is the problem the cap exists to solve.

Consequences: Do not give a page-level element its own max-width. The filter is body size, not enlarged: it filters a list already on screen and is not a search hero. It is not rendered at all when the board has no groups, because a filter over nothing is a control that cannot act - the `/` shortcut checks for the field before it swallows the keystroke.

## D019: The focus ring is drawn inside the card

Status: active

Decision: A focused bookmark card draws its ring with a negative `outline-offset`, inside its own box.

Reason: `.foldable` clips both axes so the fold animation has a box to animate, and in every layout a card is flush against that clip on at least one side - both sides in `list`, the left edge in the first `grid` column. A positive offset put the ring outside the clip, so a focused list row drew two horizontal strokes with no ends and a focused first grid card drew three sides.

Considered instead: Lifting the clip on `.foldable` while a card inside it has focus. Rejected because the clip is load-bearing - `.foldable` is the only box that survives the cards unmounting on collapse, so the fold has nothing else to animate against. Also considered: padding the container so cards are never flush, rejected as a layout change to fix a paint problem.

Consequences: Keep the ring inside the card box. A card is never guaranteed room outside itself, so any future resting outline, shadow, or halo on `.project` has the same constraint. This is the general case of the boundary noted in D014: the popover top layer solves it for surfaces, and ordinary in-page elements have to solve it themselves.

## D020: Committed browser tests use Playwright; agent-browser stays interactive

Status: accepted, not yet implemented. See `TODO.md` for the migration steps.

Decision: Browser tests that are committed, run unattended, and gate a merge are written with Playwright. `agent-browser` remains the tool for interactive and exploratory work, where an agent drives the page one command at a time.

Reason: The two tools sit at different layers rather than competing. Ground truth is by definition committed and unattended, which is a test runner's job: per-test isolation, retries on flake, parallel workers, a reporter, and a trace viewer that replays a failed drag with a DOM timeline. Playwright also namespaces snapshot baselines per platform through `snapshotPathTemplate`, which is what makes a pixel baseline shot on macOS survive a Linux runner. `expect(page).toHaveScreenshot()` additionally waits until two consecutive screenshots agree before comparing, so a page still settling does not fail the run.

Considered instead: Building the snapshot suite on `agent-browser`, which is already the idiom here and is npm-installable (0.34.0), so it could be pinned and run in CI. Rejected on three counts. Its interface is a synchronous shell-out, so waiting, retrying, and settling are hand-rolled - the script this replaced spawned a whole Node process per `sleep()` and JSON-double-parsed every `evaluate()`, both forced by that boundary. It has no runner, so one script crashes out of every check after the failure. And its screenshot baselines are single-file, so one platform's font rasterization becomes the baseline for all of them.

Consequences: `scripts/motion-check.mjs` has been ported and deleted, so Playwright is the only committed browser stack. Its 25 assertions live in `e2e/flip.spec.ts`, `e2e/menus.spec.ts`, `e2e/delete-zone.spec.ts`, `e2e/affordances.spec.ts`, `e2e/fold.spec.ts` and `e2e/reduced-motion.spec.ts`, and they now run in CI, which the script never did - it needed a Homebrew `agent-browser` and a harness on 5599, so it gated no merge. Pixel baselines are generated and verified only inside the pinned `mcr.microsoft.com/playwright` image, never from a developer machine, because host font rendering will not match the runner. Aria snapshots carry no such constraint and may be generated anywhere.
