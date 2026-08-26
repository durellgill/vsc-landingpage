# Landing Page

Landing Page is a customizable VS Code start page for bookmark groups and recently opened files, folders, and workspaces.

![The board: two user groups in list and grid layout, a missing target marked, and Recent below](doc/img/landing-page-dark.png)

[View the live demo](https://vsc-landingpage-harness.vercel.app/).

A fork of [René Bühling's Landing Page](https://github.com/renebuehling/vsc-landingpage), MIT licensed.

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
