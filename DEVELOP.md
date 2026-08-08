# Development

Use Node.js 20.19 or newer, or Node.js 22.12 or newer. Run `npm install` once after cloning.

## Build and static checks

- `npm run compile` builds the webview first and then the extension bundle.
- `npm run typecheck` checks the extension and browser test scripts without emitting files.
- `npm run lint` checks the TypeScript source.

## Test in VS Code

`npm test` is the reproducible integration run. It uses `@vscode/test-cli` and a pinned Extension Development Host under `.vscode-test/`; that cache is ignored by Git.

For interactive testing, install the workspace recommendations, run the `tasks: watch-tests` task, and use VS Code's Testing view through the Extension Test Runner. Press F5 to launch the extension itself, Ctrl/Cmd+R in the Extension Development Host to reload it, and run `Developer: Open Webview Developer Tools` to inspect the webview.

## Test the webview

Run `npm run harness`, open `http://localhost:5599`, and stop the server when finished. The `?empty`, `?theme=light`, and `?theme=hc` query strings cover the first-run and theme variants. With the harness running, `npm run motion-check` runs the browser behavior checks.

## Package

Run `npm run vsix` to build a local VSIX. The `vscode:prepublish` hook compiles both bundles before packaging. Change the placeholder `publisher` in `package.json` before attempting a Marketplace release.
