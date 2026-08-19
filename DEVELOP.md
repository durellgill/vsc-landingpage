# Development

Use Node.js 20.19 or newer, or Node.js 22.12 or newer. Run `npm install` once after cloning.

## Verification matrix

| Check | Purpose | Run when |
|---|---|---|
| `npm run typecheck` | Checks extension, webview, and test-script types without emitting files. | Every code change. |
| `npm run lint` | Checks the TypeScript source for static defects. | Every code change. |
| `npm run compile` | Builds the webview first and then the extension bundle. | Every code change and before F5. |
| `npm test` | Runs the extension tests in the pinned VS Code 1.125 Extension Development Host. | Host logic, commands, storage, packaging, and before a commit. |
| `npm run harness` | Builds and serves the real webview with a stubbed host at `http://localhost:5599`. | Webview behavior and visual work. |
| `npm run motion-check` | Exercises browser-only interaction regressions against a running harness. | Webview behavior, layout, drag and drop, menus, focus, or motion. |
| `npm run test:e2e` | Drives the real page in Chromium through the harness and checks accessible names, geometry, focus, and appearance. | Webview behavior and visual work. |
| `npm run test:e2e:docker` | Runs the same suite inside the pinned Playwright Linux image. | Reproducing a CI browser failure, or touching a Linux pixel baseline. |
| `npm run vsix` | Builds the installable package and runs the prepublish build. | Before release or manual installation testing. |

One Windows-only shell-quoting test is expected to be skipped on macOS and Linux. Every other skipped, flaky, or failed check needs an explanation.

## Why the integration tests use VS Code

The extension host imports the `vscode` API, which exists only inside a VS Code Extension Development Host. The test CLI therefore downloads a pinned VS Code runtime into `.vscode-test/`. That is expected and gives the integration tests the same API and process boundary as the shipped extension. The browser harness does not replace this layer because it only tests the webview and a stubbed message bridge.

You do not need to install or commit a separate VS Code binary manually. `.vscode-test/` is a disposable, Git-ignored test cache. For a faster interactive loop, install the workspace recommendations, run the `tasks: watch-tests` task, and use VS Code's Testing view through the Extension Test Runner.

Press F5 to launch the extension. Press Ctrl/Cmd+R in the Extension Development Host after rebuilding. Run `Developer: Open Webview Developer Tools` to inspect the webview console and DOM.

## Browser harness

Run `npm run harness`, open `http://localhost:5599`, and stop the server when finished. Use `?empty` for the first-run state, `?theme=light` for a light editor theme, and `?theme=hc` for Dark High Contrast.

The harness renders the same HTML, CSS, and Preact bundle as the extension. It records outgoing messages on `window.__posted`. Assert messages and state for behavior; use screenshots only for appearance.

## Container runs

The container runtime on this machine is [Colima](https://github.com/abiosoft/colima), not Docker Desktop. `/opt/homebrew/bin/docker` is only the CLI client, so every container command fails with a daemon connection error until a VM is running.

- `colima start` before `npm run test:e2e:docker`, and `colima stop` when finished. Starting it is what creates the `colima` Docker context.
- The script installs dependencies inside the container, into an anonymous volume mounted over `/w/node_modules`. It cannot reuse the host tree, because that holds darwin-arm64 native binaries for Rollup and Oxc that Linux cannot load.
- `package-lock.json` must stay valid on both platforms. A lock file resolved only on macOS omits the Linux-only optional branch, and `npm ci` then refuses to install on any Linux machine, including both CI jobs. Regenerate it inside the Linux image, not on the host, and confirm `npm ci --dry-run` still passes on macOS afterwards.

Architecture matters here, and only for pixel baselines. Colima's default VM is aarch64; GitHub's `ubuntu-latest` is x86_64. Aria snapshots are text and identical on every platform, which is why they carry no `{platform}` in their path template and run everywhere from the first commit. Screenshots are not: `maxDiffPixels` is 0, so a baseline rendered on arm64 Linux is not trustworthy against an amd64 runner even inside the identical image. Generate `e2e/__screenshots__/linux/` on the runner and commit the artifact, rather than producing it here under emulation.

## Adding tests

- Put host and model logic in focused `*.test.ts` files beside the behavior they cover.
- Add browser interaction regressions to `scripts/motion-check.mjs` when a build, typecheck, or DOM-only assertion cannot catch the defect.
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

Run `npm run vsix` to build a local VSIX. The `vscode:prepublish` hook compiles both bundles before packaging. Change the placeholder `publisher` in `package.json` before attempting a Marketplace release.
