# Handoff

State of the fork as of 2026-08-07, after a run covering motion, accessibility, colour and
repository hygiene. Read `AGENTS.md` for the conventions and `CLAUDE.md` for the traps; this
file is only about where things stand right now and what to pick up next.

## Where things are

The tree is green: `npm run compile`, `npm run lint`, `npm run typecheck` and
`npm run motion-check` (16/16) all pass. The work is committed in eight commits on top of
upstream's `ec4447e`, none of them pushed.

Nothing is half-finished. Every item below is either done and verified, or deliberately not
started with the reason recorded.

## What changed in this run

**The jitter that was actually reported.** The board jumped by the scroll distance on any
re-render, because the FLIP effect compared viewport-relative rects across renders. Scroll
150px, then right-click a card, and every group flew 150px and settled. Positions are now
stored document-relative, and `motion-check` asserts both halves of it - a render while
scrolled starts no flights, and a real layout change still starts them.

**One genuine motion defect, found by measuring.** The space that opens under a dragged
bookmark: the cards slid into it at `--dur-hover` while the group box containing them grew at
`--dur-move`, so everything below carried on being pushed down for 62ms after the movement had
visibly stopped. 150ms against 212ms; both now settle on the same frame.

**Accessibility.** The colour palette was fifteen bare `<div>`s and was completely unreachable
without a mouse; group reordering had no keyboard route; Enter on a card's Copy button opened
the bookmark instead of copying; keyboard-opened menus were pinned to the viewport corner;
cards' `aria-label` suppressed the path, branch and `Missing` badge. All fixed and verified in
the harness.

**Colour.** The fourteen accent literals are picked to be painted as fills and several were
illegible as text - white 1.04:1 on light, black 1.02:1 on dark. `--shade-readable` mixes 30%
accent into the theme foreground wherever the accent is drawn as a glyph or a word. The palette
itself was then redesigned in OKLCH; its lightness ran .248 to .985, which at a 5px spine reads
as painted-versus-unpainted rather than as two hues.

**A delete zone.** Drag a bookmark to the right edge to remove it, or hide it if it came from
Recent. Armed by dwell rather than acting on contact.

## Open, and why

**`typeShades` versus the theme's chart colours.** `main.tsx` gives every unpainted bookmark a
type-based accent (`folder: blue`, `workspace: purple`, `file: teal`). This is documented intent
in `AGENTS.md`, so it was left alone - but it means `data-shade` is never empty on a bookmark,
and three SCSS branches written for the unpainted case can therefore never match:

- `--type-color`, the `--vscode-charts-*` fallbacks around `landingpage2.scss:1521`
- `--shade-presence: .35`, the quiet resting spine
- `--spine-rest: .6`

So the default appearance of a fresh board comes from three hardcoded Material literals rather
than from the theme. Either the defaults should come from the chart colours, or the dead
branches should go. It is a product decision about what an unpersonalised board should look
like, not a cleanup, which is why it was not made here.

**`--shade-foreground` is dead.** Declared fourteen times immediately above the palette and read
only by the retained pre-Preact `landingpage2.js`. Harmless, but it sits in the block most
likely to be edited and reads as though it is wired up. Removing it means deciding what to do
about the fallback page.

**Licensing.** There is no `LICENSE` file. Upstream is
`renebuehling/vsc-landingpage`; check what it is licensed under and what a fork is obliged to
carry before publishing. Deliberately not written by an agent.

**The two bugs already filed in `TODO.md`** (items 11 and 12) were not touched: the hover card
reported to leave an empty square behind, and a bookmark filed into a group still appearing in
Recent. Neither reproduces in the harness; check for a stale installed build first
(`npm run install-local`).

## Publishing

`origin/main` is at upstream's `ec4447e`. Everything after it is local. The history was cleaned
to the extent asked for: the two junk commits (`init`, `asdf`) were reworded, and the tree was
verified byte-identical afterwards. A `backup-before-reword` branch still points at the old
history and can be deleted once you are happy.

`.gitignore` and `.vscodeignore` now exclude the agent tooling, the scratch screenshots and
upstream's 1.4 MB of demo GIFs. The GIF exclusion matters for more than size: `vsce` enumerated
the `.claude/skills` symlinks as files and its secret scanner aborted the package with `EISDIR`.

## Working on this

`npm run harness` serves the real page at `http://localhost:5599` against a stubbed host, with
`?empty`, `?theme=light` and `?theme=hc`. It is the fast loop and the only practical way to
assert on behaviour. Two things this run re-learned the hard way, both already written down in
`CLAUDE.md` and both worth repeating:

- **Check that a selector still matches.** Changing the palette swatches from `div` to `button`
  silently orphaned `.palette div[data-shade]`, which left the entire palette as a row of blank
  rectangles. The build, the lint and the typecheck were all green. Only opening it showed it.
- **Measure before fixing.** Three plausible load-jitter theories were tested and all three were
  wrong - the health badges do not change any card's height, the layout switch is monotonic
  across 29 sampled frames, and the FLIP effect's read/cancel interleaving is not measurable at
  this board size. They are recorded in `PROGRESS.md` so they are not re-investigated.
