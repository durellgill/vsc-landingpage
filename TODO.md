# TODO

Ordered work with a definition of done. Delete an item when it is finished; move anything that becomes a durable rule into [DECISIONS.md](DECISIONS.md) instead of leaving it here.

## Playwright migration

Decision and rationale: [D020](DECISIONS.md). This list is the how, not the why. Read D020 first, in particular `Considered instead`, before proposing a different tool.

The order matters. Each phase leaves the repository in a working state, and no phase depends on a later one. Do not start the port in phase 5 until phases 1 through 4 have run green at least once.

### Phase 1: Install, without changing any existing check - DONE

- [x] `npm i -D @playwright/test` and pin the version. `npx playwright install --with-deps chromium` for local runs. Chromium only; this page renders inside an Electron webview, so Firefox and WebKit prove nothing about the product.
- [x] Add `playwright.config.ts`. Required settings, each for a stated reason:
  - `webServer` pointing at `npm run harness` on port 5599, with `reuseExistingServer: !process.env.CI`, so the suite starts and stops the harness itself and stops leaking a server on failure.
  - `use: { viewport: { width: 1440, height: 640 } }` fixed, because a baseline is meaningless at a floating size.
  - `snapshotPathTemplate` including `{platform}` and `{projectName}`, so a macOS baseline and a Linux baseline never overwrite each other.
  - `expect.toHaveScreenshot: { maxDiffPixels: 0 }`. It started at 100 and that was wrong: a deliberate shade-token change, green to blue, passed every visual spec. This board draws its accent as a 4px by 20px capsule (D017), so the whole mark is 80 pixels and the real diff measured 50 - the tolerance was larger than the thing it was meant to protect. Zero is stable across repeated runs here. Do not loosen it to make a failure go away.
- [x] Add `npm run test:e2e`, `test:e2e:update`, `test:e2e:ui`, `test:e2e:docker`, and `typecheck:e2e`. `npm run motion-check` is unchanged.
- [x] Done: 13 specs pass.

### Phase 2: Aria snapshots, which need no baseline discipline - DONE

- [x] `e2e/accessibility.spec.ts`: three aria snapshots plus five explicit D015 assertions.
- [x] Done: adding `aria-label={project.label}` to the card in `components.tsx` made `no bookmark card carries an aria-label` fail, and reverting it passed. Observed, per D016.
- Two lessons worth keeping. Assert on the browser's **computed** accessible name, not on attributes: an earlier version read only `aria-label` and `textContent` and called the row menus nameless, when they are named through `title`. And check that a generated baseline is not empty: `board-empty.aria.yml` first came out at zero bytes, because the empty state renders outside `.content`, and a zero-byte baseline is a test that can never fail.

### Phase 3: Pixel baselines, in the container only - DONE except the Linux set

- [x] `e2e/appearance.spec.ts`, tagged `@visual`, covering the default board, light theme, empty state, a focused card, and a grid group. `animations: 'disabled'` and `caret: 'hide'` are already the defaults, so do not restate them; `toHaveScreenshot` also waits until two consecutive screenshots agree before comparing, which handles a page still settling.
- [x] macOS baselines generated at `e2e/__screenshots__/darwin/`. **Linux baselines are still missing** - Docker was not available on the machine this was set up on. Generate and verify them inside `mcr.microsoft.com/playwright:v<version>-noble`, matching the pinned dependency. A baseline generated on macOS will not match a Linux runner, because host font rasterization differs. This is the whole reason pixel diffs are quarantined here and aria snapshots are not.
- [x] `npm run test:e2e:docker` wraps the pinned image.
- [ ] **Next action, and it is not local.** Colima is installed and `npm run test:e2e:docker` now runs green, but its VM is aarch64 while `ubuntu-latest` is x86_64. With `maxDiffPixels: 0` an arm64 baseline is not evidence about an amd64 runner even inside the identical image, so generating `e2e/__screenshots__/linux/` here would commit a baseline that fails the first time CI compares against it. Generate them on the runner instead: push the branch, let the browser job run with `--update-snapshots`, download the artifact, commit it, then delete `--grep-invert @visual` from `.github/workflows/ci.yml`. The remote is settled now, so this is unblocked the moment the branch is pushed.
- [ ] Mask anything genuinely volatile with `mask:` rather than raising the tolerance.
- [x] Done: shifting `--shade-color` for green from `#39B457` to `#39B4FF` failed three specs at 50 differing pixels, and reverting passed three runs in a row. Observed, per D016.

### Phase 4: Wire into CI - DONE except the `@visual` grep

- [x] `browser` job added, running in `mcr.microsoft.com/playwright:v1.62.1-noble`, the same image as `test:e2e:docker`.
- [x] Report and traces uploaded on failure, 7 day retention.
- [ ] Done when a deliberately broken commit fails the workflow. **Not yet observed** - this has not run on GitHub. Verify on the first push. Both jobs were verified locally instead, in the pinned image: `npm ci` and the non-visual suite pass there.

### Phase 5: Port `motion-check.mjs`, last - DONE

- [x] Ported all 25 assertions to `e2e/`, one behaviour per test, and deleted `scripts/motion-check.mjs` in the same change. Split by subject: `flip.spec.ts` (5), `menus.spec.ts` (3), `delete-zone.spec.ts` (2), `affordances.spec.ts` (2), `fold.spec.ts` (1), `reduced-motion.spec.ts` (2). 15 tests, and the suite went from 15 to 30.
- [x] Ported the assertions, not the plumbing. `browser()`, `evaluate()` with its double `JSON.parse`, `waitUntil()`, the process-spawning `sleep()`, `check()`, `skip()`, `setMedia()`, the media/viewport restore and the run counters are all gone - roughly 170 lines that existed only because the `agent-browser` boundary was a synchronous shell-out. The header comments explaining what each check caught in production moved across with their tests.
- [x] Kept geometry as geometry. Nothing was downgraded to a pixel diff.
- [x] `e2e/clipping.spec.ts` adds the check that would have caught D019, in both list and grid.
- [x] **Observed failing, all 14.** Each behaviour was falsified by restoring its original bug in the source and confirming the matching test went red: the FLIP sign flip, `movingParts` dropping groups, a viewport-relative baseline, the missing resize rebaseline, `unique()` collapsing twins, the dwell gate, the `dragover` wake, `--dur-arm: 0s`, the unobserved menu resize, an opacity `scrim-in`, an easing focus ring, `--spine-scale` on the painted selector, a short chevron transition, and a `card-in` carrying a transform.
- [x] Two ported checks were found to be **partly vacuous** during that pass, and were fixed rather than carried across broken. `scrim-stacking` read `getAnimations()[0]` after waiting for the page to settle, and a finished animation with no fill is not returned - so `keyframesTouchOpacity` was always false and that clause could never fail. `group-cohesion` asserted a constant header-to-card gap without ever asserting the group moved, so a drop that reordered nothing passed it. Both now assert their own premise first.
- [x] `fold-sync` asserts ordering rather than the 40ms drift threshold the old file itself flagged as its most flake-prone check. The threshold was covering a units artefact: the chevron is measured in degrees and the height in pixels, so one fixed per-frame epsilon judged them on different scales. Both are now normalised to a fraction of their own travel, and the only slack left is one animation frame.
- [x] Done when the two-stack note is off D020's consequences. Removed.

### Not in scope

- Firefox and WebKit. The product renders in an Electron webview.
- Replacing the colocated Mocha host tests. They run inside a real extension host and Playwright cannot reach that boundary. D016's layering stands.
- Replacing `agent-browser` for interactive work. D020 keeps it deliberately.

## Bugs

- [ ] **The hover card does not follow or dismiss on scroll.** Hover a bookmark so the detail card appears, then scroll. The card stays exactly where it was on screen while the bookmark it describes moves away underneath it, so it ends up floating beside an unrelated card or over empty space.
  - Not reproduced or fixed yet. Reported 2026-08-19, written up for a later agent to pick up. Reproduce it first, per the rule in AGENTS.md.
  - Likely cause, unverified: `HoverCard` is shown with the Popover API (`showPopover()` at `main.tsx:93`), which places it in the browser's **top layer**. Top-layer elements are positioned against the viewport, not the document, so they neither scroll with the page nor reposition themselves. Placement is computed once when the card opens (`main.tsx:83-107`) and nothing recomputes or closes it afterwards.
  - Decide which behaviour is wanted before coding: dismiss on scroll is the smaller change and matches how the card is described in README as display-only; reposition on scroll keeps it visible but needs the placement pass to rerun, including the flip logic that decides which side of the bookmark it sits on.
  - Watch the interaction with `scroll-not-movement` in `scripts/motion-check.mjs`, which already asserts that a render during a scroll starts no FLIP animations. A fix that rerenders on every scroll event could trip it.

## Unrelated, still open

- [x] The GitHub remote moved to `Durellg/vsc-landingpage`, created private and still empty. The old `atechaccount` repo is public and was left up, no longer a remote here. Branch `cleanup-and-test-tooling` holds the work and has never been pushed.

- [ ] `publisher` in `package.json` is the placeholder `local`. It must become a real Marketplace publisher before `vsce publish`, and changing it re-namespaces stored bookmarks, so an installed development build and a published build will not share data.

- [ ] **Open a file in another window.** VS Code has no API for this, which is why the option is withheld today rather than offered and ignored; see the comment at `communication.ts:153`. `vscode.open` takes no window argument at all, and `forceNewWindow` exists only on `vscode.openFolder`, which accepts a folder or a `.code-workspace` file and not a plain file. Verified against the current command reference, not just the old comment.
  - The only route is the CLI: `code -n <file>` opens a new window with that file. An extension would have to shell out to it.
  - This is fragile and must be treated as such. `code` is on `PATH` only if the user ran *Shell Command: Install 'code' command in PATH*, which is not the default on macOS. Probe for the binary first and hide the menu item when it is absent, rather than shipping an action that silently does nothing for some users. That is the same rule that withheld the option in the first place, so do not break it to add the feature.
  - Definition of done: the item appears on a file bookmark's menu only when the CLI resolves, opens the file in a new window when clicked, and is absent with no error when it does not resolve. Extend the `opensInWindow` unit test, which currently asserts that a plain file may not open in a new window.
