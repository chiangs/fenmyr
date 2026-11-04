import { type SayAction, say } from '../settings/licenses.ts';

// Myra asks about git in two lines: what happens in git's terms, then the same in plain words.
export const askGit = (tech: string, plain: string, acts: SayAction[]) => say(`${tech}\n\n${plain}`, 0, acts, true);
