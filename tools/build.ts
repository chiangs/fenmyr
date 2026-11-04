import fs from 'node:fs';
import { type BuildOptions, build } from 'esbuild';

const host: BuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'warning',
};

await Promise.all([
  build({ ...host, entryPoints: ['src/host/main.ts'], outfile: 'dist/main.cjs' }),
  build({ ...host, entryPoints: ['src/host/preload.ts'], outfile: 'dist/preload.cjs' }),
  build({
    entryPoints: ['src/web/main.ts'],
    outfile: 'web/dist/app.js',
    bundle: true,
    format: 'iife',
    target: 'chrome130',
    minify: true,
    sourcemap: 'linked',
    logLevel: 'warning',
  }),
]);

// Prototype previews bundle in the page with esbuild-wasm, and every React prototype runs on this one copy of React,
// so a prototype needs no npm install to show.
fs.copyFileSync('node_modules/esbuild-wasm/esbuild.wasm', 'web/dist/esbuild.wasm');
await build({
  stdin: {
    contents: `globalThis.__fenmyrReact = {
      react: require('react'),
      'react-dom': require('react-dom'),
      'react-dom/client': require('react-dom/client'),
      'react/jsx-runtime': require('react/jsx-runtime'),
    };`,
    resolveDir: '.',
    loader: 'js',
  },
  outfile: 'web/dist/proto-react.js',
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'chrome130',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
