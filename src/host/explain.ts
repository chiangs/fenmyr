import fs from 'node:fs';
import path from 'node:path';
import { MAX_EXPLAINED } from '../shared/chat.ts';
import type { Ops } from '../shared/ops.ts';
import { PROTO_DIR } from '../shared/repos.ts';
import { claudeCode } from './claudeCode.ts';
import { topLevel } from './git.ts';
import * as prompts from './prompts.ts';
import { text, type Untrusted } from './util.ts';

/** Explain the code: Claude Code reads the prototype's folder, starting with the files a build changed, and answers in
 *  Myra's words. The run can only read, so it takes no part in the repo's build slot and runs beside a build. */
export async function explainCode(a: Untrusted<Ops['protoExplain']['args']>) {
  const root = text(a.root),
    dir = text(a.dir);
  if (!PROTO_DIR.test(dir) || !path.isAbsolute(root)) throw new Error("That isn't a prototype's folder.");
  const repo = await topLevel(root);
  if (!repo) throw new Error("This prototype's repo isn't there any more.");
  const base = path.join(repo, dir),
    files = (Array.isArray(a.files) ? a.files : []).slice(0, MAX_EXPLAINED).map(text);
  // a control character, such as a newline, would add a line of its own to her instructions
  if (files.some(f => !f || /\p{Cc}/u.test(f) || path.isAbsolute(f) || !path.resolve(base, f).startsWith(`${base}/`)))
    throw new Error("That file isn't part of this prototype.");
  if (!fs.existsSync(base)) throw new Error("This prototype's folder isn't there any more.");
  const said = await claudeCode(
    { cwd: base, prompt: prompts.explainCode({ files }), readable: [], access: 'read' },
    () => {},
  );
  const answer = said.trim().slice(0, 3000);
  if (!answer) throw new Error('Claude Code gave no explanation.');
  return answer;
}
