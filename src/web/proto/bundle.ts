import * as esbuild from 'esbuild-wasm';
import type { Proto } from '../../shared/repos.ts';
import { previewBridge } from './previewBridge.ts';

// A prototype made into one HTML page the preview frame can run: no dev server, no npm install. React prototypes are
// bundled here with esbuild-wasm on the copy of React Fenmyr ships; plain HTML ones have their CSS and JS inlined.
export type Built = { kind: 'ok'; html: string } | { kind: 'error'; message: string };
type Reader = (file: string) => Promise<string>;

// what the page may reach: nothing of Fenmyr's, no local files, and the open web over https
const POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; connect-src https:; media-src https: data: blob:";
const REACT = new Set(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']);
const EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.json', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
const LOADERS: Record<string, esbuild.Loader> = {
  tsx: 'tsx',
  ts: 'ts',
  jsx: 'jsx',
  js: 'js',
  css: 'css',
  json: 'json',
  svg: 'text',
};

let started: Promise<void> | null = null;
let reactRuntime: Promise<string> | null = null;
const start = () => (started ??= esbuild.initialize({ wasmURL: 'dist/esbuild.wasm' }));
const runtime = () => (reactRuntime ??= fetch('dist/proto-react.js').then(r => r.text()));

// inline text can't end the script or style it sits in
const inline = (tag: 'script' | 'style', body: string) =>
  `<${tag}>${body.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)}</${tag}>`;

const join = (from: string, rel: string) => {
  const parts = from.split('/').slice(0, -1);
  for (const p of rel.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.' && p) parts.push(p);
  }
  return parts.join('/');
};

const head = () => {
  const bridge = inline('script', `(${previewBridge.toString()})()`);
  return `<meta http-equiv="Content-Security-Policy" content="${POLICY}">${bridge}`;
};
const withHead = (html: string, extra: string) =>
  /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}${extra}`) : `${extra}${html}`;

// stylesheets the page links to, put inline so the frame needs no file access
async function inlineCss(html: string, files: string[], read: Reader) {
  let out = html;
  for (const m of html.matchAll(/<link[^>]+href="\.?\/?([^"]+\.css)"[^>]*>/gi))
    if (m[1] && files.includes(m[1])) {
      const css = inline('style', await read(m[1]));
      out = out.replace(m[0], () => css);
    }
  return out;
}

async function plainPage(files: string[], read: Reader) {
  let html = await inlineCss(await read('index.html'), files, read);
  for (const m of html.matchAll(/<script([^>]*)\ssrc="\.?\/?([^"]+\.js)"([^>]*)><\/script>/gi))
    if (m[2] && files.includes(m[2])) {
      const js = inline('script', await read(m[2]));
      html = html.replace(m[0], () => js);
    }
  return withHead(html, head());
}

async function reactPage(files: string[], read: Reader) {
  const html = await inlineCss(await read('index.html'), files, read);
  const tag = html.match(/<script[^>]*type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/i);
  if (!tag?.[1]) throw new Error('index.html has no <script type="module" src="…"> to start from.');
  await start();
  const found = (p: string) => EXTS.map(e => p + e).find(f => files.includes(f));
  const out = await esbuild.build({
    entryPoints: [tag[1]],
    bundle: true,
    write: false,
    outdir: 'out',
    format: 'iife',
    jsx: 'automatic',
    target: 'es2020',
    logLevel: 'silent',
    plugins: [
      {
        name: 'prototype',
        setup(b) {
          b.onResolve({ filter: /.*/ }, a => {
            if (REACT.has(a.path)) return { path: a.path, namespace: 'react' };
            const f =
              a.kind === 'entry-point'
                ? found(a.path)
                : /^\.\.?\//.test(a.path)
                  ? found(join(a.importer, a.path))
                  : null;
            if (f) return { path: f, namespace: 'proto' };
            const what = /^\.\.?\//.test(a.path)
              ? `There's no file ${a.path} next to ${a.importer}.`
              : `“${a.path}” isn't a package the preview has. It has React built in; other packages need a dev server, which isn't part of Fenmyr yet.`;
            return { errors: [{ text: what }] };
          });
          b.onLoad({ filter: /.*/, namespace: 'react' }, a => ({
            contents: `module.exports = globalThis.__fenmyrReact[${JSON.stringify(a.path)}];`,
            loader: 'js',
          }));
          b.onLoad({ filter: /.*/, namespace: 'proto' }, async a => ({
            contents: await read(a.path),
            loader: LOADERS[a.path.split('.').pop() ?? ''] ?? 'text',
          }));
        },
      },
    ],
  });
  const js = out.outputFiles.find(f => f.path.endsWith('.js'))?.text ?? '',
    css = out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';
  const scripts = inline('script', await runtime()) + inline('script', js);
  // a function, so the $ signs in minified code are put in as they are
  const body = html.replace(tag[0], () => scripts);
  return withHead(body, head() + (css ? inline('style', css) : ''));
}

export async function buildPreview(stack: Proto['stack'], files: string[], read: Reader): Promise<Built> {
  if (!files.includes('index.html'))
    return { kind: 'error', message: 'This prototype has no index.html to start from.' };
  try {
    return { kind: 'ok', html: await (stack === 'react' ? reactPage(files, read) : plainPage(files, read)) };
  } catch (e) {
    // esbuild's errors say the file and line
    const first: unknown = e && typeof e === 'object' && 'errors' in e && Array.isArray(e.errors) ? e.errors[0] : null;
    if (first && typeof first === 'object' && 'text' in first) {
      const at = 'location' in first && first.location && typeof first.location === 'object' ? first.location : null,
        where = at && 'file' in at && 'line' in at ? `${String(at.file)}:${String(at.line)}: ` : '';
      return { kind: 'error', message: `${where}${String(first.text)}` };
    }
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
