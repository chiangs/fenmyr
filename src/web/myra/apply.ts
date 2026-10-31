import { cardEl } from '../ui/dom.ts';
import type { Card } from '../../shared/model.ts';
import type { MyraReply } from '../../shared/myraReply.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderTray, renderWires, takeFromTray, tidyTies } from '../canvas/wires.ts';
import { COLL, colls, parentOf } from '../cards/collection.ts';
import { offerFill, spotsIn } from '../cards/imageFill.ts';
import { layoutAll } from '../cards/kanban.ts';
import { COLOR_NAMES, uid } from '../core/base.ts';
import { save, showWhatMyraMade } from '../core/history.ts';
import { docCard, ed, mdToHTML } from '../docs/editor.ts';
import { dueDate } from '../features/due.ts';
import { cleanTags, existingTag } from '../features/tags.ts';
import { buildTplPick, freeName, myTpls, saveAsTemplate, useTemplate } from '../features/templates.ts';
import { guessNext, noEmoji, startTimer, stopTimer, timer } from '../features/timer.ts';
import { loadLib } from '../library/nesting.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { byName, findFolder, makeFolder, makeProject, moveBoard, saveLib } from '../library/tree.ts';
import { card } from '../model/boards.ts';
import { animIntent, animName, playAnim } from './anim.ts';
import { animAskedAt, ask, timerAskedAt } from './chat.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { FS } from '../selbar/selbar.ts';
import { reply, snapTo } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { aiGrants, updateVaultChip } from '../vault/ask.ts';
import { buildScreen } from '../wireframe/pieces.ts';
import { appState, session } from '../core/state.ts';

// her actions: say, add cards, move cards, place unsorted ideas, add titles, connect cards
type NoteUsed = {
  vault: string;
  vaultId: string;
  rel: string;
  title: string;
  tags: string[];
  props: unknown;
  excerpt: string;
  text: string;
};
type Picked = { asked: boolean; used: NoteUsed[] };

export async function applyMyra(r: MyraReply, q?: string, ctx: Picked = { asked: false, used: [] }) {
  // her templates: use one of theirs, or keep what's on the board as one
  if (r.stopTimer && timer && Date.now() - timerAskedAt > 30000) stopTimer(false);
  if (r.timer && Date.now() - timerAskedAt > 30000) {
    const secs = Math.round((r.timer.minutes ?? 0) * 60 + (r.timer.seconds ?? 0));
    if (secs >= 1 && secs <= 36000)
      startTimer({ secs, purpose: String(r.timer.purpose || '').slice(0, 60) }, false, true);
  }
  if (
    r.animate &&
    Date.now() - animAskedAt > 30000 &&
    (Date.now() - appState.aiAnimAt > 600000 || animIntent(q || ''))
  ) {
    const n = animName(r.animate);
    if (n && (n !== 'party' || animIntent(q || '') === 'party')) {
      if (playAnim(n, false)) appState.aiAnimAt = Date.now();
    }
  } // her own pick: about once per ten minutes, and confetti only if asked
  if (r.useTemplate) {
    const o = r.useTemplate,
      t = myTpls.find(x => x.name.toLowerCase() === String(o.name || '').toLowerCase());
    if (t) await useTemplate(t, o.mode === 'new' || o.mode === 'add' ? o.mode : undefined);
  }
  // folders first: create, rename, and move boards around the library
  const fo = r.folders,
    pr = r.projects;
  if (fo || pr) {
    await loadLib();
    for (const n of pr?.create ?? []) makeProject(n);
    (pr?.rename ?? []).forEach(o => {
      const x = byName(appState.projects, o.from);
      if (x && o.to) x.name = String(o.to).trim();
    });
    (fo?.create ?? []).forEach(o => {
      const n = typeof o === 'string' ? o : o.name,
        f = makeFolder(n);
      if (typeof o !== 'string' && o.project) f.project = makeProject(o.project).id;
    });
    (fo?.rename ?? []).forEach(o => {
      const f = findFolder(o.from);
      if (f && o.to) f.name = String(o.to).trim();
    });
    (fo?.file ?? []).forEach(o => {
      const f = findFolder(o.folder) || makeFolder(o.folder);
      f.project = o.project ? makeProject(o.project).id : null;
    });
    for (const m of fo?.move ?? []) {
      if (!appState.boardList.some(b => b.id === m.board)) continue;
      const f = m.folder ? makeFolder(m.folder) : null;
      if (f && m.project) f.project = makeProject(m.project).id;
      await moveBoard(m.board, f ? f.id : null);
    }
    for (const x of [...appState.projects, ...appState.folders]) x.open = true;
    await saveLib();
    await refreshBoards();
  }
  const leaveCollection = (c: Card) => {
    const from = parentOf(c.id);
    if (from?.type === 'coll') from.kids = from.kids.filter((x: string) => x !== c.id);
  };
  const center = centerWorld(),
    added: Card[] = [];
  let i = 0;
  const place = (o: { x?: number | undefined; y?: number | undefined; type?: string | undefined }) => {
    if (o.x == null || o.y == null) {
      const wide = o.type === 'font';
      o.x = center.x - 300 + (i % 3) * (wide ? 330 : 250);
      o.y = center.y - 100 + Math.floor(i / 3) * (wide ? 240 : 170);
      i++;
    }
  };
  // collections Myra makes, and cards she files into them (by collection id, or by the name of one she just made)
  const made: Record<string, Card> = {};
  (r.collections || []).forEach(o => {
    place(o);
    const s2 = card('coll', {
      x: o.x,
      y: o.y,
      text: o.name || o.text || '',
      color: o.color && COLL[o.color] ? o.color : 'pink',
      kids: [],
      cols: o.cols || 1,
      r: 0,
    });
    addCard(s2);
    made[(o.name || '').toLowerCase()] = s2;
    added.push(s2);
  });
  const collFor = (k: string) =>
    byId(k)?.type === 'coll'
      ? byId(k)
      : made[k.toLowerCase()] || colls().find((s2: Card) => s2.text?.toLowerCase() === k.toLowerCase());
  const file = (c: Card, k: string) => {
    const s2 = collFor(k);
    if (s2?.type !== 'coll' || c.id === s2.id) return;
    leaveCollection(c);
    s2.kids.push(c.id);
  };
  (r.add || []).forEach(o => {
    place(o);
    const c = card(o.type && ['todo', 'title', 'swatch', 'doc', 'font'].includes(o.type) ? o.type : 'note', {
      font: o.type === 'font' ? o.font || o.text : o.font ? String(o.font) : undefined,
      body: o.type === 'doc' ? o.body || '' : undefined,
      x: o.x,
      y: o.y,
      text: o.type === 'font' ? o.sample || '' : o.text || '',
      color: o.color && COLOR_NAMES.includes(o.color) ? o.color : 'white',
      hex: o.hex,
      label: o.label,
      items: o.items ? o.items.map(t => ({ t: typeof t === 'string' ? t : t.t, done: false })) : undefined,
      tagText: o.tag,
      name: o.name,
    });
    if (c.type === 'note' && cleanTags(o.tags).length) c.tags = cleanTags(o.tags).map(existingTag);
    if (c.type === 'note' && o.due && dueDate(o.due)) c.due = o.due;
    addCard(c);
    added.push(c);
    if (o.in) file(c, o.in);
  });
  (r.titles || []).forEach(o => {
    place(o);
    added.push(addCard(card('title', { x: o.x, y: o.y, text: o.text })));
  });
  (r.place || []).forEach(o => {
    const c = session.board.tray.find(x => x.id === o.id);
    if (!c) return;
    place(o);
    takeFromTray(c, { x: o.x, y: o.y }).forEach(m => added.push(m));
  });
  (r.move || []).forEach(o => {
    const c = byId(o.id);
    if (!c || o.x == null) return;
    c.x = o.x;
    c.y = o.y ?? c.y;
    if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
    const el = cardEl(c.id);
    if (el) {
      el.style.transition = 'left .6s cubic-bezier(.2,.8,.3,1), top .6s cubic-bezier(.2,.8,.3,1)';
      renderCard(c);
      setTimeout(() => {
        el.style.transition = '';
      }, 650);
    }
    added.push(c);
  });
  (r.edit || []).forEach(o => {
    const c = byId(o.id) || session.board.tray.find(x => x.id === o.id);
    if (!c) return;
    if (o.text != null) {
      if (c.type === 'link') c.title = o.text;
      else c.text = o.text;
    }
    if (o.desc != null) c.desc = o.desc;
    if (o.body != null && c.type === 'doc') {
      c.body = o.body;
      c.doc = undefined;
      if (docCard === c && ed) ed.commands.setContent(mdToHTML(c.body), false);
    }
    if (o.items && c.type === 'todo') {
      const before = c.items;
      c.items = o.items.map((t, k) => ({
        t: typeof t === 'string' ? t : t.t,
        done: (typeof t === 'object' && t.done) || (before?.[k]?.t === t && before[k].done) || false,
      }));
    }
    if (o.color && COLOR_NAMES.includes(o.color)) c.color = o.color;
    if (o.tag !== undefined) {
      if (o.tag) c.tagText = o.tag;
      else delete c.tagText;
    }
    if (Array.isArray(o.tags) && c.type === 'note') {
      c.tags = cleanTags(o.tags).map(existingTag);
      if (!c.tags.length) delete c.tags;
    }
    if (o.due !== undefined && c.type === 'note') {
      if (o.due && dueDate(o.due)) c.due = o.due;
      else delete c.due;
    }
    if (o.hex && /^#[0-9a-f]{6}$/i.test(o.hex)) c.hex = o.hex.toLowerCase();
    if (o.label != null) c.label = o.label;
    if (o.bold !== undefined) c.bold = o.bold;
    if (o.italic !== undefined) c.italic = o.italic;
    if (o.under !== undefined) c.under = o.under;
    if (o.strike !== undefined) c.strike = o.strike;
    if (o.size && FS[o.size]) {
      if (o.size === 'm') delete c.fs;
      else c.fs = o.size;
    }
    if (o.name != null && c.type === 'note') c.name = o.name;
    if (o.in !== undefined) {
      if (o.in) file(c, o.in);
      else {
        leaveCollection(c);
      }
    }
    if (session.board.cards.includes(c)) {
      renderCard(c, true);
      added.push(c);
    } else renderTray();
  });
  if (r.remove && r.remove.length) {
    const gone = new Set(r.remove);
    session.board.cards = session.board.cards.filter(c => !gone.has(c.id));
    session.board.tray = session.board.tray.filter(c => !gone.has(c.id));
    tidyTies();
    session.board.links = session.board.links.filter(l => !gone.has(l.a) && !gone.has(l.b));
    for (const id of gone) cardEl(id)?.remove();
  }
  (r.connect || []).forEach(p => {
    const [a, b] = Array.isArray(p) ? p : [p.a, p.b];
    if (byId(a) && byId(b)) session.board.links.push({ id: uid(), a, b });
  });
  // wireframes: real screens built from the pieces, left to right, with arrows for the flow
  if (Array.isArray(r.screens) && r.screens.length) {
    let sx = session.board.cards.length ? Math.max(...session.board.cards.map(c => c.x + c.w)) + 160 : center.x - 200,
      sy = session.board.cards.length ? Math.min(...session.board.cards.map(c => c.y)) : center.y - 400,
      prev: Card | null = null;
    const builtFrames: Card[] = [];
    r.screens.forEach(sp => {
      const { f, made } = buildScreen(sp, sx, sy);
      builtFrames.push(f);
      made.forEach(c => added.push(c));
      const noFlow = typeof sp === 'object' && sp !== null && 'flow' in sp && sp.flow === false;
      if (prev && !noFlow) session.board.links.push({ id: uid(), a: prev.id, b: f.id, arrow: true });
      prev = f;
      sx += f.w + 140;
    });
  }
  if (r.screens?.length)
    setTimeout(
      () => offerFill(spotsIn(session.board.cards.filter(c => c.type === 'frame').slice(-(r.screens?.length ?? 0)))),
      1500,
    );
  // pictures (Mobbin screens, Higgsfield images): fetched and saved into the board, laid out in a row of tilted cards
  const imgs = r.images || [];
  if (imgs.length) {
    const base = {
      x: Math.max(...session.board.cards.map(c => c.x + c.w), center.x - 300) + 80,
      y: Math.min(...session.board.cards.map(c => c.y), center.y),
    };
    let k = 0;
    for (const im of imgs) {
      try {
        const data = await Fenmyr.fetchImage(im.url),
          dims = await new Promise<[number, number]>(res => {
            const t = new Image();
            t.onload = () => res([t.width, t.height]);
            t.onerror = () => res([3, 4]);
            t.src = data;
          });
        const w = 240,
          h = Math.min(520, Math.round((w * dims[1]) / dims[0])) + 16;
        const c = card('image', {
          src: data,
          w,
          h,
          x: im.x ?? base.x + (k % 4) * 270,
          y: im.y ?? base.y + Math.floor(k / 4) * 560,
          tagText: im.caption || '',
        });
        addCard(c);
        added.push(c);
        k++;
      } catch (e) {}
    }
  }
  layoutAll();
  renderTray();
  renderWires();
  save();
  if (r.saveTemplate) {
    const o = r.saveTemplate,
      ids = Array.isArray(o.ids) && o.ids.length ? o.ids : o.fromNew ? [...new Set(added.map(c => c.id))] : null;
    await saveAsTemplate(o.name, ids, { desc: o.description, mode: o.mode });
  }
  if (r.editTemplate) {
    const o = r.editTemplate,
      t = myTpls.find(x => x.name.toLowerCase() === String(o.name || '').toLowerCase());
    if (t) {
      if (o.newName) t.name = freeName(o.newName, t.id);
      if (o.description != null) t.desc = String(o.description).slice(0, 140);
      if (o.mode === 'new' || o.mode === 'add') t.mode = o.mode;
      await Fenmyr.saveTemplate(t);
      buildTplPick();
    }
  }
  if (added.length) setTimeout(() => showWhatMyraMade(added), 250);
  // notes she says she used (only ones she was actually given) land on the board as vault note cards
  const given = (r.vaultNotes || [])
    .map(x => ctx.used.find(n => n.vault === x.vault && n.rel === x.path))
    .filter((n, i, a): n is NoteUsed => !!n && a.indexOf(n) === i);
  given.forEach((n, k) => {
    const w = centerWorld(),
      c = card('vnote', {
        vault: n.vaultId,
        path: n.rel,
        title: n.title,
        tags: n.tags,
        props: n.props,
        excerpt: n.excerpt,
        color: 'lilac',
      });
    c.x = snapTo(w.x - 460 + (k % 3) * (c.w + 20));
    c.y = snapTo(w.y + 140 + Math.floor(k / 3) * (c.h + 20));
    addCard(c, true);
    added.push(c);
  });
  const read = !ctx.asked
    ? ''
    : ctx.used.length
      ? ` I read ${ctx.used.length} note${ctx.used.length === 1 ? '' : 's'} from your vault: ${ctx.used.map(n => n.title).join(', ')}.`
      : ' I looked in your vault, but found no notes matching that in the folders you allowed.';
  if (given.length) save();
  const acts: { label: string; run: () => unknown; ghost?: boolean; cls?: string }[] = r.confirm
    ? [
        { label: (r.confirm || 'Yes, make it') + ' ✦', run: () => ask(q, true) },
        { label: 'Not now', ghost: true, run: () => {} },
      ]
    : [];
  if (r.offerVault && !ctx.asked && aiGrants(session.board).length)
    acts.push({
      label: 'Search my vault ✦',
      cls: 'next',
      run: () => {
        appState.vaultChip = true;
        updateVaultChip();
        ask(q);
      },
    });
  // what next: Myra's own ideas, or a sensible guess from what she just made
  const next = acts.length
    ? []
    : (r.next?.length ? r.next : guessNext(r, added))
        .filter((t: unknown): t is string => typeof t === 'string')
        .map(noEmoji)
        .filter(Boolean)
        .slice(0, 3);
  next.forEach(t => acts.push({ label: t.trim(), cls: 'next', run: () => ask(t.trim()) }));
  reply(
    ((r.say && noEmoji(r.say)) || (added.length ? `Done! I touched ${added.length} cards.` : 'Done!')) + read,
    r.confirm ? 0 : next.length ? 16000 : 9000,
    acts,
  );
}
