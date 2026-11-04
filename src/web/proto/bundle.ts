import * as esbuild from 'esbuild-wasm';
import type { Proto } from '../../shared/repos.ts';
import { previewBridge } from './previewBridge.ts';

// A prototype made into one HTML page the preview frame can run: no dev server, no npm install. React prototypes are
// bundled here with esbuild-wasm on the copy of React Fenmyr ships; plain HTML ones have their CSS and JS inlined.
export type Built = { kind: 'ok'; html: string } | { kind: 'error'; message: string };
type Reader = (file: string) => Promise<string>;
// a file of an installed package in prototypes/node_modules, or null when there's none by that name
type ModuleReader = (file: string) => Promise<string | null>;

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
let tailwindRuntime: Promise<string> | null = null;
const start = () => (started ??= esbuild.initialize({ wasmURL: 'dist/esbuild.wasm' }));
const runtime = () => (reactRuntime ??= fetch('dist/proto-react.js').then(r => r.text()));
const tailwind = () => (tailwindRuntime ??= fetch('dist/proto-tailwind.js').then(r => r.text()));

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

const MODULE_EXTS = ['', '.js', '.mjs', '.cjs', '.json', '/index.js', '/index.mjs'];
const CONDITIONS = ['browser', 'import', 'module', 'default'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
// the file an entry in package.json's exports points at, preferring what a browser bundle wants
const pick = (x: unknown): string | null =>
  typeof x === 'string' ? x : isObj(x) ? (CONDITIONS.map(k => pick(x[k])).find(f => f !== null) ?? null) : null;

async function firstFile(base: string, readModule: ModuleReader) {
  for (const e of MODULE_EXTS) if ((await readModule(base + e)) !== null) return base + e;
  return null;
}

// a bare import ("d3", "d3-scale/src/x") to a file in prototypes/node_modules, through its package.json
async function packageFile(spec: string, readModule: ModuleReader) {
  const parts = spec.split('/'),
    scoped = spec.startsWith('@'),
    name = parts.slice(0, scoped ? 2 : 1).join('/'),
    sub = parts.slice(scoped ? 2 : 1).join('/');
  const raw = await readModule(`${name}/package.json`);
  if (raw === null) return null;
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }
  const exp = isObj(pkg) ? pkg.exports : undefined,
    main = isObj(exp) && Object.keys(exp).some(k => k.startsWith('.')) ? exp['.'] : exp;
  const target = sub
    ? (pick(isObj(exp) ? exp[`./${sub}`] : undefined) ?? sub)
    : (pick(main) ?? (isObj(pkg) ? (pick(pkg.module) ?? pick(pkg.main)) : null) ?? 'index.js');
  return firstFile(join(`${name}/package.json`, target), readModule);
}

async function reactPage(files: string[], read: Reader, moduleFile: ModuleReader) {
  // each build reads a package file once, whatever imports it
  const seen = new Map<string, Promise<string | null>>();
  const readModule: ModuleReader = f => {
    const known = seen.get(f) ?? moduleFile(f);
    seen.set(f, known);
    return known;
  };
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
          b.onResolve({ filter: /.*/ }, async a => {
            if (REACT.has(a.path)) return { path: a.path, namespace: 'react' };
            // Tailwind runs in the frame instead, reading this CSS as its input
            if (a.path === 'tailwindcss' && a.kind === 'import-rule') return { path: a.path, namespace: 'nothing' };
            const relative = /^\.\.?\//.test(a.path);
            if (a.namespace === 'module' && relative) {
              const m = await firstFile(join(a.importer, a.path), readModule);
              if (m) return { path: m, namespace: 'module' };
            }
            const mine = relative && a.namespace !== 'module' ? found(join(a.importer, a.path)) : null;
            const f = a.kind === 'entry-point' ? found(a.path) : mine;
            if (f) return { path: f, namespace: 'proto' };
            const m = relative ? null : await packageFile(a.path, readModule);
            if (m) return { path: m, namespace: 'module' };
            const what = /^\.\.?\//.test(a.path)
              ? `There's no file ${a.path} next to ${a.importer}.`
              : `“${a.path}” isn't installed in this repo's prototypes folder. Ask Myra to install it.`;
            return { errors: [{ text: what }] };
          });
          b.onLoad({ filter: /.*/, namespace: 'module' }, async a => ({
            contents: (await readModule(a.path)) ?? '',
            loader: a.path.endsWith('.json') ? 'json' : a.path.endsWith('.css') ? 'css' : 'js',
          }));
          b.onLoad({ filter: /.*/, namespace: 'nothing' }, () => ({ contents: '', loader: 'css' }));
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
  // Tailwind's runtime turns its classes, and this CSS with any @theme in it, into styles as the page runs
  const styles =
    inline('script', await tailwind()) +
    (css ? inline('style', css).replace('<style>', '<style type="text/tailwindcss">') : '');
  return withHead(body, head() + styles);
}

export async function buildPreview(
  stack: Proto['stack'],
  files: string[],
  read: Reader,
  moduleFile: ModuleReader,
): Promise<Built> {
  if (!files.includes('index.html'))
    return { kind: 'error', message: 'This prototype has no index.html to start from.' };
  try {
    return {
      kind: 'ok',
      html: await (stack === 'react' ? reactPage(files, read, moduleFile) : plainPage(files, read)),
    };
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
