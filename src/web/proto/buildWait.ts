import type { Board } from '../../shared/model.ts';
import { say } from '../myra/say.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { busyIn } from './buildSlot.ts';

// Undo this build, a commit and a pull change files a build may be writing, so they wait while a build runs or waits
// in the prototype's repo, which the project's other prototypes share. The host refuses Undo the same way.
type Verb = 'undo' | 'commit' | 'pull';

/** Her words when one of them waits for a build. */
export const waitsForBuild = (verb: Verb) => say(`I’m still building. You can ${verb} once it’s done.`, 6000);

/** True, once she has said so, while a build runs or waits in this prototype's repo. Nothing is changed. */
export function stillBuilding(b: Board, verb: Verb) {
  const root = rootOf(b);
  if (!root || !busyIn(root)) return false;
  waitsForBuild(verb);
  return true;
}
