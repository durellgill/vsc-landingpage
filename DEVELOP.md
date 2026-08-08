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
| `npm run vsix` | Builds the installable package and runs the prepublish build. | Before release or manual installation testing. |

One Windows-only shell-quoting test is expected to be skipped on macOS and Linux. Every other skipped, flaky, or failed check needs an explanation.

## Why the integration tests use VS Code

The extension host imports the `vscode` API, which exists only inside a VS Code Extension Development Host. The test CLI therefore downloads a pinned VS Code runtime into `.vscode-test/`. That is expected and gives the integration tests the same API and process boundary as the shipped extension. The browser harness does not replace this layer because it only tests the webview and a stubbed message bridge.

You do not need to install or commit a separate VS Code binary manually. `.vscode-test/` is a disposable, Git-ignored test cache. For a faster interactive loop, install the workspace recommendations, run the `tasks: watch-tests` task, and use VS Code's Testing view through the Extension Test Runner.

Press F5 to launch the extension. Press Ctrl/Cmd+R in the Extension Development Host after rebuilding. Run `Developer: Open Webview Developer Tools` to inspect the webview console and DOM.

## Browser harness

Run `npm run harness`, open `http://localhost:5599`, and stop the server when finished. Use `?empty` for the first-run state, `?theme=light` for a light editor theme, and `?theme=hc` for Dark High Contrast.

The harness renders the same HTML, CSS, and Preact bundle as the extension. It records outgoing messages on `window.__posted`. Assert messages and state for behavior; use screenshots only for appearance.

## Adding tests

- Put host and model logic in focused `*.test.ts` files beside the behavior they cover.
- Add browser interaction regressions to `scripts/motion-check.mjs` when a build, typecheck, or DOM-only assertion cannot catch the defect.
- Prefer condition-based waits over fixed delays. Use an elapsed delay only when proving that something did not happen during a safeguard window.
- Reproduce a bug first and confirm the new regression fails against the broken implementation before applying the fix.
- Keep the harness message timing and data serialization aligned with the real extension host.
- Test both the safe and destructive paths for confirmations and drag-to-delete behavior.

## Recommended future coverage

- Run typecheck, lint, compile, extension tests, and package creation in GitHub Actions on Linux, macOS, and Windows.
- Add an Extension Development Host smoke test that opens the landing page and verifies the initial host-to-webview sync.
- Add failure-path tests for rejected storage writes so acknowledgements are never sent before persistence succeeds.
- Split the growing browser behavior suite by feature when one file becomes difficult to navigate; keep a single command that runs the full suite.

## Package

Run `npm run vsix` to build a local VSIX. The `vscode:prepublish` hook compiles both bundles before packaging. Change the placeholder `publisher` in `package.json` before attempting a Marketplace release.
