import { renderLandingPageDemo } from '../scripts/demo.mjs';

/** Serves the interactive landing page demo through Vercel's Node.js function runtime. */
export default async function serveLandingPageDemo(request, response) {
  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/', `https://${host}`);
  const html = await renderLandingPageDemo(url);
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  response.end(html);
}
