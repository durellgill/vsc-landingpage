import * as vscode from 'vscode';
import { icons } from './iconography';

//@ts-ignore webpack loading syntax not recongized
import landingpageHtml from '!!raw-loader!./content/landingpage-preact.html';
//@ts-ignore webpack loading syntax not recongized
import landingpageCss from '!!raw-loader!./content/dist/landingpage2.css';

//@ts-ignore webpack loading syntax not recongized
import landingpageJs from '!!raw-loader!./content/dist/landingpage-preact.js';


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
    let s:string = landingpageHtml;

    s =
    s.replaceAll('/*%landingpage2.scss%*/',landingpageCss)
    .replaceAll('/*%landingpage-preact.js%*/',landingpageJs)
    .replaceAll('%cspSource%',cspSource)
    .replaceAll('%assetPath%',assetPath.toString());
   

    for (const [key, value] of Object.entries(icons)) //replace all ${iconname} placeholders with actual SVG source from iconography.ts
    {
      s = s.replaceAll('${'+key+'}',value);
    }

    return s;
  }
}
