@AGENTS.md

# Notes for coding agents

`AGENTS.md` (imported above) covers what this extension is, how it builds, and the
conventions. This file is about *working on it* without repeating mistakes that have already
been made here.

## Read this first

**A green build is necessary, not sufficient.** The Preact webview is bundled from
`src/LandingPage/webview/main.tsx` and then inlined into a string at runtime. Exercise the
actual page and message bridge after UI changes.

After **any** change to `main.tsx`, `landingpage-preact.html` or `landingpage2.scss`:

1. `npm run compile`, `npm run lint` and `npm run typecheck`.
2. `npm run harness`, then drive the page in a browser and read the console.

## Rendering the page outside VS Code

The fastest feedback loop is not F5 - it is `npm run harness`, which serves the real page at
`http://localhost:5599` against a stubbed extension host. See *The browser harness* in
`AGENTS.md` for what it provides.

Things that used to go wrong here and no longer should, because the harness handles them:

- **Wait for `documentReady` before dispatching `syncModel`.** The Preact listener is
  installed in an effect, just as the extension host waits for that message before syncing.
- **Do not rebuild the icon map by hand.** The harness renders through the same
  `renderLandingPage()` the extension uses, so `iconography.ts` cannot drift out of sync with
  it. A missing key renders an empty icon, which looks like a layout bug, not a missing icon;
  `[...document.querySelectorAll('.icon')].filter(i => !i.querySelector('svg')).length` is the
  check.
- **Shut the harness down when you are finished with it.** It holds port 5599, and the next
  run binding a different port means later verification silently targets the wrong page.

Three things about asserting through it that have already cost time:

- **The stub must `structuredClone` the model, and so must anything else standing in for the
  host.** `communication.ts` mutates its model in place and posts the same object every time;
  `webview.postMessage` serialises it, so the page always receives a fresh one. An in-process
  stub that reposts the same reference makes `useState` bail out on `Object.is`, the page
  stops re-rendering, and a working feature looks completely dead. Collapsible groups
  presented exactly this way before the clone was added.
- **Reload the page between assertions.** Each `eval` runs in the same document, so state
  left by an earlier one - a filter still set, a stubbed global still patched - makes the
  next assertion lie. An Escape-clears-the-filter check failed exactly this way and passed
  on a fresh load.
- **`:focus` needs `document.hasFocus()`.** In an automated window it is often false, and
  then no focus rule matches at all. Check `document.hasFocus()` before concluding a focus
  style is broken.
- **Transitioned properties freeze when the window is not being painted.** `outline-color`
  and the spine width are transitioned, so a throttled window reports their *old* values
  indefinitely, while untransitioned ones like `outline-width` update instantly. A rule that
  looks half-applied is usually this. Read the untransitioned half, or probe the variable.

## Editing this codebase

**Do not do index- or regex-based block surgery on these files.** Several bugs came from
deleting "from marker A to marker B" and silently taking adjacent code with it - the
`LAYOUTS`/`LAYOUT_UI` constants were destroyed this way because they happened to sit next to
a block being removed, which broke `setLayout()` on every model sync. Read the region, then
make a targeted edit.

## Traps specific to this page

- **Never use `opacity` for a scrim or overlay.** `opacity` on a parent creates a stacking
  context children cannot exceed, so the dialog inside renders translucent too and a child
  `opacity: 1` will not save it. Put the alpha in `background-color`.
- **Never set `overflow` on one axis alone** for anything tooltips or menus escape from. CSS
  computes the other axis from `visible` to `auto`, silently creating a clipping context.
- **Distinguish "empty" from "filtered to nothing".** Collapsing every group with no visible
  bookmarks also hid newly created ones, which made "New group" look like a no-op.
- **Card layout is a grid, list layout is a flex column.** A control that works in one can land
  somewhere absurd in the other - the `...` button sat at the bottom-left of every card until
  it was taken out of flow.
- **Inputs and confirmations are local.** Rename opens inside `#ctxmenu`; clone is the page's
  command-bar input; remove and hide confirmations stay in the same menu row. Do not restore
  VS Code header input boxes for these webview actions.
- **`data-shade` is model state, not just a swatch hook.** It appears on groups and bookmark
  cards. Palette-only styles must be scoped to `.palette div[data-shade]`, or a whole group
  can accidentally become a patterned circle.
- **Group ownership is visible.** Add opens `.group-composer` below the destination group.
  The page header's **New** menu is the deliberate exception: it is global, so it asks for a
  destination with a native quick pick.
- **The drop indicator is a pseudo-element, not a node.** `[data-drop]::after` draws the
  landing line on the group itself. Inserting a real placeholder element into the list
  reflows everything below it on every `dragover`, which makes the indicator jitter.

## Verifying behaviour, not just appearance

Interaction logic is worth asserting on rather than eyeballing. Stub `vscode.postMessage` to
collect messages, dispatch real `MouseEvent`s, and check what was sent. That is how the
inline rename, local Recent hiding, menu contents per target type, and the layout cycle are
verified. Screenshots confirm looks; message assertions confirm behaviour.

## When the user reports something is broken

Reproduce it in the harness before changing code. Two reports in this repo turned out to be
correct-but-misattributed: "New group does nothing" was the webview hiding a group that had
been created properly, and the tooltip clipping was a CSS `overflow` side effect, not the
tooltip code. One report was a stale installed build - if behaviour does not match the source,
check whether `npm run install-local` has been run since the change.
