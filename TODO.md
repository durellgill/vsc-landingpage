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
- [x] **7. Flag bookmarks whose target is gone.** A dead bookmark currently looks identical
      to a live one until you click it.
- [x] **8. Pin bookmarks to the top of their group.**
- [x] **9. Show git branch on folder bookmarks.**
- [ ] **10. Empty-state and first-run polish** once the above have settled.

## Open bugs

- [ ] **11. The hover card still leaves an empty square under the bookmark.** Reported again
      after the `:popover-open` fix, so that fix was either incomplete or not what is being
      seen.

      **Check the obvious thing first.** The harness shows this fixed - closed popover
      measures `display: none`, `0x0`, at load and after closing. If the installed extension
      still shows the square, the likely answer is a stale build: run `npm run install-local`
      and reload the window before touching any code. This repo has been caught by that
      before.

      If it survives a fresh install, it is a different element and the popover is a red
      herring. Find out what is actually drawing it before changing CSS:

      - open the webview devtools (`Cmd+Shift+P` → *Developer: Open Webview Developer Tools*)
      - hover a bookmark, move away, then inspect the square directly
      - suspects other than `.hovercard`: `#ctxmenu`, the `.pin-marker`, `.rowmenu`, and the
        group `.rule`, all of which sit near a card's lower edge

- [ ] **12. A bookmark and its Recent entry both show, so the same project appears twice.**
      Filing something into a group does not stop VS Code's history listing it, so the board
      shows the same folder in two places.

      **Where it belongs:** `populateVscMru()` in `communication.ts`, alongside the hidden and
      missing exclusions - and, like those, it must run *before* `takeExisting()` applies
      `maxRecentItems`, or de-duplicating will silently shrink Recent below the configured
      count. That is the same bug that was already fixed once for hidden entries.

      **The real work is comparing paths, not filtering.** Two paths that point at the same
      folder rarely match as strings:

      - a trailing slash on one and not the other
      - percent-encoding in one form (`%20`) and literal in the other
      - case: macOS and Windows filesystems are usually case-insensitive, Linux is not
      - `file:///Users/me/x` versus a bare `/Users/me/x`
      - symlinks, and on macOS `/tmp` versus `/private/tmp`

      Normalise through `vscode.Uri.parse(...).fsPath`, strip any trailing separator, and
      lower-case only on Windows and macOS. Resolving symlinks needs `fs.realpath` and is I/O
      per entry - decide whether that is worth it before adding it, given this runs on nearly
      every message.

      **Decide the behaviour before writing it.** Three defensible options:

      1. Hide the Recent entry entirely. Cleanest board, and the argument is that you already
         filed it. Risk: Recent stops being a faithful mirror of VS Code's history.
      2. Keep it but mark it as already bookmarked, and let its menu jump to the bookmark.
         Honest, more UI.
      3. A setting, defaulting to (1).

      Option 1 is the one to build unless it feels wrong in use. Whichever is chosen, the
      group count badge must keep agreeing with the number of cards rendered.
