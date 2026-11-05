import type { Card, CardOf } from '../../shared/model.ts';
import { countBadge } from '../cards/collection.ts';
import { cropping } from '../cards/crop.ts';
import { CIC, host, shapeSVG } from '../cards/shapes.ts';
import { spEmbed } from '../cards/spotify.ts';
import { appState } from '../core/state.ts';
import { tagChips } from '../features/tags.ts';
import { fmtT, MIC, PLAY } from '../media/audio.ts';
import { devName } from '../media/devices.ts';
import { cams, SPK } from '../media/video.ts';
import { captureTag } from '../proto/capture.ts';
import { settings } from '../settings/settings.ts';
import { inkPath } from '../tools/ink.ts';
import { pathD } from '../tools/pen.ts';
import { pxSrc } from '../tools/stamps.ts';
import { esc } from '../ui/dom.ts';
import { vnFull, vnMd } from '../vault/notes.ts';
import { isLocalFont, useFont } from '../wireframe/tilt.ts';
import { skStyle } from './render.ts';

// ---------- what goes inside each kind of card: values are worked out first, then put into the markup ----------

// a piece of markup, or nothing
const when = (on: unknown, html: string) => (on ? html : '');
const cls = (name: string, on: unknown) => (on ? ` ${name}` : '');

function note(c: CardOf<'note'>) {
  const name = esc(c.name || ''),
    text = esc(c.text),
    mv = cls(`mv-${c.myraMv}`, c.myraMv),
    img = esc(c.myraImg || 'stamps/myra-wave.png'),
    head = c.myra
      ? `<div class="nm-head"><img class="nmyra${mv}" src="${img}" alt=""><div class="nname">${name}</div></div>`
      : `<div class="nname">${name}</div>`,
    tags = when((c.tags || []).length, tagChips(c));
  return `${head}<div class="text">${text}</div>${tags}`;
}

function stamp(c: CardOf<'stamp'>) {
  const emoji = c.emoji || '⭐',
    src = c.src ? esc(c.src) : pxSrc(emoji),
    shown = esc(emoji),
    face = src ? `<img src="${src}" alt="">` : `<span>${shown}</span>`;
  return `<div class="st">${face}</div>`;
}

const SPOTIFY_LOGO =
  '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.6 9.4c3.6-1.1 7.8-.8 11 1M7.2 12.6c3-.9 6.3-.6 9 .9M7.8 15.6c2.4-.6 4.9-.4 7 .8" stroke="#121212" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';

function spotify(c: CardOf<'spotify'>) {
  const title = esc(c.title || 'Spotify'),
    embed = esc(spEmbed(c)),
    image = esc(c.image),
    art = when(c.image, `<img class="sp-art" src="${image}" alt="">`);
  return (
    `<div class="sp-head">${SPOTIFY_LOGO}<span>${title}</span></div>` +
    `<div class="sp-wrap">${art}<iframe class="sp-frame" data-src="${embed}" src="${embed}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="${title}"></iframe><div class="sp-shield" title="Click to select, then play"></div></div>`
  );
}

// a recorded video: the player, and its written-out words when they're showing
function videoPlayer(c: CardOf<'video'>) {
  const time = fmtT(c.dur || 0),
    muted = cls('off', c.muted),
    hasText = cls('on', c.text),
    captions = Icon('captions', { size: 15 }),
    words = esc(c.text || c.txNote || 'Writing it out…'),
    waiting = c.text ? '' : ' wait',
    notesBtn = when(
      settings.ai && appState.haveClaude !== false,
      '<button data-act="vd-notes">✦ Turn into notes</button>',
    ),
    acts = c.text
      ? `<div class="vd-txt-acts">${notesBtn}<button data-act="vd-copy">Copy</button></div>`
      : when(c.needTx, '<div class="vd-txt-acts"><button data-act="vd-tx">✦ Write it out</button></div>'),
    transcript = when(c.txShown, `<div class="vd-txt"><div class="vd-txt-body${waiting}">${words}</div>${acts}</div>`);
  return (
    `<div class="vd-stage"><video class="vd-v"></video><button class="vd-play" data-act="vd-play" aria-label="Play">${PLAY}</button></div><div class="vd-bar"><button class="vd-pp" data-act="vd-play" aria-label="Play or pause">${PLAY}</button><div class="vd-prog" data-act="vd-seek"><i></i></div><span class="vd-time">${time}</span><button class="vd-mute${muted}" data-act="vd-mute" aria-label="Sound">${SPK}</button><button class="vd-txb${hasText}" data-act="vd-tx" aria-label="Write it out" data-tip="Write it out">${captions}</button></div>` +
    transcript
  );
}

// the camera before and while recording
function videoCamera(c: CardOf<'video'>) {
  const cam = cams.get(c.id),
    idle = !c.rec && !c.camErr,
    err = esc(c.camErr),
    notice = c.camErr
      ? `<div class="vd-msg"><b>${err}</b></div>`
      : when(
          c.camRest,
          '<button class="vd-msg vd-wake" data-act="vd-wake"><b>Your camera is resting</b><span>Click to turn it on</span></button>',
        ),
    count = when(c.count, `<div class="vd-count">${c.count}</div>`),
    recDot = when(c.rec && !c.count, '<div class="vd-recdot"><i></i><span class="vd-rtime">0:00</span></div>'),
    camIcon = Icon('camera', { size: 13 }),
    camName = esc(devName(cam?.stream.getVideoTracks()[0], 'Camera')),
    device = when(
      idle && cam,
      `<button class="vd-dev" data-act="vd-dev">${camIcon}<span>${camName}</span><i>▾</i></button>`,
    ),
    flipOn = settings.camFlip === false ? '' : 'on',
    flipIcon = Icon('flip'),
    flip = when(
      idle && cam,
      `<div class="vd-look"><button class="${flipOn}" data-act="vd-flip" data-tip="Flip" aria-label="Flip the camera">${flipIcon}</button></div>`,
    ),
    wideOn = c.vert ? '' : 'on',
    tallOn = c.vert ? 'on' : '',
    shape = when(
      idle,
      `<div class="vd-shape"><button data-act="vd-wide" class="${wideOn}"><i class="w"></i>Wide</button><button data-act="vd-tall" class="${tallOn}"><i class="t"></i>Phone</button></div>`,
    ),
    startLabel = c.vert ? 'Record' : 'Start recording',
    fileLabel = c.vert ? Icon('upload', { size: 16 }) : 'Use a video file',
    bar = c.rec
      ? '<button class="vd-stop" data-act="vd-stop"><i></i>Stop</button>'
      : `<button class="vd-start" data-act="vd-start"><span class="au-rec"></span>${startLabel}</button><button class="vd-file" data-act="vd-file" title="Use a video file">${fileLabel}</button>`;
  return (
    `<div class="vd-stage live"><video class="vd-live"></video>${notice}${count}${recDot}${device}${flip}${shape}</div>` +
    `<div class="vd-bar">${bar}</div>`
  );
}

function video(c: CardOf<'video'>) {
  if (c.src) return videoPlayer(c);
  if (c.saving) {
    const pct = Math.round((c.pct || 0) * 100),
      title = esc(c.title || 'Video');
    return `<div class="vd-stage"><div class="vd-msg"><b>Saving your video…</b><span>${pct}%</span></div></div><div class="vd-bar"><span class="vd-title">${title}</span></div>`;
  }
  return videoCamera(c);
}

function audioReady(c: CardOf<'audio'>) {
  const title = esc(c.title || 'Voice memo'),
    mic = esc(devName(appState.warm?.getAudioTracks?.()[0], 'Microphone'));
  return `<div class="au-top"><span class="au-mic">${MIC}</span><span class="text">${title}</span></div><button class="au-start" data-act="au-start"><span class="au-rec"></span>Start recording</button><button class="au-dev" data-act="au-dev">${MIC}<span>${mic}</span><i>▾</i></button>`;
}

function audioRecording(c: CardOf<'audio'>) {
  const waiting = c.count || c.starting,
    dot = cls('wait', waiting),
    state =
      c.count === 'connecting'
        ? 'Connecting to voice…'
        : c.count
          ? 'Start talking in…'
          : c.starting
            ? 'Starting…'
            : c.paused
              ? 'Paused'
              : 'Recording…',
    soft = cls('soft', typeof c.count === 'string'),
    counting = c.count === 'connecting' ? '<i></i><i></i><i></i>' : c.count || '',
    meter = waiting
      ? `<div class="au-count${soft}">${counting}</div>`
      : '<canvas class="au-live" width="520" height="68"></canvas>',
    pause = c.paused ? 'Resume' : 'Pause';
  return `<div class="au-top"><span class="au-dot${dot}"></span><b>${state}</b><span class="au-time">0:00</span></div>${meter}<div class="au-acts"><button data-act="au-pause">${pause}</button><button data-act="au-stop" class="solid">Stop</button></div>`;
}

function audioMemo(c: CardOf<'audio'>) {
  const title = esc(c.title || 'Voice memo'),
    bars = (c.wave || Array(40).fill(0.2))
      .map(v => {
        const h = Math.max(8, v * 100);
        return `<i style="height:${h}%"></i>`;
      })
      .join(''),
    time = fmtT(c.dur || 0),
    waiting = c.text ? '' : ' wait',
    words = c.text ? esc(c.text) : esc(c.txNote || 'Writing it out…'),
    more = c.text
      ? '<button data-act="au-notes">✦ Turn into notes</button>'
      : when(c.needTx, '<button data-act="au-tx">✦ Write it out</button>');
  return (
    `<div class="au-top"><span class="text">${title}</span></div><div class="au-row"><button class="au-play" data-act="au-play">${PLAY}</button><div class="au-wave" data-act="au-seek">${bars}</div><span class="au-time">${time}</span></div>` +
    `<div class="au-tx${waiting}">${words}</div><div class="au-acts"><button data-act="au-replace">Replace</button>${more}</div>`
  );
}

const audio = (c: CardOf<'audio'>) =>
  c.ready && !c.rec && !c.src ? audioReady(c) : c.rec ? audioRecording(c) : audioMemo(c);

function path(c: CardOf<'path'>) {
  const d = pathD(c.pts, c.closed, c.radius || 0, c.ow / Math.max(1, c.w)),
    fill = c.closed && c.fill ? c.fill : 'none',
    sw = c.sw ?? 0,
    stroke = c.stroke && sw > 0 ? c.stroke : 'none',
    width = c.sw || 0,
    style = skStyle(c),
    dashes =
      style === 'dash'
        ? ` stroke-dasharray="${c.dl ?? 8} ${c.dg ?? 6}"`
        : style === 'dot'
          ? ` stroke-dasharray="0 ${(c.dg ?? 6) + sw}"`
          : '';
  return `<svg class="pth" viewBox="0 0 ${c.ow} ${c.oh}" preserveAspectRatio="none"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashes} vector-effect="non-scaling-stroke"/></svg>`;
}

function ink(c: CardOf<'ink'>) {
  const strokes = inkPath(c.pts, c.pen ?? 'pen', c.size, c.ink, true);
  return `<svg viewBox="0 0 ${c.ow} ${c.oh}" preserveAspectRatio="none">${strokes}</svg>`;
}

function box(c: CardOf<'box'>) {
  const icon = Icon('image'),
    label = esc(c.img),
    spot = when(c.img && !c.src, `<div class="bx-ph">${icon}<span class="bx-l">${label}</span></div>`);
  return `<div class="bx"></div>${spot}`;
}

function font(c: CardOf<'font'>) {
  const f = esc(c.font || 'Figtree'),
    where = isLocalFont(c.font) ? 'On your computer' : 'Google Fonts',
    sample = esc(c.text || 'The quick brown fox jumps over the lazy dog');
  useFont(c.font);
  return `<div class="fs-aa" style="font-family:'${f}', system-ui">Aa</div><div class="fs-meta"><b>${f}</b><span class="fs-src">${where}</span></div><div class="fs-sample text" style="font-family:'${f}', system-ui">${sample}</div>`;
}

function coll(c: CardOf<'coll'>) {
  const text = esc(c.text),
    heads = when(c.kanban, '<div class="kb-heads"></div>'),
    empty = when(!(c.kids || []).length && !c.kanban, '<div class="coll-empty">Drop cards here</div>'),
    badge = when(!!c.count && c.head !== false, countBadge((c.kids || []).length));
  return `<div class="coll-head"><span class="text">${text}</span>${badge}</div><div class="coll-frame"></div>${heads}${empty}`;
}

// the crop box while cropping, placed as fractions of the picture
function cropUi(b: { x: number; y: number; w: number; h: number }, corners: string) {
  const left = b.x * 100,
    top = b.y * 100,
    width = b.w * 100,
    height = b.h * 100;
  return `<div class="crop-ui"><div class="crop-box" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%">${corners}</div></div>`;
}

// a crop shows a window onto the picture: the picture is scaled up and shifted so only the kept part shows
function image(c: CardOf<'image'>) {
  const k = !c.cropEdit && c.crop,
    st = k
      ? `position:absolute;width:${100 / k.w}%;height:${100 / k.h}%;left:${(-k.x / k.w) * 100}%;top:${(-k.y / k.h) * 100}%;object-fit:fill;border-radius:0`
      : '',
    b = c.cropEdit && cropping ? cropping.box : null,
    corners = ['nw', 'ne', 'sw', 'se'].map(h => `<i data-h="${h}"></i>`).join(''),
    ui = b ? cropUi(b, corners) : '',
    src = esc(c.src),
    palette = Icon('palette', { size: 16 }),
    pull = when(!c.cropEdit, `<button class="chip" data-act="colors">${palette}<span>Pull colours</span></button>`),
    tag = captureTag(c);
  return `<div class="imgwrap"><img src="${src}" alt="" style="${st}">${ui}</div>${tag}${pull}`;
}

function vnote(c: CardOf<'vnote'>) {
  const gone = c.blocked || c.missing,
    back = c.side === 'back',
    full = vnFull.get(c.id),
    sm = c.props ?? [],
    notebook = Icon('notebook'),
    title = esc(c.title || 'Note'),
    flipTip = back ? 'Show the title and tags' : 'Show the content',
    refresh = Icon('refresh'),
    head = `<div class="vn-head">${notebook}<span class="vn-title text">${title}</span><button class="vn-flip" data-act="vn-flip" title="${flipTip}">${refresh}</button></div>`,
    fullLabel = full ? 'Show less' : 'Show full text',
    open = Icon('open'),
    fullBtn = when(back && !gone, `<button class="vn-btn" data-act="vn-full">${fullLabel}</button>`),
    foot = `<div class="vn-foot">${fullBtn}<button class="vn-btn" data-act="vn-open" title="Open in Obsidian">${open}<span>Obsidian</span></button></div>`;
  if (gone) {
    const why = c.missing ? 'I can’t find this note any more.' : 'Not available: this board isn’t allowed to read it.';
    return `${head}<div class="vn-gone text">${why}</div>${foot}`;
  }
  if (!back) {
    const tags = (c.tags ?? [])
        .slice(0, 6)
        .map(t => {
          const tag = esc(t);
          return `<i>#${tag}</i>`;
        })
        .join(''),
      props = sm
        .slice(0, 5)
        .map(([k, v]) => {
          const key = esc(k),
            value = esc(v);
          return `<span><em>${key}</em>${value}</span>`;
        })
        .join(''),
      tagRow = when(tags, `<div class="vn-tags">${tags}</div>`),
      propRow = when(props, `<div class="vn-props text">${props}</div>`);
    return `${head}${tagRow}${propRow}<div class="vn-fill"></div>${foot}`;
  }
  const md = full ? vnMd(full.body) : '',
    cut = when(full?.truncated, '<p class="vn-cut">That is the first part. The rest is in the note.</p>'),
    excerpt = esc(c.excerpt || ''),
    body = full ? `<div class="vn-md text">${md}${cut}</div>` : `<div class="vn-ex text">${excerpt}</div>`;
  return `${head}${body}${foot}`;
}

function link(c: CardOf<'link'>) {
  if (!c.url) {
    const loading = cls('loading', c.loading),
      draft = esc(c.draft || '');
    return `<div class="link-in${loading}">${CIC.link}<input placeholder="Add a link…" value="${draft}" spellcheck="false"></div>`;
  }
  const image = esc(c.image),
    thumb = c.image ? `background-image:url('${image}')` : '',
    domain = esc(host(c.url)),
    title = esc(c.title || c.url),
    desc = esc(c.desc || host(c.url));
  return `<div class="thumb" style="${thumb}"></div><div class="meta"><i class="fav" style="background-image:url('https://www.google.com/s2/favicons?sz=64&domain=${domain}')"></i><div><b>${title}</b><span>${desc}</span></div></div>`;
}

function todo(c: CardOf<'todo'>) {
  const text = esc(c.text),
    close = Icon('close'),
    items = (c.items || [])
      .map((it, i) => {
        const done = it.done ? 'done' : '',
          checked = it.done ? 'checked' : '',
          words = esc(it.t);
        return `<li class="${done}" data-i="${i}"><input type="checkbox" ${checked}><span>${words}</span><button class="li-x" data-act="item-x" title="Remove" aria-label="Remove this item">${close}</button></li>`;
      })
      .join('');
  return `<div class="head">${text}</div><ul>${items}</ul><button class="add-item" data-act="item">+ add</button>`;
}

function swatch(c: CardOf<'swatch'>) {
  const label = esc(c.label || c.hex.toUpperCase()),
    hex = esc(c.hex.toUpperCase()),
    name = when(!c.hideName, `<b>${label}</b>`),
    code = when(!c.hideHex, `<span>${hex}</span>`);
  return `<div class="chipcol"></div><div class="hex">${name}${code}</div>`;
}

// the words-only cards, with the class their text sits in
const textCard = (cls: string, text: string | undefined) => {
  const words = esc(text);
  return `<div class="${cls}">${words}</div>`;
};

export function inner(c: Card): string {
  switch (c.type) {
    case 'note':
      return note(c);
    case 'doc':
    case 'canvas': {
      const text = esc(c.text);
      return c.type === 'doc'
        ? `<div class="pill">${CIC.doc}<span class="text">${text}</span></div>`
        : `<div class="cv-head">${CIC.canvas}<span class="text">${text}</span></div><div class="cv-prev"><em>empty canvas</em></div>`;
    }
    case 'shape':
      return shapeSVG(c) + textCard('text', c.text || '');
    case 'stamp':
      return stamp(c);
    case 'spotify':
      return spotify(c);
    case 'video':
      return video(c);
    case 'audio':
      return audio(c);
    case 'path':
      return path(c);
    case 'ink':
      return ink(c);
    case 'frame': {
      const name = esc(c.name || 'Screen');
      return `<div class="fr-body"></div><div class="fr-name">${name}</div>`;
    }
    case 'section': {
      const name = esc(c.text || 'Section');
      return `<div class="sec-glass"></div><div class="sec-name"><span class="text">${name}</span></div>`;
    }
    case 'box':
      return box(c);
    case 'font':
      return font(c);
    case 'icon':
      return Icon(c.name || 'star', { cls: 'ci' });
    case 'text':
      return textCard('text tx', c.text || '');
    case 'coll':
      return coll(c);
    case 'title':
      return textCard('text', c.text);
    case 'image':
      return image(c);
    case 'vnote':
      return vnote(c);
    case 'link':
      return link(c);
    case 'todo':
      return todo(c);
    case 'swatch':
      return swatch(c);
  }
  return '';
}
