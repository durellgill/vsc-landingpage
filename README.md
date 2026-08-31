# Landing Page

Landing Page is a customizable VS Code start page for bookmark groups and recently opened files, folders, and workspaces.

![The board: two user groups in list and grid layout, a missing target marked, and Recent below](doc/img/landing-page-dark.png)

[View the live demo](https://vsc-landingpage-demo.vercel.app/).

A fork of [René Bühling's Landing Page](https://github.com/renebuehling/vsc-landingpage), MIT licensed.

## About

I built this because I was creating new projects often and wanted an easier way to manage them.

I also wanted to try out certain technologies, such as:

- [Fallow](https://docs.fallow.tools) for static analysis of the code and the styles.
- [Impeccable](https://impeccable.style) for UI anti-pattern detection on the rendered page.
- [Project Wallace](https://www.projectwallace.com/) for CSS analysis.

[DEVELOP.md](DEVELOP.md) covers how the first two are wired into the scripts.

## Use it

- The page opens automatically in an empty VS Code window.
- Otherwise, run **Show Landing Page** from the Command Palette.
- Create a **Group** from the page's **New** menu.
- Use a group's **Add** button to create folder, file, or workspace bookmarks in that group.
- **Folder on disk** in the page's **New** menu creates and opens a folder without adding a bookmark.
- Click a bookmark to open it, or `Ctrl`/`Cmd`+click to open a folder or workspace in a new window.
- Use the external-link icon in the header to view the live demo.

## Organize bookmarks

- Drag a bookmark to reorder it or move it to another group.
- Drag a group by its title bar to reorder groups.
- Use a bookmark or group menu to rename it, choose an accent color, customize its icon, or change its layout.
- Drag a bookmark to the delete area and hold briefly before releasing to remove it.
- Recent is VS Code's history, so its entries can be hidden from this page but are not removed from VS Code.

## Add from the Explorer

Right-click any file or folder in the Explorer to bookmark it or open it as its own workspace, without leaving the tree.

![The Explorer context menu showing Open in New Workspace and Add to Landing Page Group](doc/img/explorer-context-menu.png)

- **Add to Landing Page Group** picks a destination group, then adds the item as a bookmark.
- **Open in New Workspace** appears on folders and opens the folder in a new window.
- **Open Parent Folder in New Workspace** appears on files and opens the folder holding the file.
- An editor tab's context menu carries **Add to Landing Page Group** and **Open Parent Folder in New Workspace**.

## Keyboard

| Key | Action |
| --- | --- |
| `↑` `↓` `←` `→` | Move between bookmarks |
| `Enter` / `Space` | Open the focused bookmark |
| `Ctrl`/`Cmd`+`Enter` | Open a folder or workspace in a new window |
| `Home` / `End` | First / last bookmark |
| `/` or `Ctrl`/`Cmd`+`F` | Focus the filter |
| `Esc` | Close a menu, clear the filter, or drop focus |

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `vsc-landingpage.autoshowOnStartup` | `true` | Show the page automatically in empty windows. |
| `vsc-landingpage.maxRecentItems` | `20` | Limit visible Recent entries; `0` removes the limit. |

## Commands

| Command | Purpose |
| --- | --- |
| Show Landing Page | Open or focus the page. |
| Landing Page: Refresh Recent | Reload VS Code's recently opened items. |
| Landing Page: Clone Repository | Clone a repository from its Git URL. |
| Add to Landing Page Group | Add an Explorer or editor item to a group. |
| Open in New Workspace | Open an Explorer folder in a new workspace. |
| Open Parent Folder in New Workspace | Open a file's parent folder in a new workspace. |

## Development

See [DEVELOP.md](DEVELOP.md) for build, test, and local-install steps.

See [DECISIONS.md](DECISIONS.md) for durable product and architecture decisions.
