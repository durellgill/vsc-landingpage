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
- [ ] **Next action:** run `npm run test:e2e:docker -- --update-snapshots`, commit `e2e/__screenshots__/linux/`, then delete `--grep-invert @visual` from the browser job in `.github/workflows/ci.yml`.
- [ ] Mask anything genuinely volatile with `mask:` rather than raising the tolerance.
- [x] Done: shifting `--shade-color` for green from `#39B457` to `#39B4FF` failed three specs at 50 differing pixels, and reverting passed three runs in a row. Observed, per D016.

### Phase 4: Wire into CI - DONE except the `@visual` grep

- [x] `browser` job added, running in `mcr.microsoft.com/playwright:v1.62.1-noble`, the same image as `test:e2e:docker`.
- [x] Report and traces uploaded on failure, 7 day retention.
- [ ] Done when a deliberately broken commit fails the workflow. **Not yet observed** - this has not run on GitHub. Verify on the first push.

### Phase 5: Port `motion-check.mjs`, last - NOT STARTED

Scoping note from reading the source. The 25 checks are not thin wrappers over Playwright
primitives; they inject instrumentation into the page - monkey-patching `Element.prototype.animate`
to capture FLIP keyframes, `requestAnimationFrame` sampling loops to measure a gap across 43
frames, synthetic `DataTransfer` drag sequences. Playwright removes the plumbing (`waitUntil`,
the process-spawning `sleep`, the JSON double-parse) but not the instrumentation, which has to
move across roughly as-is.

Do not port them piecemeal. A half-ported suite means two files covering the same behaviour, with
neither authoritative, which is worse than either alone. Port the lot in one change, or leave
`motion-check.mjs` as the incumbent.

- [ ] Port the 25 checks in `scripts/motion-check.mjs` to Playwright, one behaviour per test so a failure no longer skips everything after it.
- [ ] Port the assertions, not the plumbing. `waitUntil`, `sleep` and the JSON double-parse in `evaluate` exist only because the `agent-browser` boundary is a synchronous shell-out; Playwright's auto-waiting and in-process `evaluate` replace all three. The header comment in that file explains what each check caught in production - carry those explanations across, they are the reason the checks exist.
- [ ] Keep the checks that assert *geometry* as geometry. A pixel diff showing a red rectangle is worse than an assertion that says the focus ring escaped its clip.
- [x] `e2e/clipping.spec.ts` adds the check that would have caught D019, in both list and grid. It asserts the painted outline rect against the nearest ancestor with a non-visible `overflow`, rather than asserting `outline-offset === -2px`: the value check would pass for a future change that reintroduced the bug another way, and fail for a correct one that used a box-shadow. Observed failing by restoring `outline-offset: 1px`, which reported `escapes its clip on the left, received 3` in both layouts. This is the only phase 5 item done, and it adds coverage rather than duplicating `motion-check`.
- [ ] Done when: every check in the old file has an equivalent, each was observed failing against the broken behaviour it describes, and `scripts/motion-check.mjs` is deleted in the same change. Remove the two-stack note from D020's consequences at that point.

### Not in scope

- Firefox and WebKit. The product renders in an Electron webview.
- Replacing the colocated Mocha host tests. They run inside a real extension host and Playwright cannot reach that boundary. D016's layering stands.
- Replacing `agent-browser` for interactive work. D020 keeps it deliberately.

## Unrelated, still open

- [ ] `publisher` in `package.json` is the placeholder `local`. It must become a real Marketplace publisher before `vsce publish`, and changing it re-namespaces stored bookmarks, so an installed development build and a published build will not share data.
