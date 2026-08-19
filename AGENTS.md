# AGENTS.md

Project instructions for coding agents working on Landing Page.

## Read first

- [DEVELOP.md](DEVELOP.md) explains the build, test, browser harness, and packaging workflow.
- [DECISIONS.md](DECISIONS.md) records product and architecture decisions. Change that file when a durable decision changes. Do not turn this file into a change log.
- [README.md](README.md) describes the extension from a user's point of view.
- [TODO.md](TODO.md) holds ordered, in-flight work with a definition of done. Durable rules belong in DECISIONS.md, not there.

## Architecture

Landing Page is a VS Code extension with three parts:

1. `src/extension.ts` runs in the extension host. It may use the `vscode` API, Node APIs, and the filesystem.
2. `src/LandingPage/webview/` renders the Preact page inside a sandboxed webview. It cannot call `vscode`, require modules, or read files. `main.tsx` is the entry and owns all page state; see the webview map below.
3. `src/LandingPage/communication.ts` dispatches messages between the page and the extension host.

Put dialogs, filesystem access, clipboard access, VS Code commands, persistence, and recently opened history in the extension host. Put rendering and pointer or keyboard interaction in the webview.

## Host code map

| Module | Responsibility |
|---|---|
| `communication.ts` | Dispatch messages from the webview |
| `webview-messages.ts` | Define and send bridge messages |
| `model-storage.ts` | Persist the model and expose extension global state |
| `recent-mru-overlay.ts` | Rebuild Recent and preserve per-entry customizations |
| `bookmark-health.ts` | Check targets and read Git branches |
| `bookmark-creation.ts` | Create bookmarks and folders |
| `bookmark-moves.ts` | Move groups and bookmarks |
| `group-destination.ts` | Choose a destination group |
| `clipboard-path.ts` | Quote and copy bookmark paths |
| `clone-repository.ts` | Clone repositories |
| `uri-name-parts.ts` | Split URI labels and extensions |

Keep `communication.ts` as a dispatcher. Put new host behavior in the module that answers the relevant question.

## Webview code map

Vite bundles all of these into the single IIFE the template inlines, so the split is for reading, not loading. The import graph is acyclic and must stay that way: nothing may import `main.tsx`.

| Module | Responsibility |
|---|---|
| `main.tsx` | Entry, mount, and `App`, which owns every piece of page state |
| `components.tsx` | Leaf components; they render what `App` hands them and post intent |
| `bookmark-filter.ts` | Match and order bookmarks. Pure, and the only DOM-free code here |
| `drag-geometry.ts` | Live measurement for dragging and FLIP |
| `motion.ts` | Motion tokens, `stillness()`, and surface anchoring |
| `presentation.tsx` | Model values to icons, glyphs, and shade keys |
| `bridge.ts` | `post()` and the `acquireVsCodeApi` handle |
| `types.ts` | Types more than one module needs |

`bookmark-filter.ts` is pure on purpose. It is the only part of the page unit-testable without a browser, so keep DOM access out of it.

## Build rules

`npm run compile` runs two Vite builds in order. The webview bundle must be built before the extension bundle because `LandingPageTemplate.ts` imports the generated webview JavaScript as text.

- `src/LandingPage/content/dist/`, `dist/`, and `out/` are generated. Never edit them.
- `LandingPageTemplate.ts` imports `landingpage.scss` with `?inline`. There is no standalone CSS build or generated CSS file.
- `iconography.ts` may strip `width` and `height` only from the opening `<svg>` tag. Child geometry must remain untouched.
- Vite 8 uses `minify: 'oxc'`; esbuild is not bundled.
- `tsconfig.json` must keep `"include": ["src"]` so TypeScript does not pull Vite configuration files under `rootDir`.

## Product constraints

- Recent uses `RECENT_GROUP_GUID`. It is a source, never a destination, and remains last.
- Webview-initiated text entry stays in the webview. Explorer and editor context actions may use native VS Code input.
- Persist model changes with `await saveLandingPageModel(...)` before posting the updated model back to the page.
- Colors must resolve to VS Code theme variables except for the user-facing bookmark shade palette.
- Every interactive feature must work from the keyboard. Opening surfaces take focus and return it to their trigger.
- Use the shared motion tokens in `landingpage.scss`. Reduced motion removes movement while retaining feedback and destructive safeguards.
- The delete zone is armed by dwell. Releasing before it arms does nothing; releasing after it arms must post `remove` or `hideRecent` even if the pointer stayed still.

Read [DECISIONS.md](DECISIONS.md) before changing these constraints. Update the decision record when the product rule changes.

## Verification

Run the checks listed in [DEVELOP.md](DEVELOP.md). For a UI or interaction change, a green build is not enough. Exercise the real page through `npm run harness`, inspect the console, and assert on `window.__posted` messages.

Any regression check added for a bug must be observed failing against the broken implementation before the fix is accepted.

Stop every harness or development server you start and confirm its port is free. Close every browser automation session you create.

Container checks run on Colima, not Docker Desktop. Run `colima start` before `npm run test:e2e:docker` and `colima stop` afterwards; the `docker` CLI alone has no daemon behind it. The VM is aarch64 and CI is x86_64, so never generate Linux pixel baselines here. See [DEVELOP.md](DEVELOP.md).

## Releases

Do not push, publish, rewrite history, or change the Marketplace publisher unless the user explicitly asks. `npx vsce package` is safe for local packaging. Update `CHANGELOG.md` and the package version only as part of an approved release.
