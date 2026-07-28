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

1. `npm run compile` and `npm run lint`.
2. Render it with a stubbed VS Code bridge and read the browser console.

## Rendering the page outside VS Code

The fastest feedback loop is not F5. `LandingPageTemplate2.makeHTML()` is pure string
substitution, so the same page can be produced in Node and opened in a browser:

- serve `landingpage-preact.html`, the compiled CSS and `landingpage-preact.js` together
- stub `window.acquireVsCodeApi` and dispatch a `syncModel` message with a fake model
- serve over `http://` and drive it

Two traps when doing this:

- **Wait for `documentReady` before dispatching `syncModel`.** The Preact listener is
  installed in an effect, just as the extension host waits for that message before syncing.
- **Keep the icon map in sync with `iconography.ts`.** A missing key renders an empty icon,
  which looks like a layout bug, not a missing icon.

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
- **Group ownership is visible.** Add opens `.group-composer` below the destination group;
  up/down buttons issue `moveGroup` messages and the host replies with a forced rebuild. Do
  not bring back drag handling or a page-level add destination chooser.

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
