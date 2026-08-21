import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

/**
 * Builds the extension host bundle to `dist/extension.js`.
 *
 * `vscode` is provided by the runtime and must stay external, as must Node's builtins - this
 * runs in VS Code's extension host, not in a browser.
 *
 * The page's CSS is inlined here too: `LandingPageTemplate` imports it with `?inline`,
 * so there is no separate CSS build step.
 */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    target: 'node20',
    ssr: true,
    minify: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/extension.ts'),
      formats: ['cjs'],
      fileName: () => 'extension.js'
    },
    rollupOptions: {
      external: ['vscode', ...builtinModules, ...builtinModules.map(name => `node:${name}`)]
    },
    // One file: `package.json` points `main` at `dist/extension.js` and nothing loads chunks.
    codeSplitting: false,
    sourcemap: 'hidden'
  }
});
