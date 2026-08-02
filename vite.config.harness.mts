import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

/**
 * Builds `out/harness-render.mjs` for `scripts/harness.mjs`.
 *
 * The harness needs the *assembled* page - HTML shell, compiled SCSS, Preact bundle and
 * inlined icon SVGs - and only the Vite pipeline can produce that. So the pure renderer is
 * bundled once here as ESM that plain Node can import. `vscode` is not referenced (the
 * renderer imports it as a type only) but stays external as a safety net: if someone adds a
 * runtime `vscode` import, the harness fails loudly instead of bundling the extension host.
 */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'out'),
    emptyOutDir: false,
    target: 'node20',
    ssr: true,
    minify: false,
    lib: {
      entry: {'harness-render': resolve(import.meta.dirname, 'src/LandingPage/LandingPageTemplate2.ts')},
      formats: ['es']
    },
    rollupOptions: {
      external: ['vscode', ...builtinModules, ...builtinModules.map(name => `node:${name}`)]
    },
    codeSplitting: false,
    sourcemap: false
  }
});
