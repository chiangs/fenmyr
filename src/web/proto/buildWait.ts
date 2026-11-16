import type { Board } from '../../shared/model.ts';
import { HELD } from '../myra/replyView.ts';
import { say } from '../myra/say.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { busyIn } from './buildSlot.ts';

// Undo this build, a commit and a pull change files a build may be writing, so they wait while a build runs or waits
// in the prototype's repo, which the project's other prototypes share. The host refuses them the same way.
type Verb = 'undo' | 'commit' | 'pull';

// her words when one of them waits for a build
const waitsForBuild = (verb: Verb) => say(`I’m still building. You can ${verb} once it’s done.`, 6000);

/** Her words when the host turns one of them away for a build this window doesn't know of, as after a reload. The
 *  press is given back. */
export function hostBusy(verb: Verb) {
  waitsForBuild(verb);
  return HELD;
}

/** True, once she has said so, while a build runs or waits in this prototype's repo. Nothing is changed. */
export function stillBuilding(b: Board, verb: Verb) {
  const root = rootOf(b);
  if (!root || !busyIn(root)) return false;
  waitsForBuild(verb);
  return true;
}
