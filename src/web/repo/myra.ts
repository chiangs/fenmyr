import type { MyraReply } from '../../shared/myraReply.ts';
import type { Proto } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { type SayAction, say } from '../myra/say.ts';
import { setTab } from '../settings/colors.ts';
import { linkRepo } from './link.ts';
import { createPrototype, newPrototypingFolder } from './prototypes.ts';

// Linking needs the person to choose a folder, so Myra can't do it herself: she offers a button that opens the right screen.
export function repoActs(r: MyraReply): SayAction[] {
  const acts: SayAction[] = [];
  const wanted = r.openRepo?.trim().toLowerCase();
  const p = wanted ? appState.projects.find(x => x.name.trim().toLowerCase() === wanted) : undefined;
  if (p)
    acts.push({
      label: p.repo ? `Open “${p.name}”’s repo ✦` : `Link “${p.name}” to a repo ✦`,
      cls: 'next',
      run: () => linkRepo(p),
    });
  if (r.gitSetup)
    acts.push({
      label: 'Set up git and GitHub ✦',
      cls: 'next',
      run: () => {
        $('gearBtn').click();
        setTab('helpers');
      },
    });
  return acts;
}

const DEVICES: NonNullable<Proto['device']>[] = ['phone', 'tablet', 'desktop'];
const same = (a: string | undefined, b: string | undefined) =>
  !!a && a.trim().toLowerCase() === b?.trim().toLowerCase();

// Myra's "newPrototype", set once the person has said what it's for, the device and the stack: the app makes it in
// the project named (or the open board's), in the prototyping folder named (or the first, or a new one).
export async function applyNewPrototype(r: MyraReply): Promise<SayAction[]> {
  const w = r.newPrototype,
    name = w?.name?.trim();
  if (!w || !name) return [];
  const here = appState.folders.find(f => f.id === session.board?.folder);
  const p = appState.projects.find(x => same(x.name, w.project)) ?? appState.projects.find(x => x.id === here?.project);
  if (!p) {
    say('Which project is it for? I’ll make it there.', 6000);
    return [];
  }
  const root = p.repo?.path;
  if (!root) return [{ label: `Link “${p.name}” to a repo ✦`, cls: 'next', run: () => linkRepo(p) }];
  const folders = appState.folders.filter(f => f.project === p.id && f.kind === 'prototyping');
  const f = folders.find(x => same(x.name, w.folder)) ?? folders[0] ?? (await newPrototypingFolder(p));
  if (!f) return [];
  const device = DEVICES.find(d => d === w.device),
    purpose = w.purpose?.trim();
  await createPrototype(f, root, {
    name,
    stack: w.stack === 'html' ? 'html' : 'react',
    ...(purpose ? { purpose } : {}),
    ...(device ? { device } : {}),
  });
  return [];
}
