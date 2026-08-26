import { renderLandingPageHarness } from '../scripts/harness.mjs';

/** Serves the interactive landing page harness through Vercel's Node.js function runtime. */
export default async function serveLandingPageHarness(request, response) {
  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/', `https://${host}`);
  const html = await renderLandingPageHarness(url);
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  response.end(html);
}
