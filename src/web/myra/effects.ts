import type { Card } from '../../shared/model.ts';
import type { MyraReply } from '../../shared/myraReply.ts';
import { offerFill, spotsIn } from '../cards/imageFill.ts';
import { appState, session } from '../core/state.ts';
import { buildTplPick, freeName, myTpls, saveAsTemplate } from '../features/templates.ts';
import { startTimer, stopTimer, timer } from '../features/timer.ts';
import { loadLib } from '../library/nesting.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { byName, findFolder, makeFolder, makeProject, moveBoard, putFolder, saveLib } from '../library/tree.ts';
import { startBuild } from '../proto/build.ts';
import { gitAction } from '../proto/gitActions.ts';
import { askInstall } from '../proto/install.ts';
import { applyNewPrototype } from '../repo/myra.ts';
import { animIntent, animName, playAnim } from './anim.ts';
import type { HeldReply } from './applyTypes.ts';
import { animAskedAt, timerAskedAt } from './chat.ts';
import type { SayAction } from './say.ts';

type Part<K extends keyof MyraReply> = NonNullable<MyraReply[K]>;
// What a reply does away from the board, in the order it runs once the board has changed.
export type Effect =
  | { kind: 'stopTimer' }
  | { kind: 'timer'; secs: number; purpose: string }
  | { kind: 'animate'; name: string; asked: boolean }
  | { kind: 'library'; projects: MyraReply['projects']; folders: MyraReply['folders'] }
  | { kind: 'saveTemplate'; spec: Part<'saveTemplate'> }
  | { kind: 'editTemplate'; spec: Part<'editTemplate'> }
  | { kind: 'offerFill'; screens: number }
  | { kind: 'newPrototype'; want: Part<'newPrototype'> }
  | { kind: 'build'; request: string }
  | { kind: 'git'; action: string; message: string | undefined }
  | { kind: 'install'; packages: string[] };

// someone who just asked for a timer or an animation in words got it already; her own pick waits
const askedLately = (at: number) => Date.now() - at <= 30000;

export function effectsOf({ reply: r, q }: HeldReply): Effect[] {
  const out: Effect[] = [];
  if (r.stopTimer) out.push({ kind: 'stopTimer' });
  const secs = Math.round((r.timer?.minutes ?? 0) * 60 + (r.timer?.seconds ?? 0));
  if (r.timer && secs >= 1 && secs <= 36000)
    out.push({ kind: 'timer', secs, purpose: String(r.timer.purpose || '').slice(0, 60) });
  // her own pick: about once per ten minutes, and confetti only if asked
  const name = animName(r.animate),
    intent = animIntent(q);
  if (name && (name !== 'party' || intent === 'party')) out.push({ kind: 'animate', name, asked: !!intent });
  if (r.folders || r.projects) out.push({ kind: 'library', projects: r.projects, folders: r.folders });
  if (r.saveTemplate) out.push({ kind: 'saveTemplate', spec: r.saveTemplate });
  if (r.editTemplate) out.push({ kind: 'editTemplate', spec: r.editTemplate });
  if (r.screens?.length) out.push({ kind: 'offerFill', screens: r.screens.length });
  if (r.newPrototype) out.push({ kind: 'newPrototype', want: r.newPrototype });
  if (r.build?.request) out.push({ kind: 'build', request: r.build.request });
  if (r.git?.action) out.push({ kind: 'git', action: r.git.action, message: r.git.message });
  if (r.install?.packages?.length) out.push({ kind: 'install', packages: r.install.packages });
  return out;
}

// Runs them in order. Returns the buttons they offer under her line. `touched`: the cards the reply made or changed.
export async function runEffects(effects: readonly Effect[], touched: readonly Card[]): Promise<SayAction[]> {
  const acts: SayAction[] = [];
  for (const e of effects)
    switch (e.kind) {
      case 'stopTimer':
        if (timer && !askedLately(timerAskedAt)) stopTimer(false);
        break;
      case 'timer':
        if (!askedLately(timerAskedAt)) startTimer({ secs: e.secs, purpose: e.purpose }, false, true);
        break;
      case 'animate':
        if (!askedLately(animAskedAt) && (Date.now() - appState.aiAnimAt > 600000 || e.asked))
          if (playAnim(e.name, false)) appState.aiAnimAt = Date.now();
        break;
      case 'library':
        await sortLibrary(e.projects, e.folders);
        break;
      case 'saveTemplate': {
        const o = e.spec,
          ids = o.ids?.length ? o.ids : o.fromNew ? touched.map(c => c.id) : null;
        await saveAsTemplate(o.name, ids, { desc: o.description, mode: o.mode });
        break;
      }
      case 'editTemplate': {
        const o = e.spec,
          t = myTpls.find(x => x.name.toLowerCase() === String(o.name || '').toLowerCase());
        if (!t) break;
        if (o.newName) t.name = freeName(o.newName, t.id);
        if (o.description != null) t.desc = String(o.description).slice(0, 140);
        if (o.mode === 'new' || o.mode === 'add') t.mode = o.mode;
        await Fenmyr.saveTemplate(t);
        buildTplPick();
        break;
      }
      case 'offerFill':
        setTimeout(
          () => offerFill(spotsIn(session.board.cards.filter(c => c.type === 'frame').slice(-e.screens))),
          1500,
        );
        break;
      case 'newPrototype':
        acts.push(...(await applyNewPrototype(e.want)));
        break;
      case 'build':
        startBuild(e.request);
        break;
      case 'git':
        gitAction(e.action, e.message);
        break;
      case 'install':
        askInstall(e.packages);
        break;
      default: {
        const unhandled: never = e;
        return unhandled;
      }
    }
  return acts;
}

// folders first: create, rename, and move boards around the library
async function sortLibrary(pr: MyraReply['projects'], fo: MyraReply['folders']) {
  await loadLib();
  for (const n of pr?.create ?? []) makeProject(n);
  for (const o of pr?.rename ?? []) {
    const x = byName(appState.projects, o.from);
    if (x && o.to) x.name = String(o.to).trim();
  }
  for (const o of fo?.create ?? []) {
    const f = makeFolder(typeof o === 'string' ? o : o.name);
    if (typeof o !== 'string' && o.project) f.project = makeProject(o.project).id;
  }
  for (const o of fo?.rename ?? []) {
    const f = findFolder(o.from);
    if (f && o.to) f.name = String(o.to).trim();
  }
  for (const o of fo?.file ?? []) {
    const f = findFolder(o.folder) || makeFolder(o.folder);
    putFolder(f.id, null, o.project ? makeProject(o.project).id : null);
  }
  for (const m of fo?.move ?? []) {
    if (!appState.boardList.some(b => b.id === m.board)) continue;
    const f = m.folder ? makeFolder(m.folder) : null;
    if (f && m.project) putFolder(f.id, null, makeProject(m.project).id);
    await moveBoard(m.board, f ? f.id : null);
  }
  for (const x of [...appState.projects, ...appState.folders]) x.open = true;
  await saveLib();
  await refreshBoards();
}
