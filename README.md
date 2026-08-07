# Landingpage

> **My fork.** Upstream is [renebuehling/vsc-landingpage](https://github.com/renebuehling/vsc-landingpage).
> See [PROGRESS.md](PROGRESS.md) for what I changed and [AGENTS.md](AGENTS.md) for how the
> code is put together.

## Running it locally

**First time only:**

```bash
npm install
```

**To work on it - press F5.** That builds, then opens a second VS Code window titled
*[Extension Development Host]* with the extension loaded. It opens with no folder, so the
landing page appears on its own. If it doesn't, run **Show Landing Page** from the command
palette (`Cmd+Shift+P`) in that window.

The default *Run Extension* launch config gives that window its own extensions directory and
its own profile:

- **Own extensions dir** - none of your ~33 installed extensions load. That is the difference
  between a slow F5 and a fast one. Built-in extensions still load, so Clone still works.
- **Own profile** - the dev host always starts as an empty window. Without this it inherits
  your window restore state, reopens the last folder you had, and then the landing page does
  *not* auto-open, because it only auto-opens when no folder is present.

The profile also means the dev host keeps its own bookmarks, separate from your real VS Code -
so debugging can't corrupt your actual data.

If you ever need your real setup (a theme, another extension interfering), pick
**Run Extension (with my installed extensions)** from the debug dropdown instead. That one
reopens your last folder, so use **Show Landing Page** from the palette to see the page.

**After you edit something:** press `Cmd+R` in the Extension Development Host to reload.
`npm: watch` runs both Vite watchers in the background, so you never run a build by hand -
`.ts`, `.tsx`, `.scss` and `.html` are all covered by it.

The webview bundle is built first and then inlined into the extension bundle as text, so the
two watchers are ordered - a stale webview build would otherwise ship an old page silently.

**To see errors** - the page is a sandboxed webview with its own console, separate from the
extension:

- Webview (`webview/main.tsx`): in the dev host, `Cmd+Shift+P` → *Developer: Open Webview
  Developer Tools*.
- Extension (`extension.ts`, `communication.ts`): the **Debug Console** in your first
  window. Breakpoints in `.ts` files work there.
- Slow startup? `Cmd+Shift+P` → *Developer: Show Running Extensions* lists activation time
  per extension.

### The faster loop: `npm run harness`

F5 is not the quickest way to see a UI change. `npm run harness` builds everything and serves
the *real* page at `http://localhost:5599` with a stubbed extension host - an ordinary browser
console, an ordinary DOM inspector, and every message the page posts recorded on
`window.__posted`.

Append `?empty` for the empty state, `?theme=light` for the light theme, or `?healthy` to
suppress the missing-target markers. It supplies the `--vscode-*` theme variables itself, so
colours are real rather than missing.

## Installing my build for daily use

```bash
npx @vscode/vsce package
code --install-extension vsc-landingpage-0.1.0.vsix
```

Bump `version` in `package.json` first, or VS Code may not register the update.

This build's extension ID is `local.vsc-landingpage`, so it installs alongside the
marketplace copy (`renebuehling.vsc-landingpage`) without an ID clash. They do still both
register the same command IDs, so uninstall the marketplace one to avoid duplicate entries
in the palette:

```bash
code --uninstall-extension renebuehling.vsc-landingpage
```

**Before ever publishing:** `publisher` in `package.json` is the placeholder `local`. It must
be changed to a real VS Code Marketplace publisher account or `vsce publish` will fail.

Note that the extension ID is also the key for stored bookmarks, so this build starts with
an empty landing page rather than inheriting whatever the marketplace copy had saved.

Build commands:

| | |
|---|---|
| `npm run compile` | Build once - webview bundle, then extension bundle |
| `npm run watch` | Both Vite watchers, for F5 |
| `npm run harness` | Serve the real page in a browser (see above) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

The build is Vite, not webpack. See [AGENTS.md](AGENTS.md) for how the two bundles fit
together and why their order matters.

> **Heads up on `npm test`.** It runs `vscode-test`, which **downloads its own standalone
> copy of VS Code** (~315 MB download, ~1 GB on disk in `.vscode-test/`) and runs the tests
> inside it. Extension tests need a real extension host, and it uses a pinned copy rather
> than your installed VS Code so runs are reproducible and don't touch your profile.
>
> `.vscode-test/` is gitignored and excluded from the .vsix, so it is only local disk.
> Delete it any time with `rm -rf .vscode-test`; the next `npm test` re-downloads it.
>
> **F5 downloads nothing** - it uses your installed VS Code.

---

# What it does

This extension replaces the start page with a bookmark board: groups of bookmarks pointing at
folders, workspaces and files, plus a mirror of VS Code's recently-opened list.

VS Code's own *recently used* list is strictly temporal and does not reflect how you actually
work. You want the projects you are currently living in kept in sight, even during a week
spent somewhere else. So the board shows both: **Recent**, mirrored from VS Code, and your own
groups, which you name, order, colour and pin.

## Opening things

The page opens automatically in a window with no folder open (`autoshowOnStartup`, on by
default). Otherwise run **Show Landing Page** from the command palette.

| Action | Result |
|---|---|
| Click a bookmark | Opens it in the current window |
| `Ctrl`/`Cmd`+click | Opens it in a **new window** |
| `Ctrl`/`Cmd`+`Enter` | Same, from the keyboard |

New-window opening applies to folders and workspaces only. VS Code has no new-window form for
a plain file, so the option is withheld rather than offered and then ignored.

If the target is already open in another window, VS Code may focus that window instead.

Hovering a bookmark - or reaching it with the keyboard - opens a small detail card showing
the **full path**, the branch, and a warning if the target has gone. Cards truncate long
paths to stay scannable, so this is where you read the whole thing. It is display only: it
appears only when something is actually cut off, so nothing you need to click lives in it.

**Copying a path** is on the bookmark itself - a copy button appears beside the `...` button
when you hover or focus a card, and turns into a tick once the path is on the clipboard. It is
also on the bookmark menu and on `Ctrl`/`Cmd`+`C` for the focused card. Paths are shell-quoted
only when they contain something a shell would mangle.

## Driving it from the keyboard

The whole board works without a mouse.

| Key | Does |
|---|---|
| `↑` `↓` `←` `→` | Move between bookmarks |
| `Enter` / `Space` | Open the focused bookmark |
| `Ctrl`/`Cmd`+`Enter` | Open it in a new window |
| `Home` / `End` | First / last bookmark on the board |
| `/` or `Ctrl`/`Cmd`+`F` | Jump to the filter |
| `Esc` | Close a menu, then clear the filter, then drop focus |

Arrow movement is geometric rather than positional, so it behaves the same in list, grid and
compact layouts - `↓` from a card in the right column of a grid lands in the right column of
whatever is below it.

Everything reachable by dragging is reachable without one. *Move to group* on a bookmark's
menu is the keyboard route for moving a bookmark; *Move group up* and *Move group down* on a
group's menu are the route for reordering groups. Opening a menu moves focus into it and
closing it hands focus back to whatever opened it, so `Esc` always returns you to where you
were rather than to the top of the page.

Screen reader users get the path, the branch and the missing-target warning read out with each
bookmark, and a polite live region announces a copied path, a finished **Recent** refresh, and
how many bookmarks the current filter matches.

## Filtering

Type in the filter field to narrow the board. The query is matched against **labels and full
paths**, and split on spaces so every term must match somewhere:

- `documents` finds a file by the folder it lives in, not just by its name.
- `vsc land` finds `vsc-landingpage`.
- `dev api` picks one `api` out of several checkouts.

Naming a **group** shows that entire group. A filter also temporarily opens any collapsed
group containing a match, without disturbing its stored collapsed state.

## Groups

Create a group from the **New** menu in the page header.

- **Reorder** - drag a group by its title bar. **Recent** is pinned last and is neither
  draggable nor a drop target for groups.
- **Collapse** - the chevron beside the group icon folds it to its header. This is remembered
  across reloads and windows.
- **Layout** - the layout button cycles `list` → `grid` → `compact`.
- **Customise** - right-click a group, or use its settings button, for rename, accent colour
  and custom icon.

## Bookmarks

Add bookmarks two ways, and they differ by where the bookmark lands:

- The **Add** button on a group header opens a composer beneath *that* group, so the
  destination is implied by where you clicked.
- The page header's **New** menu is global, so it asks which group to use - except for
  **Folder on disk**, which opens the native dialog straight away and files the result in
  your first group.

You can also right-click any file or folder in the **Explorer** and choose *Add to Landing
Page Group* - that works even if the landing page has never been opened in the window.

**Drag a bookmark** to move it - onto another group, or to a new position inside its own. The
destination group is outlined while you drag, and a line shows exactly where the card will
land. Dragging one **out of Recent copies it**, since Recent is rebuilt from VS Code's history
and cannot be edited; and nothing can be dropped *into* Recent, so it is never outlined.

*Move to group* on the menu below does the same thing through a quick pick, which is easier
when the destination is off screen and is the only route from the keyboard.

Right-click a bookmark (or use its `...` button) for:

| Item | Notes |
|---|---|
| Open / Open in new window | New window for folders and workspaces only |
| Pin to top | Holds it at the top of its group |
| Rename | Inline, in the menu |
| Accent colour | Paints the spine and icon, not the card body |
| Custom icon | Any of the built-in glyphs |
| Move to group | Native quick pick |
| Remove | Confirms in place; the linked target is untouched |

Entries in **Recent** get a reduced version of this menu - see [Understanding *Recent*](#recent).

**Pinning sorts, it does not reorder.** Unpinning returns a bookmark to where it was, and two
pinned bookmarks keep their stored order relative to each other rather than the order you
pinned them in.

### Missing targets

A bookmark in one of *your* groups whose folder or file has been moved, renamed or deleted is
marked with a red spine and a **Missing** badge. The check runs when the page opens and
whenever **Recent** is refreshed, which includes the panel coming back into view.

In **Recent** a missing entry is simply dropped instead, and the list reaches further back
into VS Code's history to make up the number - `maxRecentItems` counts entries you can
actually see, so hiding or losing a few never shrinks the list below it. Recent mirrors what you have opened
rather than a list you curate, and the list is rebuilt from VS Code's history on every sync,
so a dead entry there is noise you have no way to remove. It is marked, never hidden or
disabled - you may well want to open it anyway, rename it, or remove it, and quietly dropping
a bookmark you made is not this page's decision.

Only local (`file:`) targets are checked. A remote or virtual path can be perfectly valid
while its filesystem provider is not currently registered.

### Git branch

Folder bookmarks that are git repositories show their checked-out branch. This is read from
`.git/HEAD` directly rather than through the built-in Git extension, so it does not depend on
that extension being enabled or on which repositories it has decided to open. Linked worktrees
and submodules work; a detached HEAD shows a short commit id.

## Cloning a repository

The **clone** button in the page header takes a Git URL. It hands off to VS Code's built-in
`git.clone`, which owns the destination picker, credentials and the *Open / Add to Workspace*
prompt. The clone then shows up in **Recent** like anything else.

<a name="recent"></a>

## Understanding *Recent*

**Recent** mirrors VS Code's own recently-opened list - the same entries as *File > Open
Recent*. It is generated, so its contents are rebuilt from VS Code on every sync and most
editing is locked.

**It can go stale**, because VS Code's history keeps changing while the page sits in a
background tab - opening a project in another window is the everyday case. Three ways to
refresh it:

- the **refresh** button on the Recent group header,
- automatically, whenever the panel comes back into view,
- the **Landing Page: Refresh Recent** command.

What you *can* do to Recent:

| | |
|---|---|
| Change its layout, accent colour and icon | Yes - view settings, independent of the data source |
| Colour or re-icon an individual entry | Yes - stored as an overlay so it survives each rebuild |
| Pin an entry | Yes |
| Rename entries, reorder them, or remove them | No |
| Copy an entry into one of your own groups | Not currently offered - see below |
| Hide an entry from this page | Yes - *Hide from Landing Page*, local only; VS Code's own history is never touched. The group menu restores everything hidden. |

To keep a Recent project around permanently, bookmark its folder into one of your own groups
(**Add** on that group's header, or right-click the folder in the Explorer). The *Move to
group* action is deliberately not offered on Recent entries.

## Theming

The page adopts your editor theme rather than bringing its own. Every colour resolves to a
`--vscode-*` theme variable, so light, dark and high-contrast all work. The only fixed colours
are the accent palette you pick bookmark shades from.

> **No screenshots here on purpose.** The GIFs in `doc/img/` are upstream's and predate this
> fork's redesign - they show a toolbar with tool modes that no longer exists. Rather than
> illustrate the extension with a UI it does not have, there are no images until they are
> retaken.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `vsc-landingpage.autoshowOnStartup` | `true` | Open the landing page automatically in empty windows. |
| `vsc-landingpage.maxRecentItems` | `20` | How many entries the **Recent** group shows. `0` means no limit. |

## Commands

| Command | Notes |
|---|---|
| Show Landing Page | Opens or focuses the page |
| Landing Page: Refresh Recent | Rereads VS Code's recently-opened list |
| Landing Page: Clone Repository | Same as the clone button |
| Add to Landing Page Group... | Explorer and editor-tab context menus |
| Reload Landing Page | Re-syncs the page from the stored model |
| Reset/Delete Landing Page Contents | Removes all groups and bookmarks. Not undoable. |

<!--

Build notes see DEVELOP.md

-->
