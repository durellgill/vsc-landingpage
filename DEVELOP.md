# Development

Use Node.js 20.19 or newer, or Node.js 22.12 or newer. Run `npm install` once after cloning.

## Running it locally

Press **F5**. That builds, then opens a second VS Code window titled *[Extension Development Host]* with the extension loaded. It opens with no folder, so the landing page appears on its own. If it does not, run **Show Landing Page** from the command palette in that window.

The default *Run Extension* launch config gives that window its own extensions directory and its own profile:

- **Own extensions dir** - none of your installed extensions load. That is the difference between a slow F5 and a fast one. Built-in extensions still load, so Clone still works.
- **Own profile** - the dev host always starts as an empty window. Without this it inherits your window restore state, reopens the last folder you had, and then the landing page does *not* auto-open, because it only auto-opens when no folder is present.

The profile also means the dev host keeps its own bookmarks, separate from your real VS Code, so debugging cannot corrupt your actual data. If you ever need your real setup, because a theme or another extension is interfering, pick **Run Extension (with my installed extensions)** from the debug dropdown instead. That one reopens your last folder, so use **Show Landing Page** from the palette to see the page.

After an edit, press `Ctrl/Cmd+R` in the Extension Development Host to reload. `npm run watch` runs both Vite watchers, so you never run a build by hand; `.ts`, `.tsx`, `.scss` and `.html` are all covered. The webview bundle builds first and is then inlined into the extension bundle as text, which is why the two watchers are ordered. A stale webview build would otherwise ship an old page silently.

Errors surface in two separate places, because the page is a sandboxed webview with its own console:

- Webview (`webview/main.tsx`): in the dev host, *Developer: Open Webview Developer Tools*.
- Extension host (`extension.ts`, `communication.ts`): the **Debug Console** in your first window. Breakpoints in `.ts` files work there.
- Slow startup: *Developer: Show Running Extensions* lists activation time per extension.

## Verification matrix

| Check | Purpose | Run when |
|---|---|---|
| `npm run typecheck` | Checks extension, webview, and test-script types without emitting files. | Every code change. |
| `npm run lint` | Checks the TypeScript source for static defects. | Every code change. |
| `npm run compile` | Builds the webview first and then the extension bundle. | Every code change and before F5. |
| `npm test` | Runs the extension tests in the pinned VS Code 1.125 Extension Development Host. | Host logic, commands, storage, packaging, and before a commit. |
| `npm run harness` | Builds and serves the real webview with a stubbed host at `http://localhost:5599`. | Webview behavior and visual work. |
| `npm run test:e2e` | Drives the real page in Chromium through the harness: accessible names, geometry, focus, appearance, and every interaction regression - clicks, drags, dwell timers, and interrupted animations. | Webview behavior, layout, drag and drop, menus, focus, motion, or visual work. |
| `npm run test:e2e:docker` | Runs the same suite inside the pinned Playwright Linux image. | Reproducing a CI browser failure, or touching a Linux pixel baseline. |
| `npm run vsix` | Builds the installable package and runs the prepublish build. | Before release or manual installation testing. |

One Windows-only shell-quoting test is expected to be skipped on macOS and Linux. Every other skipped, flaky, or failed check needs an explanation.

## The three test layers, and what each one can see

The matrix above says what to run. This says why there are three of them, because each layer is blind to what the next one catches. The rule is D016: a test lives at the cheapest layer that can actually prove the thing.

- **Pure units** - `bookmark-filter.ts` only, run inside `npm test`. No DOM and no browser, so they are milliseconds. This is why that module is kept DOM-free: it is the only part of the page testable without a browser at all.
- **Extension host** - the rest of `npm test`, inside a real pinned VS Code 1.125. It has the actual `vscode` API, the filesystem, and storage. It cannot see the page: the webview is a sandbox it only exchanges messages with.
- **Playwright** - `npm run test:e2e`, real Chromium against the real page, and the only layer that can both read the page and drive it. It proves what the browser *produced* - the computed accessibility tree, rendered pixels, geometry - and what the page *does* while you use it: clicks, drags, dwell timers, and interrupted animations.

It asks two questions that used to belong to two different tools:

- Does the page look and read correctly once it settles?
- Does it behave correctly while you are using it?

A screenshot cannot catch a drag that arms too early, and a click cannot catch an accent that changed from green to blue. Both now fail the same command.

### The interaction specs are regression checks, not coverage

`e2e/flip.spec.ts`, `e2e/menus.spec.ts`, `e2e/delete-zone.spec.ts`, `e2e/affordances.spec.ts`, `e2e/fold.spec.ts` and `e2e/reduced-motion.spec.ts` came from `scripts/motion-check.mjs`, which they replaced (D020). Almost every test in them is a bug that actually shipped here, reduced to the smallest assertion that would have caught it, and each one carries that history in its own comment.

Do not delete one because its bug is fixed - that is precisely what makes it a regression check, and the spine's focus response has been lost twice already, both times to an unrelated refactor rather than to anyone repeating a mistake.

Three of them assert a negative: a scroll starts no flights, a resize flies nobody else's cards, a twin does not fly. Each is paired with its positive half in the same test, because "nothing ever animates" would otherwise pass all three. Keep that pairing when you add one, and keep the guard that proves the gesture happened at all - the group-cohesion check passed vacuously for as long as its drop silently reordered nothing.

## Why the integration tests use VS Code

The extension host imports the `vscode` API, which exists only inside a VS Code Extension Development Host. The test CLI therefore downloads a pinned VS Code runtime into `.vscode-test/`. That is expected and gives the integration tests the same API and process boundary as the shipped extension. The browser harness does not replace this layer because it only tests the webview and a stubbed message bridge.

You do not need to install or commit a separate VS Code binary manually. `.vscode-test/` is a disposable, Git-ignored test cache: roughly a 315 MB download and 1 GB on disk. It is excluded from the .vsix, so it only ever costs local disk. Delete it any time with `rm -rf .vscode-test` and the next `npm test` re-downloads it. F5 downloads nothing, because it uses your installed VS Code.

For a faster interactive loop, install the workspace recommendations, run the `tasks: watch-tests` task, and use VS Code's Testing view through the Extension Test Runner. That uses your installed VS Code; the pinned CLI run remains the reproducible check for automation and releases.

## Browser harness

F5 is not the quickest way to see a UI change. `npm run harness` builds everything and serves the *real* page at `http://localhost:5599` against a stubbed extension host, which gives you an ordinary browser console, an ordinary DOM inspector, and every message the page posts recorded on `window.__posted`.

Stop the server when finished. Query strings select a state: `?empty` for the first-run state, `?theme=light` for a light editor theme, `?theme=hc` for Dark High Contrast, and `?healthy` to suppress the missing-target markers. The harness supplies the `--vscode-*` theme variables itself, so colours are real rather than missing.

The harness renders the same HTML, CSS, and Preact bundle as the extension. It records outgoing messages on `window.__posted`. Assert messages and state for behavior; use screenshots only for appearance.

## Container runs

The container runtime on this machine is [Colima](https://github.com/abiosoft/colima), not Docker Desktop. `/opt/homebrew/bin/docker` is only the CLI client, so every container command fails with a daemon connection error until a VM is running.

- `colima start` before `npm run test:e2e:docker`, and `colima stop` when finished. Starting it is what creates the `colima` Docker context.
- The script installs dependencies inside the container, into an anonymous volume mounted over `/w/node_modules`. It cannot reuse the host tree, because that holds darwin-arm64 native binaries for Rollup and Oxc that Linux cannot load.
- `package-lock.json` must stay valid on both platforms. A lock file resolved only on macOS omits the Linux-only optional branch, and `npm ci` then refuses to install on any Linux machine, including both CI jobs. Regenerate it inside the Linux image, not on the host, and confirm `npm ci --dry-run` still passes on macOS afterwards.

Architecture matters here, and only for pixel baselines. Colima's default VM is aarch64; GitHub's `ubuntu-latest` is x86_64. Aria snapshots are text and identical on every platform, which is why they carry no `{platform}` in their path template and run everywhere from the first commit. Screenshots are not: `maxDiffPixels` is 0, so a baseline rendered on arm64 Linux is not trustworthy against an amd64 runner even inside the identical image. Generate `e2e/__screenshots__/linux/` on the runner and commit the artifact, rather than producing it here under emulation.

## Adding tests

- Put host and model logic in focused `*.test.ts` files beside the behavior they cover.
- Add browser interaction regressions to `e2e/` when a build, typecheck, or DOM-only assertion cannot catch the defect. Geometry and posted messages over screenshots: a pixel diff showing a red rectangle is worse than an assertion saying the focus ring escaped its clip.
- Prefer condition-based waits over fixed delays. Use an elapsed delay only when proving that something did not happen during a safeguard window.
- Reproduce a bug first and confirm the new regression fails against the broken implementation before applying the fix.
- Keep the harness message timing and data serialization aligned with the real extension host.
- Test both the safe and destructive paths for confirmations and drag-to-delete behavior.

## Agent tooling

Two analysis CLIs are ordinary dev dependencies, so `npm install` is all a fresh clone needs to run them:

| Command | Purpose |
|---|---|
| `npm run fallow:audit` | Dead code, complexity, duplication, and style drift in the diff against `origin/main`. Configured by `.fallowrc.json`. |
| `npm run fallow -- health --hotspots` | Any other Fallow subcommand; the script is a passthrough. |
| `npm run impeccable -- detect http://localhost:5599/` | UI anti-pattern scan of the running harness. It measures a rendered page, so pointing it at source files silently reports nothing. |

Neither is wired into `pretest`. They are advisory and their findings are noisy on this codebase, so read them, do not gate on them.

Both packages also ship agent skills, which are a separate install: `npx impeccable install`. Skills land in `.claude/skills/`, which is Git-ignored on purpose - the entries there are symlinks into `.agents/`, outside the repository, and committing them would publish broken links. Anything those skills generate (`.impeccable/`, `DESIGN.md`, `PRODUCT.md`, `scripts/design-agent.sh`) is ignored for the same reason.

## Recommended future coverage

- Run typecheck, lint, compile, extension tests, and package creation in GitHub Actions on Linux, macOS, and Windows.
- Add an Extension Development Host smoke test that opens the landing page and verifies the initial host-to-webview sync.
- Add failure-path tests for rejected storage writes so acknowledgements are never sent before persistence succeeds.
- Split the growing browser behavior suite by feature when one file becomes difficult to navigate; keep a single command that runs the full suite.

## Package

Run `npm run vsix` to build a local VSIX. The `vscode:prepublish` hook compiles both bundles before packaging.

To install a local build for daily use:

```bash
npm run vsix
code --install-extension vsc-landingpage-0.1.0.vsix
```

Bump `version` in `package.json` first, or VS Code may not register the update.

Before ever publishing, `publisher` in `package.json` is the placeholder `local`. It must become a real VS Code Marketplace publisher account or `vsce publish` will fail. The extension ID is also the key for stored bookmarks, so changing the publisher creates a new storage namespace and an installed development build will not share data with a published one.
