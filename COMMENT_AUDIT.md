# Source comment audit

No executable files were changed as part of this audit.

## Conventions

- Each comma-separated `DELETE` range is a separate proposed deletion.
- Adjacent comment lines are already grouped into one range.
- `KEEP` and `COMPRESS` state the exact fact that must survive.
- The TypeScript reference directive and HTML injection markers are excluded because they are executable syntax, not documentary comments.

## Line-addressed ledger

### Host and model

#### `src/LandingPage/LandingPageModel.ts`

- `KEEP 9` - Changing `LandingPageModel` may require updating `communication.ts:resetModel()`.
- `KEEP 65` - An omitted `icon` is interpreted as a plain file.
- `COMPRESS 35-41` - `list` is full-width rows, `grid` is tiles, and `compact` is the dense wrapping layout.
- `COMPRESS 44-50` - Collapse state persists across reloads and windows; filtering may temporarily reveal a collapsed group without changing that stored state.
- `COMPRESS 66-70` - `glyph` stores the suffix of a `glyph-*` key; when absent, presentation derives the icon from the bookmark type.
- `COMPRESS 90-93` - `ownerGroup` is present only for bookmarks; absence identifies a group result.
- `MOVE 72-77 -> DECISIONS D007` - Pinning changes rendered order without changing stored order, so unpinning restores the prior position.
- `DELETE 1-3, 6, 12, 15, 17, 21-23, 26, 28, 30, 32, 54-57, 60, 62, 64, 79, 86, 88, 97-102` - Obvious type, field, or function narration; includes commented-out `order`.

#### `src/LandingPage/LandingPageTemplate.ts`

- `MOVE 4-5 -> DECISIONS D003 / AGENTS.md` - The webview build must precede the extension build because the extension imports the generated bundle.
- `COMPRESS 10-19` - `renderLandingPage` has no `vscode` dependency so the harness and extension render exactly the same page.
- `COMPRESS 42-48` - `cspSource` must be included in the generated CSP `img-src`.
- `DELETE 29, 37-39` - The replacement loop and wrapper class already say what they do.

#### `src/LandingPage/bookmark-creation.ts`

- `COMPRESS 15-23` - Determine the target type with `stat`; an extension cannot distinguish a dotted folder from a file.
- `COMPRESS 36` - If the URI cannot be stat-ed, fall back to the add flow's extension heuristic.
- `MOVE 47-61 -> DECISIONS D004/D006` - Explorer creation may use native input, destination selection occurs when needed, and Recent is never a destination.
- `MOVE 111-121, 137-138 -> DECISIONS D006` - Page-level folder creation uses the save dialog, opens the folder without bookmarking it, and lets VS Code add it to Recent.
- `DELETE 9, 42, 79, 85` - Obvious helper narration, default branch narration, and cancellation labels.

#### `src/LandingPage/bookmark-health.ts`

- `KEEP 67-68` - Await the health reply inside the `try` so both a synchronous disposed-panel error and an asynchronous rejection are caught.
- `KEEP 99` - A `.git` pointer may resolve to either an absolute path or a path relative to the directory containing the pointer file.
- `COMPRESS 54` - An unparseable stored path is a model problem, not evidence that the target is missing.
- `COMPRESS 73-86` - Branch detection must handle a `.git` directory, a worktree/submodule `gitdir:` file, and detached HEAD.
- `MOVE 4-14, 27-44 -> DECISIONS D011` - Only confirmed-missing local targets are missing; health and branch data are observed state and must not be persisted.
- `DELETE 60, 70, 107, 111` - The branch condition, empty catch, detached return, and failure return are already explicit in code.

#### `src/LandingPage/bookmark-moves.ts`

- `MOVE 8-17 -> DECISIONS D004/D007` - Group insertion indexes are measured before lifting the source, and Recent remains last.
- `MOVE 44-61 -> DECISIONS D004/D007` - Recent is source-only, rendered bookmark positions are addressed by GUID rather than stored index, and no-op drops do not write.
- `MOVE 89-100 -> DECISIONS D004/D015` - Moving through a menu is the keyboard route; Recent entries are copied rather than moved.
- `DELETE 28, 65, 86, 125` - Obvious no-op, type-guard, and cancellation narration.

#### `src/LandingPage/clipboard-path.ts`

- `COMPRESS 4-20` - Use the host clipboard because the webview clipboard has permission and gesture constraints; copy local targets as `fsPath`, other targets as URIs, and show success only after the host confirms the write.
- `COMPRESS 51-66` - Quote only text containing shell metacharacters; POSIX uses single quotes with embedded-quote reopening, while Windows uses double quotes.
- `DELETE 33, 44, 69` - The catch, failure return, and regex character-class narration repeat the code or the retained contract.

#### `src/LandingPage/clone-repository.ts`

- `COMPRESS 3-12` - Delegate cloning to `git.clone`; it owns destination selection, progress, authentication, and the final open prompt.

#### `src/LandingPage/communication.ts`

- `KEEP 60-61` - Post the fresh model immediately and let health arrive asynchronously afterward.
- `KEEP 102-107` - Capability messages must wait for `documentReady`, because earlier messages are dropped; the asynchronous probe must tolerate panel disposal.
- `KEEP 190-192` - Invoke `code` with an argument array, never a shell string, and convert the stored URI to a filesystem path.
- `KEEP 239-241` - Unpinning stores `undefined`, not `false`, so empty Recent overlay records are removed.
- `KEEP 247-249` - Collapse state lives on the group, including Recent; only Recent's generated children need the customization overlay.
- `COMPRESS 24-32` - Probe `code` asynchronously once per session; without a shell, `code.cmd` is unavailable on Windows and the menu item is withheld.
- `COMPRESS 65-71` - Resetting the board must also clear Recent overlays so orphaned customizations do not remain.
- `COMPRESS 82-87` - `sharedModel` is host-owned state supplied by `extension.ts`, not model data accepted from the webview.
- `COMPRESS 90-92` - Refresh MRU only for commands that resolve or render model items.
- `COMPRESS 215-220` - Validate shade tokens, treat the empty string as clearing the shade, store the Recent group's own shade directly, and use the overlay only for generated Recent entries; the stale claim that bookmark icons use the shade must not survive.
- `MOVE 17-20 -> AGENTS.md` - `communication.ts` is a dispatcher and should not own feature behavior.
- `MOVE 44-55 -> DECISIONS D004` - Recent is refreshed from all supported entry points because VS Code history changes outside the page.
- `MOVE 178-180, 182-183 -> DECISIONS D010` - Folders and workspaces use `openFolder`; files use `vscode.open` or the CLI for a new window.
- `MOVE 262-263 -> DECISIONS D009` - Every persisted mutation returns the updated model because the webview renders from model sync.
- `DELETE 110, 113, 122-123, 138, 151, 156, 161, 170, 186, 203, 210, 230, 254, 291, 298, 304, 310, 313` - Obvious switch payload, branch, URL, or fallback narration.
- `DELETE 274-275` - Stale history: it mentions a rebuild flag, while `syncModelInWebview` explicitly documents that no such consumer exists.

#### `src/LandingPage/group-destination.ts`

- `MOVE 5-13 -> DECISIONS D006` - Page-level creation resolves its destination at the last responsible moment and skips prompting when only one destination exists.
- `DELETE 22, 31-34` - The single-target branch and bookmark-count formatter are self-explanatory.

#### `src/LandingPage/history.ts`

- `KEEP 45-56` - MRU GUIDs must derive from the target URI, never list position; positional GUIDs can make a stale card open a different target after history reorders.
- `COMPRESS 5-8, 23-27, 34-38` - These interfaces model the undocumented `_workbench.getRecentlyOpened` response and were inferred from runtime behavior.
- `COMPRESS 117-120` - `maxRecentItems: 0` means unlimited.
- `MOVE 109-113 -> DECISIONS D004` - Apply the Recent limit only after hidden and missing entries are removed.
- `DELETE 11, 14, 16, 19, 62-67, 103, 107` - Obvious field/function narration, uncertainty noise, and discarded code.

#### `src/LandingPage/iconography.ts`

- `KEEP 78-91` - Strip `width` and `height` only from the opening `<svg>` tag; stripping child geometry blanks icons containing sized shapes.
- `KEEP 148-150` - `glyph-*` keys are persisted user data; add keys but do not rename existing ones.
- `DELETE 97, 98-103, 106, 140` - Unscoped TODO, obvious collection narration, and local label comments.

#### `src/LandingPage/model-storage.ts`

- `KEEP 9-16` - Register the extension context before panel creation because Explorer actions can mutate storage without ever opening the page.
- `MOVE 22-27 -> DECISIONS D009` - The board and Recent overlays use global state because they must be shared across workspaces and windows.
- `DELETE 4-6, 33-36` - Obvious variable and save-function narration.

#### `src/LandingPage/recent-mru-overlay.ts`

- `KEEP 106-109` - Resetting the model must clear stored Recent customizations or leave orphaned overlay entries.
- `COMPRESS 15-20` - The overlay contains only user-editable fields; path and target type always come from VS Code.
- `COMPRESS 45-54` - Updating a Recent customization changes both durable overlay state and the live model; an empty value removes the override.
- `COMPRESS 152-167` - Remove hidden and missing entries before applying the visible limit, and stat candidates in batches only until the quota is filled.
- `COMPRESS 171-172` - Batch at least ten candidates so a run of missing entries does not require one round trip per entry.
- `MOVE 6-9, 86-91, 115-130 -> DECISIONS D004` - Recent mirrors VS Code, is sealed, and local removal means hiding rather than editing VS Code history.
- `MOVE 33-39 -> DECISIONS D005` - Recent customizations must live in a durable overlay because rebuilds replace project objects.
- `DELETE 73-77, 100, 135, 139` - Obvious helper narration and branch labels.

#### `src/LandingPage/uri-name-parts.ts`

- `COMPRESS 20-28` - Split on the last non-leading dot, but do not use the result to infer whether a dotted URI names a file or folder.
- `DELETE 3-5, 8-11, 13-16, 36, 41` - Obvious result-field and branch narration.

#### `src/LandingPage/webview-messages.ts`

- `KEEP 25` - `toIndex` is measured among user-created groups.
- `KEEP 30` - `beforeGuid` names the bookmark at the landing point; absence means the end of the destination group.
- `COMPRESS 39-61` - `postMessage` serializes a fresh object, so harness substitutes must `structuredClone` before handing model data to Preact; delete the wrapper-count justification and discarded `forceRebuild` history.
- `MOVE 4-9 -> DECISIONS D002 / AGENTS.md` - The webview can reach host capabilities only through the message bridge.
- `DELETE 14, 17, 19, 21, 23, 28, 33, 35` - Obvious payload-field narration.

#### `src/extension.ts`

- `KEEP 28-30` - Load stored state during activation because Explorer actions may run before the panel exists.
- `KEEP 62-64` - VS Code passes the clicked resource first and the multi-selection second; the latter is absent for palette invocation.
- `COMPRESS 129` - The page inlines its assets, so its webview requires no local resource roots.
- `MOVE 71-79 -> DECISIONS D010` - VS Code has no workspace-tab API; the extension opens a window and lets macOS native tabs decide presentation, while command wording reflects whether a file or folder was clicked.
- `MOVE 146-148 -> DECISIONS D004` - Refresh Recent when a hidden panel becomes visible.
- `DELETE 9, 50, 56, 131, 153-154` - Obvious wrapper/call-path narration, commented-out configuration, and duplicate-work history.

#### `src/vite-env.d.ts`

- `KEEP 3-4` - `vite/client` supplies the module declarations for the `?raw` and `?inline` imports used by the template and iconography code.
- `EXCLUDE 1` - TypeScript reference directive, not documentary prose.

### Tests

#### `src/LandingPage/LandingPageModel.test.ts`

- `DELETE 26` - The test name and assertions already establish the `ownerGroup` distinction.

#### `src/LandingPage/bookmark-health.test.ts`

- `KEEP 7-13` - Every case needs an isolated fixture directory; sharing fixtures previously let a later test recreate an intentionally missing target.
- `KEEP 45-46` - Remote and virtual URIs must not be marked missing merely because their provider is unloaded.

#### `src/LandingPage/bookmark-moves.test.ts`

- `KEEP 24-26` - Resolve `beforeGuid` after lifting the source or downward moves land one position late.
- `KEEP 61-62` - A Recent entry moved out would return on the next rebuild, so the operation must copy.
- `KEEP 96-97` - A downward group `toIndex` was measured before lifting the source and must account for the closed gap.
- `DELETE 16` - The helper name and implementation already explain the projection.

#### `src/LandingPage/clipboard-path.test.ts`

- `KEEP 4-6` - Platform cannot be changed inside the test process, so each platform-specific branch can only be asserted on that platform.
- `KEEP 25` - POSIX embeds a single quote by closing the quoted string, escaping the quote, and reopening it.
- `DELETE 11-12, 19, 40-41` - The test names and expected values already express these cases.

#### `src/LandingPage/recent-mru-overlay.test.ts`

- `COMPRESS 7-12` - Candidate helpers must create real files because `takeExisting` decides through filesystem stats.
- `KEEP 32-33` - The regression is applying the limit before filtering, which under-fills Recent and makes its count disagree.
- `KEEP 70-71` - The test must place survivors on both sides of the first batch boundary.

#### `src/LandingPage/uri-name-parts.test.ts`

- `KEEP 28` - A dotted folder proves callers cannot infer target type from `ext`.
- `DELETE 36` - The test name and expected basename already explain leading-dot behavior.

#### `src/LandingPage/webview/bookmark-filter.test.ts`

- `KEEP 34` - Malformed percent escapes must fall back to the raw path instead of breaking search.
- `KEEP 146` - An untyped bookmark renders with the default file glyph but is not eligible for the explicit file CLI branch.
- `COMPRESS 128` - `opensInWindow` answers whether the VS Code API supports the operation; `offersNewWindow` additionally accounts for the CLI.
- `MOVE 5-10 -> AGENTS.md` - `bookmark-filter.ts` must remain DOM-, Preact-, and bridge-free so it can run in host-side unit tests.
- `DELETE 41, 49, 95` - Examples and decision references repeat test names and assertions.

### Webview TypeScript

#### `src/LandingPage/webview/bookmark-filter.ts`

- `KEEP 18` - Malformed URI escapes fall back to raw text rather than failing the search.
- `COMPRESS 8-15` - Search labels and decoded display paths, with the `file://` scheme removed.
- `COMPRESS 30-33` - Split the query into terms; every term must match, in any order.
- `MOVE 1-4 -> AGENTS.md` - This module remains pure and DOM-free.
- `MOVE 45-50 -> DECISIONS D018` - Matching a group label reveals all bookmarks in that group.
- `MOVE 58-64, 68-76 -> DECISIONS D010` - API support and menu availability are separate new-window questions because files depend on the CLI.
- `MOVE 83-88 -> DECISIONS D007` - Pinning is a stable rendered sort, not a model reorder.
- `DELETE 23, 37` - Obvious one-line function narration.

#### `src/LandingPage/webview/bridge.ts`

- `MOVE 1-6 -> AGENTS.md / DECISIONS D002` - The isolated bridge prevents circular imports while providing the webview's only host channel.

#### `src/LandingPage/webview/components.tsx`

- `KEEP 27-28` - `undefined` means the carried bookmark is elsewhere; `null` means it would land at this group's end.
- `KEEP 87-92` - Chromium has no per-axis `overflow-clip-margin`; suspend the margin during a height animation so the next row's spine cannot leak through.
- `KEEP 98-101` - Groups are named regions with headings below the page heading.
- `KEEP 107-110` - Use drag-start state rather than one-render-late receiving state, and never treat Recent as a bookmark destination.
- `KEEP 112-113` - Every icon-only group action must include the group name in its accessible name.
- `KEEP 116-119` - Folded cards must be unmounted, not merely CSS-hidden, or DOM navigation still discovers them.
- `KEEP 137-142` - Derive card name and description from visible label/path elements; an `aria-label` would replace and hide path, branch, and missing-state content.
- `KEEP 145-146` - Use individual `translate`, not `transform`, so drag-gap motion and scale can have independent timings.
- `KEEP 154-155` - `useAnchored` exclusively owns surface coordinates; rerenders must not restore raw click coordinates.
- `KEEP 170-173` - The surface is a dialog, not an ARIA menu, because it contains inputs and ordinary buttons and uses Tab navigation.
- `KEEP 183-187` - Group reordering needs a keyboard route, with unavailable edge actions omitted.
- `KEEP 224-236` - Picker controls must be real, named, focusable buttons in dialogs; focus enters on open and returns to the trigger on close.
- `KEEP 283-293` - Start dwell from both `dragenter` and `dragover`; Chromium can resume `dragover` after leaving the webview without another `dragenter`.
- `KEEP 315-318` - A stationary pointer may arm without another `drop`; use `dragend` as the release signal and guard against double posting.
- `KEEP 326-329` - Keep the browser drop target valid throughout dwell; setting `dropEffect:none` early can suppress the final Chromium drop.
- `COMPRESS 16-19` - A matching group label reveals all its bookmarks; missing Recent entries are filtered by the host before the visible cap so header count and rendered rows agree.
- `COMPRESS 30-31` - For an end drop, place the marker on the last non-carried card.
- `COMPRESS 35-43` - List layout opens a transform-only gap; grid and compact retain an insertion line because transforms cannot represent row rewrapping.
- `COMPRESS 46-71` - Animate the persistent wrapper for any content-height change, while folded cards remain unmounted; measure the unanimated child, never an in-flight wrapper, and use hover duration only for drag-gap changes.
- `COMPRESS 120-124` - Because transformed cards occupy no layout space, reserve equivalent bottom padding while an end gap is open.
- `COMPRESS 157-166` - Focus the first applicable control only when the menu mounts; later rename and confirmation states manage their own focus.
- `COMPRESS 197-207` - The shared detail popover reveals clipped path and health data that native titles cannot combine; keep it mounted so it can be measured before opening.
- `MOVE 1-4 -> AGENTS.md` - Leaf components render supplied state and post intent; `App` owns page state.
- `MOVE 22-24 -> DECISIONS D018` - Filtering temporarily overrides collapse without mutating persisted state.
- `MOVE 250-274 -> DECISIONS D008/D015` - The delete zone is dwell-armed, distinguishes hide from remove, names each state, and stays hidden from accessibility because keyboard-equivalent actions exist in the menu.
- `DELETE 84, 128, 351-354` - Obvious branches and discarded UX-copy history.

#### `src/LandingPage/webview/drag-geometry.ts`

- `KEEP 25-26` - Use `Array.from` because the configured libraries do not make `NodeList` iterable to TypeScript.
- `KEEP 84-90` - Use layout offsets during drag; transformed rectangles move during the gap transition and make the landing point oscillate.
- `KEEP 134-135` - Horizontal navigation stays among vertically overlapping row-mates; vertical navigation excludes them.
- `KEEP 143-144` - Distance along the travel axis wins, with horizontal distance breaking vertical-navigation ties.
- `KEEP 153-154` - Document-order fallback lets horizontal navigation wrap between rows.
- `COMPRESS 30-52` - Measure groups before their cards so parent deltas are known; namespace group/bookmark keys and number repeated bookmark GUIDs by stable DOM occurrence.
- `COMPRESS 71-80` - List insertion uses horizontal boundaries; grid and compact use vertical position after skipping completed rows; exclude the dragged card and use `null` for an end drop.
- `MOVE 1-6 -> DECISIONS D007 / AGENTS.md` - Drag geometry follows rendered DOM order, not stored order.
- `MOVE 10-17 -> DECISIONS D014` - Open hover detail only when label, path, or branch is clipped.
- `MOVE 115-126 -> DECISIONS D015` - Arrow navigation is geometric across all layouts.
- `DELETE 24, 102-107` - Obvious collection and distance-formula narration.

#### `src/LandingPage/webview/main.tsx`

- `KEEP 29` - Group drag insertion indexes are in user-group coordinates.
- `KEEP 55-57` - Hold the menu trigger in a ref so focus can return without keeping a stale DOM node in rendered state.
- `KEEP 59-60` - Copy success is driven by the host reply, never optimistic UI.
- `KEEP 69` - The focus-filter message originates from a VS Code keybinding outside the webview.
- `KEEP 116-119` - Popovers are viewport-positioned; close pointer hover on scroll but remeasure focused-card detail.
- `KEEP 132-134` - Keyboard handling belongs on `window` because initial focus is on `document.body`, outside `<main>`.
- `KEEP 142` - Escape closes the innermost active surface first.
- `KEEP 149-150` - Consume `/` only when the filter exists.
- `KEEP 155-156` - Copy shortcuts work from hovered cards, so handle them before requiring card focus.
- `KEEP 162-167` - Ignore key activation from controls inside a card; otherwise bubbled handling cancels button clicks and performs card actions.
- `KEEP 208-220` - Use one polite live region for copy, refresh, and filter confirmations; none is urgent enough to interrupt typing.
- `KEEP 272-278` - Store FLIP baselines in document coordinates and only when nothing is in flight.
- `KEEP 287-288` - Increment the generation before the drag bail-out so an older settle cannot overwrite a newer baseline.
- `KEEP 293-302` - Viewport-relative baselines turn scroll into false movement; persistent positions must be document-relative.
- `KEEP 305-308` - Measure every element before starting any parent animation, or the parent transform corrupts child measurements.
- `KEEP 309-322` - Suppress flights only below an in-flight height animation; the animating group's own cards still have valid layout boxes.
- `KEEP 334-335` - Cancel only this effect's WAAPI flights, not unrelated CSS animations returned by `getAnimations()`.
- `KEEP 340-341, 351-353` - Every persisted and compared FLIP position must use the same document-relative coordinate frame.
- `KEEP 363-367` - Subtract the parent group's movement from a child's delta to prevent composed transforms from doubling travel.
- `KEEP 371` - Ignore sub-pixel drift rather than allocating a composited animation layer.
- `KEEP 375-377` - Remove completed flights from the map; cancellation rejection is expected because cancellation already performs cleanup.
- `KEEP 386-405` - After height animations and flights settle, remeasure baselines so later renders do not replay provisional positions.
- `KEEP 411` - Use `allSettled` because animation cancellation is an ordinary outcome.
- `KEEP 418-433` - A `ResizeObserver` must refresh baselines after reflow without render, but not while any animation is in flight.
- `KEEP 450` - A hovered card may disappear from the model before hover state clears.
- `KEEP 459-461` - Opening a context menu closes hover detail and cancels its timer so it cannot reappear over the menu.
- `KEEP 463-468` - Keyboard-synthesized clicks report zero coordinates; fall back to trigger geometry and read `currentTarget` before dispatch completes.
- `KEEP 477-479` - Closing a menu returns focus to its trigger rather than `document.body`.
- `KEEP 493-497` - Delegated hover uses bubbling `mouseover`/`mouseout`; `mouseenter`/`mouseleave` cannot be delegated.
- `KEEP 504` - While a context menu is open, it owns the interaction and hover handling must not reopen detail.
- `KEEP 524-544` - Chromium may omit `dragend` after release outside the window; suppressed pointer/mouse events returning with no pressed button prove the drag ended; do not use `keydown`, and never route this cancellation through destructive release.
- `KEEP 581-585` - Remeasure the bookmark destination in the drop handler because the preceding dragover state may not have rendered yet.
- `COMPRESS 31-37` - Carry state records origin, destination, landing GUID, and the drag-start gap measurement; Recent origins copy instead of move.
- `COMPRESS 39-41` - Refresh busy state starts on request and ends on any returned model sync.
- `COMPRESS 223-224` - Announce refresh completion only on the busy-to-idle transition after a real refresh.
- `COMPRESS 236-268` - FLIP compares stable layout boxes and does nothing mid-drag; when interrupting a flight, cancel it, recover the real layout box, and add the prior visual offset to preserve direction.
- `COMPRESS 452-453` - Distinguish a group filtered to no matches from an actually empty group.
- `COMPRESS 556-557` - Group drag indexes exclude Recent; Recent reports `-1` and is neither draggable nor a destination.
- `MOVE 1-7 -> DECISIONS D001 / AGENTS.md` - This remains the only page implementation and `App` owns all page state.
- `MOVE 43-45 -> DECISIONS D011` - Filesystem health is webview-only observed state.
- `MOVE 87-89 -> DECISIONS D014` - Hover detail uses the Popover top layer to escape clipping.
- `MOVE 187 -> DECISIONS D015` - Arrow-up from the top bookmark moves focus to the filter.
- `MOVE 567-569, 650-651 -> DECISIONS D004` - Recent takes no drops and its entries are hidden rather than removed.
- `MOVE 619-621 -> DECISIONS D018` - Hide the filter on an empty board.
- `MOVE 643-645 -> DECISIONS D008` - Render the delete target only while carrying a bookmark.
- `DELETE 49-50, 63, 80, 99, 102, 109-112, 172-173, 338, 382, 501, 505, 510, 519-520, 595-599, 630-631, 660` - Obvious state/render narration, duplicated positioning rationale, and discarded UI history.

#### `src/LandingPage/webview/motion.ts`

- `KEEP 97-98` - Fixed, content-sized surfaces can be measured while partially offscreen without changing their dimensions.
- `KEEP 111-119` - A `ResizeObserver` must reclamp surfaces that grow after opening, especially destructive confirmation menus.
- `KEEP 122-123` - Reposition open surfaces when the viewport changes.
- `COMPRESS 10-24` - Reduced motion skips JS movement while preserving CSS feedback; query `matchMedia` per call so changes apply without reload.
- `COMPRESS 28-49` - JS animations read shared CSS timing tokens; the caller chooses move versus hover duration, and resolved token values may be cached with pre-mount fallbacks.
- `COMPRESS 71-89` - Measure, flip, and clamp pointer-opened surfaces before paint, then record the corner nearest the trigger as their animation origin.
- `COMPRESS 102-103` - If a surface fits on neither side, pin it to the nearest viewport edge.
- `MOVE 1-6 -> DECISIONS D013` - CSS is the timing source and `stillness()` is the JS reduced-motion counterpart.
- `DELETE 61` - The unit conversion is evident from the calculation.

#### `src/LandingPage/webview/presentation.tsx`

- `COMPRESS 33-34` - Plain files use the ordinary file glyph, not the unknown-file glyph.
- `MOVE 1-6 -> DECISIONS D012a` - Shade keys are user data and bookmark shades are represented by the spine.

#### `src/LandingPage/webview/types.ts`

- `KEEP 8` - Layout strings are persisted user data and cannot be casually renamed.
- `DELETE 1-6, 11` - File-placement and obvious type narration.

### Styles and template

#### `src/LandingPage/content/landingpage-preact.html`

- `EXCLUDE 7, 11` - Build-time CSS and JavaScript replacement markers; removing them would change executable behavior.

#### `src/LandingPage/content/landingpage.scss`

##### KEEP

- `51-54` - Preserve the mapping: press is fastest, hover follows the pointer, enter is arrival, and move is travel.
- `101-103` - The webview body does not inherit the editor font automatically.
- `117-122` - Screen-reader-only text must remain in the accessibility tree and be constrained to a non-wrapping 1px box.
- `163-176` - Preserve each persisted shade's documented OKLCH coordinate when maintaining the palette.
- `178-188` - Shade-derived text uses the measured readable mix; 30% toward the literal is the floor, and palette/mix changes must be evaluated together.
- `199-211` - The SVG wrapper must not create a text line box; otherwise baseline descender space shifts icons vertically.
- `285-291` - Swatch selectors must remain scoped to palette buttons or model containers are styled as swatches; changing the control element requires updating the selector.
- `295-297` - Black and clear swatches need a theme-derived boundary on dark themes.
- `334-339` - Swatches must remain real buttons, and `data-shade` styling must not escape the palette.
- `404-409` - Put scrim alpha in the color, not parent `opacity`, because parent opacity dims the dialog too.
- `413-421` - Animate scrim `background-color`, not opacity; a one-sided keyframe lets the computed theme color remain the target.
- `556-564` - Center single-line action buttons without `transform`, because the press state already owns transform.
- `570-572` - Copy success stays visible until the host-confirmed result is shown.
- `600-603` - Bottom padding must leave enough scrollable room for the last bookmark's hover detail.
- `855-859` - Use literal accent values for fills and `--shade-readable` for text.
- `864-866` - Entrance animations use `backwards`, not `both`, because forwards fill would override the dragging opacity.
- `884-885` - A newly created pseudo-element needs an animation; it has no prior value for a transition.
- `902-904` - Temporarily allow overflow on a drop-marked card so the insertion line outside its clipped box remains visible.
- `1075-1076` - Recent refresh needs visible busy feedback even when the resulting list is unchanged.
- `1130-1146` - Folded cards are unmounted, so animate a persistent wrapper; specify both overflow axes, use `clip` so `overflow-clip-margin` works, and reserve enough margin for the focus indicator.
- `1153-1157` - Lift both overflow-axis clips while a group receives a drop; specifying one axis would make the other `auto`.
- `1166-1168` - Card entrance fill must be `backwards` or it overrides drag opacity.
- `1211-1213` - Children under `display:contents` need explicit grid placement.
- `1388-1396` - Use individual `translate` for the drag gap so it composes with FLIP's transform; time the pointer-following gap with hover duration.
- `1400-1402` - Declare spine scale on the card so `:hover` wins without a higher-specificity painted-spine declaration.
- `1413-1421` - Use `:focus`, not heuristic `:focus-visible`, because arrow navigation moves focus programmatically.
- `1445-1449` - Do not dim the missing bookmark's label below text contrast requirements; the missing state already has other signals.
- `1461-1463` - Pin glyphs use `--shade-readable` without additional opacity.
- `1496-1498` - Branch badge text requires `--shade-readable`; raw shades fail text contrast.
- `1502-1504` - Ellipsis requires the branch name's own block container.
- `1586` - A painted resting spine is 3px of its 4px box.
- `1632-1634` - Functional path text must remain at least 11px.
- `1672` - Nested SVG/tooltip content must not become the event target.
- `1742-1750` - Inset the delete zone from the window edge so an overshoot remains inside Chromium's drag surface.
- `1753-1755` - Center the delete zone without transform because its entrance animation owns transform.
- `1765-1766` - Explicit sizing must account for the absence of a global `box-sizing` reset.
- `1789-1799` - Before arming, the delete zone must visibly remain a hold state, and text over its error-tinted fill must use the measured readable mix.
- `1874-1880` - `pointer-events` changes discretely; retain the 99% keyframe so destructive confirmation stays inert until the end.
- `1926-1930` - When reducing the transition-property list, replace its duration list too because CSS matches and cycles durations positionally.
- `1937-1944` - Focus feedback remains instantaneous under reduced motion.
- `1959-1964` - Reduced motion must not disable `confirm-arm`; it is a non-moving destructive safeguard.
- `1968-1975` - Popover top-layer placement escapes clipping, and the UA `inset`, margin, border, and padding defaults must all be reset.
- `1992-1993` - Hover detail remains non-interactive so it cannot steal the hover that opened it.
- `1996-2000` - Never set author `display` on a closed popover; author CSS overrides the UA rule that hides it.

##### COMPRESS

- `21` - `--sidebar-width` remains zero only because existing offset rules still consume it.
- `30-46` - The three curves mean arrival/response, movement, and hover color; choose by motion purpose, not component.
- `56-70` - `--dur-enter` is animation-only, pointer-following feedback uses `--dur-hover`, and the continuous clone spinner is outside the transition scale.
- `108-111` - Disable text selection during drag but keep paths selectable.
- `321-323` - Palettes reuse the menu's anchoring, clamping, and origin-aware entrance.
- `444-452` - `useAnchored` flips and clamps the menu and writes the actual transform origin.
- `542-544` - Grid action buttons stay out of flow so they do not add height to cards.
- `620-623` - The title area shrinks before header actions so actions do not wrap into a second row.
- `795-804` - Stagger only the first-run empty state, never transient filter results; do not animate the parent and children together because opacity multiplies.
- `870-872` - Draw group drop position with a pseudo-element so no placeholder reflows the list.
- `892-894` - Use outline for group receiving state to avoid reflow, and never decorate Recent as a destination.
- `916-918` - Bookmark insertion lines are horizontal in list and vertical in wrapping layouts, matching geometry.
- `986-992` - Rotate one chevron instead of swapping icons, and time it with the group's height animation.
- `1045-1053` - Scale the full-width hairline instead of animating background size; transform avoids repaint and does not affect flex layout.
- `1098-1102` - FLIP handles movement caused by opening the composer, so the composer itself only fades.
- `1195-1198` - Anchor the grid icon to the label's first line so wrapped labels do not misalign neighboring cards.
- `1252-1260` - Draw one divider per row junction and use `clip` so it may extend into the gap.
- `1471-1480` - Health badges arrive after the initial model and therefore fade in without changing layout.
- `1555-1573` - Spine growth uses scale rather than width; keep scale variables on the card for specificity and grow from the leading edge to stay within clipping.
- `1621-1625` - Keep the path row flex-aligned so inline-flex badges do not sit off the text baseline.
- `1816-1826` - Entrances travel inward so they do not escape clipping or change scroll width; arriving cards only fade because FLIP owns positional movement.
- `1865-1867` - Hover detail uses its measured nearest-trigger origin and no translation that could fight positioning.
- `1901-1920` - Reduced motion removes moving properties and named scale/translation animations while retaining color, opacity, progress, and safeguards; blanket overrides require `!important`.
- `2006-2018` - Apply transforms only to an open popover, use `data-side` for the trigger-nearest origin, and keep the scale change slight for the wide surface.

##### MOVE

- `1-8 -> AGENTS.md / DECISIONS D003/D012` - Build inlining and theme-color policy.
- `23-24, 594-597, 724-726, 774-776 -> DECISIONS D018` - Centered page measure, shared width, and non-hero filter treatment.
- `72-76, 510-523, 1720-1739 -> DECISIONS D008` - Destructive dwell timing and interaction safeguards.
- `145-162 -> DECISIONS D012/D012a` - Persisted palette keys and accessibility constraints.
- `943-944, 997-1000, 1013-1019, 1528-1544 -> DECISIONS D017` - One aligned accent gutter, neutral group icon, bare count, and fixed spine geometry.
- `1055-1057, 1948-1951 -> DECISIONS D013` - Related pointer feedback shares timing, and reduced-motion surfaces retain opacity-only entrance.
- `1382-1384, 1604-1616 -> DECISIONS D012a` - The spine is the bookmark's only accent and icons remain neutral.
- `1437-1441 -> DECISIONS D011` - Missing deliberate bookmarks stay visible and operable.
- `1664 -> DECISIONS D018` - A group filtered to no visible bookmarks collapses.

##### DELETE

- `12, 13-15, 18-19, 27, 82-96, 229, 253-254, 259, 302, 326-327, 349-350, 355, 365-366, 386, 425-427, 505-506, 527-528, 534, 579-580, 589-591, 636-637, 644, 647, 667-670, 686, 712, 792, 845, 854, 888, 957, 969-971, 1031, 1037-1040, 1067, 1083-1086, 1170, 1173-1174, 1181-1184, 1204, 1223, 1235-1241, 1280, 1293-1294, 1304-1307, 1313-1316, 1324, 1338-1339, 1352-1353, 1358, 1370-1377, 1380, 1407-1408, 1424-1425, 1429, 1453-1454, 1468, 1483-1485, 1580-1582, 1591-1592, 1641, 1650, 1668, 1671, 1700, 1702, 1707, 1779, 1807-1808, 1833-1834, 1841-1842, 1854-1858, 1888, 2033-2038, 2067, 2069` - Section dividers, obvious property narration, discarded styling history, or local taste without a maintenance constraint.
- `1580-1582, 1591-1592, 1650` - Specifically stale because they imply colored type icons, contrary to D012a and the neutral icon rule.
- `1854-1858` - Specifically stale because it says pointer surfaces always grow down/right, contrary to `useAnchored` flipping and origin variables.
- `1702` - Specifically stale because it refers to a removed rail.
- `1247-1249, 1424-1425` - These narrate the current left-shadow focus treatment but duplicate a durable rule that belongs in D019.

## Summary by file

| File | Summary |
|---|---|
| `LandingPageModel.ts` | Delete routine field docs; retain persisted/default semantics; move pinning policy. |
| `LandingPageTemplate.ts` | Retain harness/CSP constraints; move build ordering. |
| `bookmark-creation.ts` | Retain URI-type fallback; move creation and destination policy. |
| `bookmark-health.ts` | Retain Git and disposal quirks; move observed-state policy. |
| `bookmark-moves.ts` | Almost entirely durable D004/D007 behavior; delete inline narration. |
| `clipboard-path.ts` | Compress clipboard and quoting contracts; delete implementation narration. |
| `clone-repository.ts` | Compress to the VS Code Git delegation fact. |
| `communication.ts` | Keep timing, security, and overlay rules; remove payload narration and stale rebuild history. |
| `group-destination.ts` | Move destination policy; delete obvious helpers. |
| `history.ts` | Keep stable MRU identity and private-schema warning; remove old code/history. |
| `iconography.ts` | Keep SVG-child geometry and persisted glyph-key invariants. |
| `model-storage.ts` | Keep activation ordering; move global-storage policy. |
| `recent-mru-overlay.ts` | Keep overlay cleanup and batching; move Recent ownership rules. |
| `uri-name-parts.ts` | Keep only the dotted-folder limitation. |
| `webview-messages.ts` | Keep landing-point semantics and serialization invariant; delete routine payload docs. |
| `extension.ts` | Keep command argument and activation quirks; move Recent/opening policy. |
| `vite-env.d.ts` | Keep the reason for Vite type declarations; exclude the directive. |
| Test files | Keep only regression setup, platform limitations, and failure mechanisms; delete examples repeated by test names. |
| `bookmark-filter.ts` | Move pure-module and product rules; retain malformed-path handling. |
| `bridge.ts` | Move the architectural rule. |
| `components.tsx` | Retain accessibility and Chromium drag quirks; compress animation narratives; move product policy. |
| `drag-geometry.ts` | Retain coordinate and browser/compiler constraints; move geometric-navigation policy. |
| `main.tsx` | Retain FLIP, focus, keyboard, and drag-loss regression facts; remove discarded UI history. |
| `motion.ts` | Retain dynamic positioning and resize constraints; compress token narratives. |
| `presentation.tsx` | Move shade policy; retain only the plain-file glyph fact. |
| `types.ts` | Keep persisted layout-string warning; delete file-placement narration. |
| `landingpage-preact.html` | No documentary comments; both markers are executable placeholders. |
| `landingpage.scss` | Largest cleanup opportunity: keep browser, accessibility, contrast, and animation invariants; move product decisions; delete extensive styling history and stale statements. |
