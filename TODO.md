# TODO

Ordered, unresolved work with a definition of done.
Delete an item when it is finished; move anything that becomes a durable rule into [DECISIONS.md](DECISIONS.md).

## Accessibility

- [ ] Replace the bookmark card's `role="button"` wrapper around nested copy and menu buttons with a valid accessibility tree.
  - Keep the card keyboard reachable and preserve geometric arrow navigation.
  - Keep copy and menu as independently named controls.
  - Add an automated accessibility check that fails against the current nested-interactive structure before accepting the fix.

## Browser verification

- [ ] Generate Linux x86_64 screenshot baselines on the GitHub Actions runner, then enable the visual Playwright tests in CI.
  - Run the browser job once with snapshot updates and download the generated artifact.
  - Commit the runner-generated baselines; do not generate them in the local arm64 Colima VM.
  - Remove the `--grep-invert @visual` exclusion and confirm a deliberate visual regression fails CI.
  - Mask genuinely volatile pixels instead of raising the zero-pixel tolerance.

- [ ] Fix the race in `e2e/flip.spec.ts` "an interrupted flight keeps its direction", which fails about one run in six.
  - The check samples `cardTops` and only then clicks to interrupt, but the page's FLIP reads each card's position at the click. Measured gap between the two instants is around 29ms, and the first wave is still moving throughout it.
  - A card whose net travel is small crosses its settled position inside that gap, so the sign of `mid - settled` stops agreeing with the sign the transform was built from. It is always the same card, always around 8px of travel against a 23px transform.
  - Record each element's position inside the patched `animate` in `recordFlights`, and compare against that, so both halves of the comparison come from one instant. Do not widen the 1px filter: that hides the race rather than removing it.
  - The product is not at fault here, so a fix must keep the check failing against the genuine inverted-direction bug it was written for.

## Behavior

- [ ] Keep the rename editor open and explain the problem when a submitted label is empty.
- [ ] Remove the drag insertion calculation's undocumented dependency on `.group` remaining every card's offset parent.
  - Prefer calculating from the actual `offsetParent`; otherwise document the matching positioning constraint beside the CSS rule.

## Workspace support

- [ ] Decide and declare `capabilities.untrustedWorkspaces` and `capabilities.virtualWorkspaces` in `package.json`.
  - Confirm bookmark health checks and repository cloning behave appropriately before enabling either capability.

## Release readiness

- [ ] Replace the placeholder `publisher: "local"` before publishing.
  - Changing the publisher re-namespaces extension storage, so decide how development bookmarks should migrate.
- [ ] Make README screenshots publicly reachable from the Marketplace, either by making the repository public or hosting the images elsewhere.
- [ ] Add a `vsce package` smoke check to CI after the publisher decision is settled.
  - Verify that the package contains the README images, license, runtime bundles, and no excluded source or scratch artifacts.
