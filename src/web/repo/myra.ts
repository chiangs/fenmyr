import type { MyraReply } from '../../shared/myraReply.ts';
import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { setTab } from '../settings/colors.ts';
import type { SayAction } from '../settings/licenses.ts';
import { linkRepo } from './link.ts';

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
