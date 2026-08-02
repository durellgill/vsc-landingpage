# Landingpage

> **My fork.** Upstream is [renebuehling/vsc-landingpage](https://github.com/renebuehling/vsc-landingpage).
> See [PROGRESS.md](PROGRESS.md) for what I changed and [AGENTS.md](AGENTS.md) for how the
> code is put together.

## Running it locally

**First time only:**

```bash
npm install
```

**To work on it — press F5.** That builds, then opens a second VS Code window titled
*[Extension Development Host]* with the extension loaded. It opens with no folder, so the
landing page appears on its own. If it doesn't, run **Show Landing Page** from the command
palette (`Cmd+Shift+P`) in that window.

The default *Run Extension* launch config gives that window its own extensions directory and
its own profile:

- **Own extensions dir** — none of your ~33 installed extensions load. That is the difference
  between a slow F5 and a fast one. Built-in extensions still load, so Clone still works.
- **Own profile** — the dev host always starts as an empty window. Without this it inherits
  your window restore state, reopens the last folder you had, and then the landing page does
  *not* auto-open, because it only auto-opens when no folder is present.

The profile also means the dev host keeps its own bookmarks, separate from your real VS Code —
so debugging can't corrupt your actual data.

If you ever need your real setup (a theme, another extension interfering), pick
**Run Extension (with my installed extensions)** from the debug dropdown instead. That one
reopens your last folder, so use **Show Landing Page** from the palette to see the page.

**After you edit something:** press `Cmd+R` in the Extension Development Host to reload.
The watch tasks rebuild in the background, so you never run a build by hand:

| Changed | Rebuilt by |
|---|---|
| `.ts` | `npm: watch` (Vite) |
| `.tsx`, `.scss` | `npm: watch` (Vite) |
| `.html`, `landingpage2.js` | `npm: watch` |

**To see errors** — the page is a sandboxed webview with its own console, separate from the
extension:

- Webview (`landingpage2.js`): in the dev host, `Cmd+Shift+P` → *Developer: Open Webview
  Developer Tools*.
- Extension (`extension.ts`, `communication.ts`): the **Debug Console** in your first
  window. Breakpoints in `.ts` files work there.
- Slow startup? `Cmd+Shift+P` → *Developer: Show Running Extensions* lists activation time
  per extension.

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

Build commands: `npm run compile` (build once), `npm run lint`.

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

Use this extension to create and organise bookmarks to folders, files and workspaces in a personal startup page. VS Code's default *recently used* list is a strict temporal list without reflecting your personal working status. But you might want to keep shortcuts to your currently active projects still in sight even when you work on other things for a while.

Landingpage extension shows both, VS code's recently used files and folders as well as custom bookmarks which can be organised in groups, renamed, ordered and colorized. 

## Features

### Startup: Default List

Landingpage is automatically opened when a VS Code window is opened without folders or workspace context. This can be enabled/disabled in extension's settings.

By default a list appears which mirrors most recently used files in Visual Studio Code. This is identical to menu items in *File > Open Recent* menu.

![Default Landingpage](doc/img/startup.png)

One item that points to a file, folder or workspace is called **bookmark** in this documentation. 

Click on a bookmark to open the linked file, folder or workspace in the current window. If a target is already already open in another VS Code window, that window may be focussed instead.

### Use custom groups to pin projects

To organize your bookmarks in a specific order or thematic collections use **groups**:

- Create a new group by clicking the plus button in toolbar. 
- Switch to move tool in toolbar.
- Drag and drop the bookmarks into your group.

![Create a group](doc/img/create-group.gif)

#### Direct import from File System

You can also add items which are not yet in the MRU list using **file or folder picker**:

- Switch to Reader Tool.
- Point to a group header.
- Click on the file or folder button to add a bookmark to a file, workspace file or directory.

![Add from file system](doc/img/add-folder.gif)

> **Group *Recent* is read-only.** Its content is populated from Visual Studio's recently used items. You cannot add any entries here. See also: [Understanding 'Recent'](#recent)


### Rearrange bookmarks per Drag and Drop

Use drag and drop in move mode to customize the order to your needs: 

- Switch to Move Tool.
- Drag bookmarks and drop on other bookmarks to move them forwards or backwards.
- Drop bookmarks to group labels to add them to the end of that group. This can also be used to move bookmarks into yet empty groups.

![Rearrange using Drag and Drop](doc/img/move-bookmark.gif)

> **Group *Recent* is read-only.** You can drag bookmarks *from* Recent *to* other groups, but not the other way around. The order of bookmarks within Recent group cannot be changed. See also: [Understanding 'Recent'](#recent)

### Filter View

Use filter input field to emphasize bookmarks by keyword matching. 

![Filter Highlight](doc/img/filter.gif)


### Customize Appearance

#### Rename Bookmarks and Groups

Labels of bookmarks and groups are initialized with the name of the linked file or folder, but they are freely customizable display texts. To rename the display text of bookmarks or groups in Landingpage:

- Select Rename tool in toolbar.
- Click on a bookmark or group name.
- Enter a new name in popup.

![Rename groups or bookmarks](doc/img/rename.gif)

> **Group *Recent* is read-only.** Labels of bookmarks or the Recent group itself are detected automatically and cannot be changed. See also: [Understanding 'Recent'](#recent)


#### Colorizing Bookmarks and Groups

Use paint tool to change the color shade of bookmarks:

- Select Paint tool in toolbar.
- Pick a color from palette popup. Click outside the popup to close it to keep currently selected color.
- Click on bookmarks to change their color.

**To remove coloring:**

- From palette popup select lined slot which represents transparency.
- Click on the bookmarks to remove their coloring.

![Colorize groups](doc/img/paint.gif)

> **Group *Recent* is read-only.** Color of bookmarks in Recent list cannot be changed. See also: [Understanding 'Recent'](#recent)


#### Switch List or Grid Layout

Bookmarks can be rendered as big cards or as small list. Cards are visually dominant and may be used for your important favorites. Lists are useful to show a group of many bookmarks in efficient way. To change the layout of a group, use the groups layout button: 

- Hover over a group name.
- Click Layout button to change the layout of bookmarks in this group.

![Change layout](doc/img/change-layout.gif)

> **Group *Recent* can be changed, too!** It **is** possible to change layout of Recent group, because this is just a view setting independent from the VS Code data source. See also: [Understanding 'Recent'](#recent)


### Remove items per Delete Tool

Groups and bookmarks can be removed from Landingpage. The original linked target stays untouched. Note that deletion is not revertable.

- Select Remove tool from toolbar. 
- Click on bookmarks or groups that you want to delete.
- Confirm popup to remove the element from Landingpage.

> **Tip:** Hold `Ctrl` while clicking to skip confirmation dialog and delete the element immediately.

![Remove items](doc/img/remove.gif)

> **Group *Recent* is read-only.** Neither bookmarks nor the group itself can be removed. See also: [Understanding 'Recent'](#recent)

<a name="recent"></a>

### Understanding *Recent* Group

"Recent" group is a collection of bookmarks that behaves similiar to user created groups, but it is populated automatically. Therefore all changes would be lost on update which is why most editing is locked here. 

"Recent" bookmarks are refreshed whenever Welcome page is reopened or when Reset-Command is called from Landingpage View's "..." menu.

### Support for Dark Theme

Landingpage works with light and dark theme:

![Dark Theme Support](doc/img/darktheme.gif)

## Extension Settings

This extension contributes the following settings:

* `vsc-landingpage.autoshowOnStartup`: Enable/disable automatic opening of Landingpage in empty windows.

<!-- ## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z. -->

<!-- 

Build notes see DEVELOP.md


-->