import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	// Tests are colocated with the code they cover (`foo.test.ts` beside `foo.ts`), so one search
	// finds a behaviour and its specification together. The glob therefore has to reach the whole
	// compiled tree, not just `out/test`.
	files: 'out/**/*.test.js',

	// Pinned, for two reasons. Reproducibility is the obvious one. The other is that this runner
	// caches a whole VS Code per version under `.vscode-test/` and never evicts any of them, so
	// tracking latest stable silently accumulates a gigabyte per release - two builds and 1.9GB
	// had piled up here before anyone looked.
	//
	// This is a deliberate trade: the tests no longer follow current stable, so bumping it is a
	// decision someone has to make rather than something that happens to them. Bump it, run the
	// suite, and delete the superseded directory in the same change.
	//
	// Do not work around a launch failure by editing anything inside `.vscode-test/`. A version
	// that will not start is a tooling problem to fix in `package.json` - the 2.x line of
	// `@vscode/test-electron` could not launch 1.110+ at all, because it looked for
	// `Contents/MacOS/Electron`, which those builds renamed to the product name.
	version: '1.132.0',
});
