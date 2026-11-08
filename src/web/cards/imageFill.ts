import { type Card, type CardOf, isRecord } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { byId } from '../canvas/wires.ts';
import { save, showWhatMyraMade } from '../core/history.ts';
import { session } from '../core/state.ts';
import { DL } from '../myra/chat.ts';
import { addMsg } from '../myra/chatLog.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { parse } from '../myra/replyText.ts';
import type { SayAction } from '../myra/say.ts';
import { say } from '../myra/say.ts';
import { startJob } from '../myra/status.ts';
import { settings } from '../settings/settings.ts';
import { onFrame } from '../wireframe/tilt.ts';

type Spot = CardOf<'box'>;
type Made = { id: string; url: string; svg: string };
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const textOf = (v: unknown) => (typeof v === 'string' ? v : '');
// what Higgsfield or the drawing step sent back, one picture per spot
const readMade = (list: unknown): Made[] =>
  (Array.isArray(list) ? list : [])
    .filter(isRecord)
    .map(it => ({ id: textOf(it.id), url: textOf(it.url), svg: textOf(it.svg) }));

// ---------- filling image spots: Higgsfield photos (price check, then your yes) or free drawn illustrations ----------
export const spotsIn = (cs: Card[]) => {
  const ids = new Set<string>();
  cs.forEach(c => {
    if (c.type === 'frame')
      onFrame(c).forEach(k => {
        ids.add(k.id);
      });
    else ids.add(c.id);
  });
  return session.board.cards.filter((c): c is Spot => ids.has(c.id) && c.type === 'box' && !!c.img && !c.src);
};

const aspect = (c: Card) => {
  const r = c.w / c.h,
    opts: [string, number][] = [
      ['1:1', 1],
      ['4:3', 4 / 3],
      ['3:4', 3 / 4],
      ['16:9', 16 / 9],
      ['9:16', 9 / 16],
      ['3:2', 1.5],
      ['2:3', 2 / 3],
      ['21:9', 21 / 9],
    ];
  return opts.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0]?.[0] ?? '1:1';
};

const styleHint = (spots: Spot[]) => {
  const f = byId(spots[0]?.onFrame ?? '');
  return [session.board.name, f?.name].filter(Boolean).join(', ');
};

export function offerFill(spots: Spot[]) {
  if (!spots.length) return;
  if (Fenmyr.web) {
    say(
      `There ${spots.length === 1 ? 'is 1 image spot' : `are ${spots.length} image spots`} waiting for pictures. In the desktop app I can fill them with Higgsfield or draw them for you ✦`,
      0,
      DL,
    );
    return;
  }
  const n = spots.length,
    acts: SayAction[] = [];
  if (settings.ai && settings.higgs) acts.push({ label: `Fill ${n} with Higgsfield ✦`, run: () => quoteFill(spots) });
  if (settings.ai)
    acts.push({
      label: 'Draw simple illustrations (free)',
      ghost: !!(settings.ai && settings.higgs),
      run: () => drawFill(spots),
    });
  if (!acts.length) return;
  say(
    `There ${n === 1 ? 'is 1 image spot' : `are ${n} image spots`} waiting for pictures. ${settings.higgs ? 'Higgsfield makes real photos (that uses credits, and I check the price with you first), or I can draw simple illustrations for free.' : 'I can draw simple illustrations for them, free.'}`,
    0,
    [...acts, { label: 'Leave them empty', ghost: true, run: () => {} }],
  );
}

async function quoteFill(spots: Spot[]) {
  if (!chatOpen()) myraOpen(true);
  addMsg('myra', 'Checking your Higgsfield balance and the price per image…');
  const job = startJob({ kind: 'thinking' });
  try {
    const q = parse(await Fenmyr.higgsQuote({ model: 'nano_banana_2' }));
    job.end();
    const per = Number(q.perImage),
      bal = Number(q.balance),
      total = Number.isFinite(per) ? Math.ceil(per * spots.length) : null;
    const line =
      total != null
        ? `That's ${spots.length} image${spots.length > 1 ? 's' : ''} × about ${per} credits ≈ ${total} credits.`
        : `I couldn't find the exact price, so check Higgsfield before saying yes.`;
    const balLine = Number.isFinite(bal) ? ` You have ${bal} credits.` : '',
      short = Number.isFinite(bal) && total != null && total > bal;
    say(
      line +
        balLine +
        (short
          ? " That's more than you have right now, so I'd fill fewer spots or top up first."
          : ' Want me to make them?'),
      0,
      short
        ? [
            { label: 'Draw illustrations instead (free)', run: () => drawFill(spots) },
            { label: 'Not now', ghost: true, run: () => {} },
          ]
        : [
            { label: `Yes, make ${spots.length} ✦`, run: () => makeFill(spots) },
            { label: 'Not now', ghost: true, run: () => {} },
          ],
    );
  } catch (e) {
    job.end();
    say(`I couldn't reach Higgsfield: ${messageOf(e)}`);
  }
}

async function placeImages(spots: Spot[], list: unknown, key: 'svg' | 'url') {
  let n = 0;
  for (const it of readMade(list)) {
    const c = spots.find(s => s.id === it.id);
    if (!c) continue;
    try {
      c.src =
        key === 'svg'
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(it.svg)}`
          : await Fenmyr.fetchImage(it.url);
      renderCard(c);
      n++;
    } catch (_e) {}
  }
  save();
  return n;
}

async function makeFill(spots: Spot[]) {
  addMsg(
    'myra',
    `Making ${spots.length} image${spots.length > 1 ? 's' : ''} with Higgsfield… this can take a minute or two ✦`,
  );
  const job = startJob({ kind: 'pictures', n: spots.length });
  try {
    const r = parse(
      await Fenmyr.higgsMake({
        model: 'nano_banana_2',
        style: styleHint(spots),
        images: spots.map(c => ({ id: c.id, label: c.img ?? '', aspect: aspect(c) })),
      }),
    );
    const n = await placeImages(spots, r.images, 'url');
    job.end();
    say(
      n
        ? `Done! ${n} image${n > 1 ? 's are' : ' is'} in place ✦`
        : "Hmm, the images didn't come back. Nothing was placed.",
    );
    if (n) showWhatMyraMade(spots.filter(c => c.src));
  } catch (e) {
    job.end();
    say(`Something went wrong making those: ${messageOf(e)}`);
  }
}

async function drawFill(spots: Spot[]) {
  if (!chatOpen()) myraOpen(true);
  addMsg('myra', `Drawing ${spots.length} little illustration${spots.length > 1 ? 's' : ''}…`);
  const job = startJob({ kind: 'pictures', n: spots.length });
  try {
    const r = parse(
      await Fenmyr.drawFill({
        style: 'soft pastel, rounded, friendly, minimal',
        images: spots.map(c => ({ id: c.id, label: c.img ?? '', w: Math.round(c.w), h: Math.round(c.h) })),
      }),
    );
    const n = await placeImages(spots, r.images, 'svg');
    job.end();
    say(n ? `Drew ${n} ✦ (want real photos later? that's Higgsfield)` : "I couldn't draw those this time.");
    if (n) showWhatMyraMade(spots.filter(c => c.src));
  } catch (e) {
    job.end();
    say(`I couldn't draw those: ${messageOf(e)}`);
  }
}
