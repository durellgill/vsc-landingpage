import type * as vscode from 'vscode';
import { icons } from './iconography';

// Vite inlines all three at build time. The SCSS is compiled by Vite itself via `?inline`;
// the Preact bundle is produced by the separate webview build, which must run first.
import landingpageHtml from './content/landingpage-preact.html?raw';
import landingpageCss from './content/landingpage2.scss?inline';
import landingpageJs from './content/dist/landingpage-preact.js?raw';

/**
 * Builds the page HTML from plain strings, with no dependency on the `vscode` module.
 *
 * Kept separate from {@link LandingPageTemplate2} so the browser harness in
 * `scripts/harness.mjs` can render exactly the page the extension host renders.
 *
 * @param assetPath Webview URI of the extension's `assets/` folder, as a string.
 * @param cspSource Origin the webview serves local resources from.
 * @returns Complete HTML document.
 */
export function renderLandingPage(assetPath:string, cspSource:string):string
{
  let s:string = landingpageHtml;

  s = s.replaceAll('/*%landingpage2.scss%*/',landingpageCss)
    .replaceAll('/*%landingpage-preact.js%*/',landingpageJs)
    .replaceAll('%cspSource%',cspSource)
    .replaceAll('%assetPath%',assetPath);

  for (const [key, value] of Object.entries(icons)) //replace all ${iconname} placeholders with actual SVG source from iconography.ts
  {
    s = s.replaceAll('${'+key+'}',value);
  }

  return s;
}

/**
 * Loads content/html and performs parsing of css/js/icon-svgs.
 */
export class LandingPageTemplate2
{
  /**
   * Generates the HTML source to be injected into the webview.
   * @param assetPath Path of extension assets converted to Webview URL, see [Loading Local Content](https://code.visualstudio.com/api/extension-guides/webview#loading-local-content)
   * @param cspSource Value of `webview.cspSource`, the origin the webview serves local
   *                  resources from. Required in the Content-Security-Policy meta tag,
   *                  otherwise the custom mouse cursors in the SCSS are blocked.
   * @returns HTML
   */
  public makeHTML(assetPath:vscode.Uri, cspSource:string):string
  {
    return renderLandingPage(assetPath.toString(), cspSource);
  }
}
