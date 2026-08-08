# Decision records

This file records decisions that should survive individual tasks and agent sessions. Each entry describes the current rule, why it exists, and what must change with it. Supersede an entry when the rule changes instead of adding contradictory guidance elsewhere.

## D001: One Preact webview

Status: active

Decision: `src/LandingPage/webview/main.tsx` is the only page implementation. `LandingPageTemplate.ts` inlines its compiled JavaScript, `landingpage.scss`, and `landingpage-preact.html` into the VS Code webview.

Reason: Parallel page implementations drift, keep dead message handlers alive, and make a change look complete when only one path was updated.

Consequences: Do not add a fallback page. A replacement must remove the old implementation and its protocol in the same change.

## D002: Host and webview communicate only through messages

Status: active

Decision: The webview posts commands through `acquireVsCodeApi().postMessage`. The extension host handles them in `communication.ts` and replies with webview messages.

Reason: VS Code webviews are sandboxed and cannot use the `vscode` API or Node directly.

Consequences: Dialogs, filesystem work, cloning, clipboard writes, persistence, and VS Code commands belong in the host. Rendering, local interaction state, geometry, and keyboard behavior belong in the webview. Add fields to the existing `bookmarkHealth` message when reporting more observed filesystem state.

## D003: The build has two ordered stages

Status: active

Decision: Build the Preact webview first, then build the CommonJS extension host. The second stage imports the first stage's output as text.

Reason: Reversing the order can package a stale page without failing the build.

Consequences: `npm run compile`, the watch script, packaging, and CI must preserve this order. Generated output stays ignored and must never be edited by hand.

## D004: Recent mirrors VS Code history

Status: active

Decision: The group identified by `RECENT_GROUP_GUID` is rebuilt from VS Code's recently opened list. It remains last, cannot be reordered, and cannot receive bookmarks.

Reason: Changes written directly into Recent disappear on the next rebuild. Moving an entry out would also be undone because VS Code still reports it.

Consequences: Dragging out of Recent copies. Dragging into Recent is refused. Hiding an entry affects Landing Page only. Missing entries and hidden entries are removed before `maxRecentItems` is applied so the setting counts what the user sees.

## D005: Recent customizations use an overlay

Status: active

Decision: Per-entry shade, glyph, and pin state for Recent are stored separately and reapplied during rebuilds.

Reason: Storing those fields only on generated model objects loses them during the next refresh.

Consequences: Add new durable Recent customization fields to the overlay. Remove empty values instead of accumulating false or undefined records.

## D006: Destinations are resolved at the last responsible moment

Status: active

Decision: Group-local creation uses that group. Page-level creation asks for a destination when needed. Creating a folder on disk completes the filesystem step before a default group is created.

Reason: A failed irreversible operation must not leave model changes behind, and a control inside a group already communicates its destination.

Consequences: Do not prompt for a group before the folder exists. Keep webview-initiated text input in the page. Explorer and editor context commands may use native quick picks and input boxes because they start outside the page.

## D007: Dragging uses identifiers and geometry

Status: active

Decision: Bookmark drops carry a GUID and compute the insertion point from live geometry in the drop handler. Group drops use a `toIndex` measured before lifting the dragged group. Pinned bookmarks are rendered with a stable sort instead of changing stored order.

Reason: Rendered order differs from stored order when bookmarks are pinned, and state updates may not paint before a drop arrives.

Consequences: `beforeGuid` names the landing point. `moveBookmark` resolves it after removing the source. `moveGroup` adjusts downward indices after the source gap closes. Group drop handlers stop propagation so the page-level gap handler does not post a second move.

## D008: Drag-to-delete uses a dwell safeguard

Status: active

Decision: The delete zone appears only while carrying a bookmark. It spans the bottom of the viewport and arms after `--dur-arm`. An early release does nothing. An armed release removes a user bookmark or hides a Recent entry.

Reason: Dragging is easier to trigger accidentally than choosing a menu action. The dwell gives the user time to read the destructive target without making the target small or hard to reach.

Consequences: The label moves from "Drag here" to "Hold" to "Release". The browser drop target remains enabled throughout the dwell; the drop handler gates the destructive action. Setting `dropEffect` to `none` before arming is invalid because a stationary pointer can retain that old verdict and suppress the final drop event.

## D009: Persist before acknowledging a model change

Status: active

Decision: Host mutations await `saveLandingPageModel` before sending the updated model to the webview.

Reason: Optimistically redrawing before VS Code finishes storage can show success when the write failed and can reorder overlapping writes.

Consequences: Entry-point actions catch rejected promises and show a VS Code error. The returned model sync is the normal completion acknowledgement, so short storage writes do not need a flashing spinner.

## D010: Opening behavior depends on target type

Status: active

Decision: Folders and workspace files may open in a new window. Plain files open in the current window.

Reason: `vscode.openFolder` supports `forceNewWindow`; `vscode.open` for a file does not.

Consequences: Ctrl or Cmd click, keyboard shortcuts, and menu items must all apply the same type check.

## D011: Filesystem health is observed state

Status: active

Decision: Missing local targets and Git branch names are checked by the host and sent through `bookmarkHealth`. They are not persisted in the model.

Reason: Persisted health becomes stale when a file returns or a branch changes. Remote and virtual URIs may be valid while their provider is unavailable.

Consequences: Check only `file:` targets. Drop missing entries from Recent, but mark and retain deliberate bookmarks in user groups. Read branches from `.git/HEAD` so the feature does not depend on the built-in Git extension being enabled.

## D012: The page follows the editor theme

Status: active

Decision: Page colors use `--vscode-*` variables. Bookmark shades are accent fills, not a page palette. Text derived from a shade uses `--shade-readable` or `--group-accent-text`.

Reason: The page sits inside VS Code and must remain legible in dark, light, and high-contrast themes. Raw accent colors often fail text contrast.

Consequences: Test all three themes. Paint bookmark color on the spine and icon container rather than washing the card background. Scope swatch rules to `.palette button[data-shade]` so model containers are not styled as swatches.

## D013: Motion uses shared tokens

Status: active

Decision: Motion uses the curves and durations declared at the top of `landingpage.scss`. JavaScript animations read the same tokens through `motion()`.

Reason: Independent values drift and make parts of one gesture settle at different times.

Consequences: Pointer feedback uses `--dur-hover`, travel uses `--dur-move`, presses use `--dur-press`, and entrances use `--dur-enter`. Reduced motion removes translation and scale while preserving color, opacity, focus feedback, and destructive safeguards.

## D014: Menus, palettes, and hover details manage their own boundaries

Status: active

Decision: Opened surfaces take focus, restore it to their trigger, and are repositioned when their size or the viewport changes. Bookmark details use one shared non-interactive Popover API element.

Reason: Menus rendered later in the document are otherwise many tab stops away, and fixed coordinates can move a growing confirmation off screen. The popover top layer avoids clipping by page overflow and stacking contexts.

Consequences: Keyboard-opened menus fall back to trigger geometry because synthetic clicks report coordinates at zero. Do not set `display` on a closed `[popover]`. Open hover details only when label, path, or branch text is clipped. Right-click closes the hover detail before opening the action menu.

## D015: Accessibility is part of the interaction contract

Status: active

Decision: Bookmark cards are keyboard reachable, use geometric arrow navigation, and expose their label and path through `aria-labelledby` and `aria-describedby`. Icon-only controls name the group they affect. Asynchronous confirmations use one polite live region.

Reason: The page has several visual-only actions and mixed layouts where document order does not match spatial navigation.

Consequences: Controls inside a card handle their own keyboard events. Opening a surface moves focus into it and closing restores focus. Do not put `aria-label` on a bookmark card because it would replace the accessible content name and hide the path or missing state.

## D016: Tests are layered by what they can prove

Status: active

Decision: Pure host logic uses colocated Mocha tests inside the VS Code Extension Host. Browser behavior uses the real harness and asserts on posted messages and geometry. Screenshots confirm appearance but do not prove behavior.

Reason: Typechecking, linting, and bundling cannot detect timing, focus, drag, clipping, or animation bugs.

Consequences: Run the full matrix in `DEVELOP.md`. A regression check must fail against the broken implementation before the fix. The harness must mirror serialization and message timing from the real host.
