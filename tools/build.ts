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
]);
