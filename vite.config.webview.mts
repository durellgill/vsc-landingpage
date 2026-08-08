import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

/**
 * Builds the Preact webview.
 *
 * The output is a single self-contained IIFE because it is inlined into a `<script>` tag by
 * `LandingPageTemplate`, not loaded as a file - the webview's CSP allows the nonced inline script but
 * no module loading, and there is no origin to fetch chunks from. That is also why code
 * splitting and asset emission are switched off.
 *
 * This build must run *before* the extension build, which imports the bundle as raw text.
 */
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: resolve(import.meta.dirname, 'src/LandingPage/content/dist'),
    emptyOutDir: false,
    target: 'es2022',
    minify: 'oxc',
    lib: {
      entry: resolve(import.meta.dirname, 'src/LandingPage/webview/main.tsx'),
      formats: ['iife'],
      name: 'landingPageWebview',
      fileName: () => 'landingpage-preact.js'
    },
    sourcemap: false
  }
});
