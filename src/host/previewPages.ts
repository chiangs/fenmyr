import { randomUUID } from 'node:crypto';

// A prototype's preview is served to its frame from fenmyrpreview://<token>/, an origin of its own, so the app page's
// policy doesn't reach it the way it reaches a srcdoc frame. The page sends the HTML. It is only kept and served back,
// never read. Only the newest few are kept: the pane shows one, and a render a newer one overtook is dropped.
const KEPT = 4;
// A React starter is about 0.5 MB, most of it the React and Tailwind runtimes. The bundle isn't minified, so large
// packages add megabytes. This leaves room for them and bounds what the host holds.
const MAX_CHARS = 16 * 1024 * 1024;
const pages = new Map<string, string>();

// no bypassCSP, so the page keeps its own policy, and no fetch or CORS, so nothing else can read it
export const PREVIEW_SCHEME = {
  scheme: 'fenmyrpreview',
  privileges: {
    // an origin of its own, with a host to hold the page's token
    standard: true,
    // a secure context, as a srcdoc frame inside the file:// page was, so a prototype keeps crypto.randomUUID and the
    // like
    secure: true,
  },
};

export function keepPage(html: string) {
  if (html.length > MAX_CHARS) throw new Error('The built page is over 16 MB, too big to show.');
  const token = randomUUID();
  pages.set(token, html);
  for (const old of pages.keys()) {
    if (pages.size <= KEPT) break;
    pages.delete(old);
  }
  return { url: `fenmyrpreview://${token}/` };
}

export function servePage(req: Request): Response {
  const url = new URL(req.url),
    html = url.pathname === '/' ? pages.get(url.hostname) : undefined;
  if (html === undefined) return new Response('not found', { status: 404 });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
