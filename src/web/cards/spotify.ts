// @ts-nocheck
import { cardEl } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
import { renderTray, renderWires, selectOnly } from '../canvas/wires.ts';
import { uid } from '../core/base.ts';
import { save } from '../core/history.ts';
import { endEdit } from '../features/tags.ts';
import { addVideo } from '../media/video.ts';
import { card } from '../model/boards.ts';
import { removeSelected } from '../myra/helpers.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { say } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { addCard } from '../tools/penEdit.ts';
import { revealCards } from '../wireframe/pieces.ts';
import { session } from '../core/state.ts';

// ---------- Spotify: a song, album, playlist, podcast or artist link becomes Spotify's own player on the board ----------
const SP_KINDS = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];

export function spotifyOf(u) {
  const m =
    String(u || '')
      .trim()
      .match(
        /^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/i,
      ) ||
    String(u || '')
      .trim()
      .match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/i);
  return m && SP_KINDS.includes(m[1].toLowerCase()) ? { kind: m[1].toLowerCase(), sid: m[2] } : null;
}

const SP_HEAD = 28;
const spH = kind => (['track', 'episode'].includes(kind) ? 152 : 352) + SP_HEAD + 6;
// Spotify's player only shows its full layout at exactly 152 / 352 tall
export const spEmbed = c => `https://open.spotify.com/embed/${c.kind}/${c.sid}?utm_source=fenmyr`;

export async function spotifyFill(c, url) {
  const s2 = spotifyOf(url);
  if (!s2) return false;
  Object.assign(c, {
    type: 'spotify',
    url: `https://open.spotify.com/${s2.kind}/${s2.sid}`,
    kind: s2.kind,
    sid: s2.sid,
    w: 320,
    h: spH(s2.kind),
    title: c.title && !/^https?:/.test(c.title) ? c.title : 'Spotify',
    loading: false,
    draft: '',
  });
  renderCard(c);
  save();
  // Spotify's own public info (no account needed): the real name and cover art, kept on the card for offline, Layers and Myra
  try {
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(c.url));
    if (r.ok) {
      const o = await r.json();
      if (o.title) c.title = o.title;
      if (o.thumbnail_url) c.image = o.thumbnail_url;
    }
  } catch (e) {}
  if (!c.title || c.title === 'Spotify')
    try {
      const p = await Fenmyr.linkPreview(c.url);
      if (p.title && !/^open\.spotify\.com$/i.test(p.title)) c.title = p.title.replace(/\s*[|·-]\s*Spotify\s*$/i, '');
      if (!c.image && p.image) c.image = p.image;
    } catch (e) {}
  c.desc =
    {
      track: 'Song',
      album: 'Album',
      playlist: 'Playlist',
      episode: 'Podcast episode',
      show: 'Podcast',
      artist: 'Artist',
    }[c.kind] + ' on Spotify';
  renderCard(c);
  save();
  return true;
}

export async function linkCard(url, at, toTray) {
  if (spotifyOf(url)) {
    const c = card('spotify', { url, title: 'Spotify' });
    if (toTray) {
      session.board.tray.unshift(c);
      renderTray();
    } else {
      Object.assign(c, at || {});
      addCard(c);
    }
    await spotifyFill(c, url);
    if (toTray) renderTray();
    return c;
  }
  const c = card('link', { url, title: url, desc: '' });
  if (toTray) session.board.tray.unshift(c);
  else {
    Object.assign(c, at || {});
    addCard(c);
  }
  try {
    const p = await Fenmyr.linkPreview(url);
    Object.assign(c, { title: p.title || url, desc: p.desc || url, image: p.image || '' });
    toTray ? renderTray() : renderCard(c);
    save();
  } catch (e) {}
  if (toTray) {
    renderTray();
    save();
  }
  return c;
}

// images come in as data URLs, scaled down so boards stay light
// GIFs (and animated WebPs) keep their own file so they still move; PNGs stay PNGs so see-through parts stay see-through
const MOVING = ['image/gif', 'image/webp', 'image/apng'];
const MOVING_MAX = 12e6;

function imageFromFile(file) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        if (MOVING.includes(file.type) && file.size <= MOVING_MAX)
          return res({ src: fr.result, w: im.width, h: im.height });
        const k = Math.min(1, 2800 / Math.max(im.width, im.height)), // full Retina size, so pictures stay sharp when you zoom in
          cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k);
        cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        if (MOVING.includes(file.type)) say('That one is too big to keep moving, so I kept a still of it.');
        const png = file.type === 'image/png' || file.type === 'image/svg+xml',
          out = png ? cv.toDataURL('image/png') : '';
        res({ src: png && out.length < 6e6 ? out : cv.toDataURL('image/jpeg', 0.9), w: cv.width, h: cv.height });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const imageCardFrom = async f => {
  const im = await imageFromFile(f),
    w = 260;
  return card('image', { src: im.src, w, h: Math.round((w * im.h) / im.w) + 16 });
};

export async function addImages(files, at, toTray) {
  files = [...files];
  const vfs = files.filter(f => f.type.startsWith('video/'));
  files = files.filter(f => !f.type.startsWith('video/'));
  vfs.forEach((f, n) => addVideo(f, at ? { x: at.x + n * 30, y: at.y + n * 30 } : null));
  let i = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const c = await imageCardFrom(f);
    if (toTray) {
      session.board.tray.unshift(c);
      renderTray();
      save();
      continue;
    }
    const p = at || centerWorld();
    c.x = p.x - c.w / 2 + i * 30;
    c.y = p.y - c.h / 2 + i * 30;
    i++;
    addCard(c);
  }
}

// a picture meant for a note becomes a card of its own, so a card never mixes kinds: an empty note turns into the picture,
// a note with words gets it beside it, joined by a connector (in the connector style you last chose)
export async function pictureForNote(c, files) {
  const el = cardEl(c.id),
    hasWords =
      !![el?.querySelector('.text')?.innerText ?? c.text, el?.querySelector('.nname')?.innerText ?? c.name]
        .join('')
        .trim() || (c.tags || []).length;
  if (session.editing === c.id) endEdit();
  const pics = [];
  for (const f of files) if (f.type.startsWith('image/')) pics.push(await imageCardFrom(f));
  if (!pics.length) return;
  let anchor = c;
  const made = [];
  if (!hasWords) {
    const p = pics.shift(),
      ties = session.board.links.filter(l => l.a === c.id || l.b === c.id);
    p.x = c.x + c.w / 2 - p.w / 2;
    p.y = c.y + c.h / 2 - p.h / 2;
    if (c.group) p.group = c.group;
    session.sel = new Set([c.id]);
    removeSelected();
    addCard(p);
    ties.forEach(l =>
      session.board.links.push({ ...l, id: uid(), a: l.a === c.id ? p.id : l.a, b: l.b === c.id ? p.id : l.b }),
    );
    anchor = p;
    made.push(p);
  }
  const busy = (x, y, w, h) =>
    session.board.cards.some(
      k =>
        k.type !== 'frame' &&
        k.type !== 'section' &&
        x < k.x + k.w + 12 &&
        x + w + 12 > k.x &&
        y < k.y + k.h + 12 &&
        y + h + 12 > k.y,
    );
  for (const p of pics) {
    let x = anchor.x + anchor.w + 70,
      y = anchor.y;
    for (let k = 0; k < 10 && busy(x, y, p.w, p.h); k++) y = anchor.y + (k + 1) * (p.h + 24);
    p.x = x;
    p.y = y;
    if (anchor.group) p.group = anchor.group;
    addCard(p);
    made.push(p);
    session.board.links.push({ id: uid(), a: anchor.id, b: p.id, ...(settings.wireStyle || {}) });
  }
  renderWires();
  save();
  selectOnly([made[made.length - 1].id]);
  revealCards(made);
}
