import { randomUUID } from 'node:crypto';
import { icons } from './iconography';

import landingpageHtml from './content/landingpage-preact.html?raw';
import landingpageCss from './content/landingpage.css?inline';
import landingpageJs from './content/dist/landingpage-preact.js?raw';

/**
 * Has no `vscode` dependency, so the harness and extension render exactly the same page.
 */
export function renderLandingPage(cspSource:string, cspNonce:string):string
{
  let s:string = landingpageHtml;

  s = s.replaceAll('/*%landingpage.css%*/',landingpageCss)
    .replaceAll('/*%landingpage-preact.js%*/',landingpageJs)
    .replaceAll('%cspSource%',cspSource)
    .replaceAll('%cspNonce%',cspNonce);

  for (const [key, value] of Object.entries(icons))
  {
    s = s.replaceAll('${'+key+'}',value);
  }

  return s;
}

export class LandingPageTemplate
{
  /**
   * The generated CSP must include `cspSource` in `img-src`.
   */
  public makeHTML(cspSource:string):string
  {
    return renderLandingPage(cspSource, randomUUID());
  }
}
