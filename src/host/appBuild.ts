import path from 'node:path';
import { app } from 'electron';
import { type AppBuild, appBuildOf, readStamp } from '../shared/buildStamp.ts';
import { appVersion, installKind } from './update.ts';
import { readJSON } from './util.ts';

// FENMYR_BUILD_STAMP names another stamp file, so a test or the visual runner can show a build that never changes
const stampFile = () => process.env.FENMYR_BUILD_STAMP || path.join(app.getAppPath(), 'dist', 'build.json');

// read once as Fenmyr starts: it says which code was built, even if a branch switch later rebuilds dist/ under the app
const build: AppBuild = appBuildOf(appVersion(), readStamp(readJSON(stampFile())), {
  install: installKind(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
});

export const appBuild = () => build;
