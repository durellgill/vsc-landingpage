# TODO

Working list for turning this into the start page I actually want. One commit per item.

## Build

- [x] **1. Migrate the build from webpack to Vite.** Two Vite builds - the extension host
      (CommonJS, `vscode` external) and the webview (IIFE, Preact). Sass moves into Vite via
      `?inline`, so `build:css` disappears. `raw-loader` / `svg-inline-loader` / `ts-loader`
      all go away with it.

## Recents

- [x] **2. Refresh the Recent group.** A refresh control on the Recent group header plus an
      explicit `refreshRecents` message, and an automatic resync when the panel regains
      focus so the list is not stale after opening a project in another window.

## The rest of a good start page

- [x] **3. Keyboard navigation.** Arrow keys move between bookmarks, Enter opens, Escape
      clears the filter, `/` focuses it. A start page you cannot drive from the keyboard is
      a mouse toy.
- [x] **4. Filter on paths, not just labels.** Two bookmarks called `src` are
      indistinguishable today, and typing a folder name finds nothing.
- [x] **5. Open in a new window.** The single most common thing to want from a start page
      and it is not offered anywhere.
- [x] **6. Collapsible groups, persisted.** A board with eight groups needs to fold.
- [ ] **7. Flag bookmarks whose target is gone.** A dead bookmark currently looks identical
      to a live one until you click it.
- [ ] **8. Pin bookmarks to the top of their group.**
- [ ] **9. Show git branch on folder bookmarks.**
- [ ] **10. Empty-state and first-run polish** once the above have settled.
