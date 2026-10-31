// @ts-nocheck
import { renderCard } from '../canvas/render.ts';
import { byId } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save, showWhatMyraMade } from '../core/history.ts';
import { parse } from '../features/timer.ts';
import { DL, addMsg, typing } from '../myra/chat.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { goo } from '../myra/goos.ts';
import { say } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { onFrame } from '../wireframe/tilt.ts';
import { session } from '../core/state.ts';

// ---------- filling image spots: Higgsfield photos (price check, then your yes) or free drawn illustrations ----------
export const spotsIn = cs => {
  const ids = new Set();
  cs.forEach(c => {
    if (c.type === 'frame') onFrame(c).forEach(k => ids.add(k.id));
    else ids.add(c.id);
  });
  return session.board.cards.filter(c => ids.has(c.id) && c.type === 'box' && c.img && !c.src);
};

const aspect = c => {
  const r = c.w / c.h,
    opts = [
      ['1:1', 1],
      ['4:3', 4 / 3],
      ['3:4', 3 / 4],
      ['16:9', 16 / 9],
      ['9:16', 9 / 16],
      ['3:2', 1.5],
      ['2:3', 2 / 3],
      ['21:9', 21 / 9],
    ];
  return opts.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0];
};

const styleHint = spots => {
  const f = byId(spots[0]?.onFrame);
  return [session.board.name, f?.name].filter(Boolean).join(', ');
};

export function offerFill(spots, where = 'chat') {
  if (!spots.length) return;
  if (Fenmyr.web)
    return say(
      `There ${spots.length === 1 ? 'is 1 image spot' : `are ${spots.length} image spots`} waiting for pictures. In the desktop app I can fill them with Higgsfield or draw them for you ✦`,
      0,
      DL,
    );
  const n = spots.length,
    acts = [];
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

async function quoteFill(spots) {
  if (!chatOpen()) myraOpen(true);
  addMsg('myra', 'Checking your Higgsfield balance and the price per image…');
  typing(true);
  try {
    const q = parse(await Fenmyr.higgsQuote({ model: 'nano_banana_2' }));
    typing(false);
    const per = +q.perImage,
      bal = +q.balance,
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
    typing(false);
    say("I couldn't reach Higgsfield: " + e.message);
  }
}

async function placeImages(spots, list, key) {
  let n = 0;
  for (const it of list || []) {
    const c = spots.find(s => s.id === it.id);
    if (!c) continue;
    try {
      c.src =
        key === 'svg'
          ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(it.svg)
          : await Fenmyr.fetchImage(it.url);
      renderCard(c);
      n++;
    } catch (e) {}
  }
  save();
  return n;
}

async function makeFill(spots) {
  addMsg(
    'myra',
    `Making ${spots.length} image${spots.length > 1 ? 's' : ''} with Higgsfield… this can take a minute or two ✦`,
  );
  typing(true);
  $('myra').classList.add('thinking');
  goo.think(true);
  try {
    const r = parse(
      await Fenmyr.higgsMake({
        model: 'nano_banana_2',
        style: styleHint(spots),
        images: spots.map(c => ({ id: c.id, label: c.img, aspect: aspect(c) })),
      }),
    );
    const n = await placeImages(spots, r.images, 'url');
    typing(false);
    say(
      n
        ? `Done! ${n} image${n > 1 ? 's are' : ' is'} in place ✦`
        : "Hmm, the images didn't come back. Nothing was placed.",
    );
    if (n) showWhatMyraMade(spots.filter(c => c.src));
  } catch (e) {
    typing(false);
    say('Something went wrong making those: ' + e.message);
  } finally {
    $('myra').classList.remove('thinking');
    goo.think(false);
  }
}

async function drawFill(spots) {
  if (!chatOpen()) myraOpen(true);
  addMsg('myra', `Drawing ${spots.length} little illustration${spots.length > 1 ? 's' : ''}…`);
  typing(true);
  $('myra').classList.add('thinking');
  goo.think(true);
  try {
    const r = parse(
      await Fenmyr.drawFill({
        style: 'soft pastel, rounded, friendly, minimal',
        images: spots.map(c => ({ id: c.id, label: c.img, w: Math.round(c.w), h: Math.round(c.h) })),
      }),
    );
    const n = await placeImages(spots, r.images, 'svg');
    typing(false);
    say(n ? `Drew ${n} ✦ (want real photos later? that's Higgsfield)` : "I couldn't draw those this time.");
    if (n) showWhatMyraMade(spots.filter(c => c.src));
  } catch (e) {
    typing(false);
    say("I couldn't draw those: " + e.message);
  } finally {
    $('myra').classList.remove('thinking');
    goo.think(false);
  }
}
