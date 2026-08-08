import { defineConfig } from '@vscode/test-cli';

// Tests are colocated with the code they cover (`foo.test.ts` beside `foo.ts`), so one search
// finds a behaviour and its specification together. The glob therefore has to reach the whole
// compiled tree, not just `out/test`.
export default defineConfig({
	files: 'out/**/*.test.js',
});
