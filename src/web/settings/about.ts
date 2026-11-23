import { type AppBuild, detailsText, versionLine } from '../../shared/buildStamp.ts';
import { $ } from '../core/dom.ts';

// The build this copy is, asked for once. About, the update line and Myra's snapshot all name the version from it.
let build: AppBuild | null = null;
let loading: Promise<unknown> | null = null;

export function loadBuild() {
  loading ??= Fenmyr.appBuild().then(
    b => {
      build = b;
    },
    () => {},
  );
  return loading;
}
export const currentBuild = () => build;
export const installedLine = () => (build ? versionLine(build) : '');

export function initAbout() {
  loadBuild().then(() => {
    $('aboutVersion').textContent = installedLine();
  });
  $('copyDetails').onclick = async () => {
    await loadBuild();
    if (!build) return;
    try {
      await navigator.clipboard.writeText(detailsText(build));
    } catch (_e) {
      return;
    }
    $('copyDetails').textContent = 'Copied';
    setTimeout(() => {
      $('copyDetails').textContent = 'Copy details';
    }, 1500);
  };
}
