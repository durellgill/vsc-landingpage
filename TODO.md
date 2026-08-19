# TODO

Ordered work with a definition of done. Delete an item when it is finished; move anything that becomes a durable rule into [DECISIONS.md](DECISIONS.md) instead of leaving it here.

## Playwright migration

Decision and rationale: [D020](DECISIONS.md). This list is the how, not the why. Read D020 first, in particular `Considered instead`, before proposing a different tool.

The order matters. Each phase leaves the repository in a working state, and no phase depends on a later one. Do not start the port in phase 5 until phases 1 through 4 have run green at least once.

### Phase 1: Install, without changing any existing check

- [ ] `npm i -D @playwright/test` and pin the version. `npx playwright install --with-deps chromium` for local runs. Chromium only; this page renders inside an Electron webview, so Firefox and WebKit prove nothing about the product.
- [ ] Add `playwright.config.ts`. Required settings, each for a stated reason:
  - `webServer` pointing at `npm run harness` on port 5599, with `reuseExistingServer: !process.env.CI`, so the suite starts and stops the harness itself and stops leaking a server on failure.
  - `use: { viewport: { width: 1440, height: 640 } }` fixed, because a baseline is meaningless at a floating size.
  - `snapshotPathTemplate` including `{platform}` and `{projectName}`, so a macOS baseline and a Linux baseline never overwrite each other.
  - `expect.toHaveScreenshot: { maxDiffPixels: 100 }` as the starting tolerance. Tighten it once the suite has run a few times; do not loosen it to make a failure go away.
- [ ] Add `npm run test:e2e` and `npm run test:e2e:update`. Leave `npm run motion-check` exactly as it is.
- [ ] Done when: `npm run test:e2e` runs and reports zero tests without error.

### Phase 2: Aria snapshots, which need no baseline discipline

- [ ] One spec covering the four states the harness already serves: default, `?empty`, `?theme=light`, `?healthy`.
- [ ] Assert with `toMatchAriaSnapshot()`. These are text, they diff in a pull request, and they are identical on every platform, so they can be generated anywhere and reviewed by eye.
- [ ] This is the enforcement D015 currently lacks. Cover at minimum: a bookmark card exposes its label and path, a missing target is announced, and no card carries an `aria-label` that would replace its accessible content name.
- [ ] Done when: reverting a card to `aria-label` makes the suite fail. Observe that failure before accepting the work, per D016.

### Phase 3: Pixel baselines, in the container only

- [ ] `toHaveScreenshot()` for the same four states. `animations: 'disabled'` and `caret: 'hide'` are already the defaults, so do not restate them; `toHaveScreenshot` also waits until two consecutive screenshots agree before comparing, which handles a page still settling.
- [ ] Generate and verify baselines **only** inside `mcr.microsoft.com/playwright:v<version>-noble`, matching the pinned dependency. A baseline generated on macOS will not match a Linux runner, because host font rasterization differs. This is the whole reason pixel diffs are quarantined here and aria snapshots are not.
- [ ] Add a `npm run test:e2e:docker` wrapper so nobody has to remember the image tag.
- [ ] Mask anything genuinely volatile with `mask:` rather than raising the tolerance.
- [ ] Done when: changing a colour token in `landingpage.scss` fails the suite, and reverting it passes.

### Phase 4: Wire into CI

- [ ] Add a job to `.github/workflows/ci.yml` running the Playwright suite in the same pinned container.
- [ ] Upload `playwright-report/` and the trace on failure with `actions/upload-artifact`, so a red run is diagnosable without reproducing it locally.
- [ ] Done when: a deliberately broken commit fails the workflow and the uploaded trace shows the failure.

### Phase 5: Port `motion-check.mjs`, last

- [ ] Port the 25 checks in `scripts/motion-check.mjs` to Playwright, one behaviour per test so a failure no longer skips everything after it.
- [ ] Port the assertions, not the plumbing. `waitUntil`, `sleep` and the JSON double-parse in `evaluate` exist only because the `agent-browser` boundary is a synchronous shell-out; Playwright's auto-waiting and in-process `evaluate` replace all three. The header comment in that file explains what each check caught in production - carry those explanations across, they are the reason the checks exist.
- [ ] Keep the checks that assert *geometry* as geometry. A pixel diff showing a red rectangle is worse than an assertion that says the focus ring escaped its clip.
- [ ] Add the check that would have caught D019: nothing that indicates state may be clipped by an ancestor. Assert the painted outline rect against the nearest ancestor with a non-visible `overflow`.
- [ ] Done when: every check in the old file has an equivalent, each was observed failing against the broken behaviour it describes, and `scripts/motion-check.mjs` is deleted in the same change. Remove the two-stack note from D020's consequences at that point.

### Not in scope

- Firefox and WebKit. The product renders in an Electron webview.
- Replacing the colocated Mocha host tests. They run inside a real extension host and Playwright cannot reach that boundary. D016's layering stands.
- Replacing `agent-browser` for interactive work. D020 keeps it deliberately.

## Unrelated, still open

- [ ] `publisher` in `package.json` is the placeholder `local`. It must become a real Marketplace publisher before `vsce publish`, and changing it re-namespaces stored bookmarks, so an installed development build and a published build will not share data.
