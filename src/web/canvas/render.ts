// @ts-nocheck
import { cardEl, esc } from '../ui/dom.ts';
import { typesWith } from '../../shared/cardTypes.ts';
import { applyView } from './view.ts';
import { renderTray, renderWires } from './wires.ts';
import { COLL, parentOf } from '../cards/collection.ts';
import { cropping } from '../cards/crop.ts';
import { layoutAll } from '../cards/kanban.ts';
import { wireLinkInput } from '../cards/links.ts';
import { CIC, host, shapeSVG } from '../cards/shapes.ts';
import { spEmbed } from '../cards/spotify.ts';
import { COLORS, find } from '../core/base.ts';
import { cardsEl } from '../core/dom.ts';
import { dueChip } from '../features/due.ts';
import { isDim } from '../features/focus.ts';
import { soloTagAdd, tagChips } from '../features/tags.ts';
import { mini } from '../library/home.ts';
import { MIC, PLAY, fitAudio, fmtT } from '../media/audio.ts';
import { devName } from '../media/devices.ts';
import { SPK, cams, setupVideo } from '../media/video.ts';
import { layersSoon, wireLayers } from '../panels/layers.ts';
import { SIZED, fsMul } from '../selbar/selbar.ts';
import { applyColors } from '../settings/colors.ts';
import { settings } from '../settings/settings.ts';
import { inkPath } from '../tools/draw.ts';
import { pathD } from '../tools/pen.ts';
import { pxSrc } from '../tools/stamps.ts';
import { vnFull, vnMd } from '../vault/notes.ts';
import { isLocalFont, useFont } from '../wireframe/tilt.ts';
import { WF, styleWF } from '../wireframe/wireframes.ts';
import { appState, session } from '../core/state.ts';

// ---------- rendering ----------

function inner(c) {
  switch (c.type) {
    case 'note':
      return `${c.myra ? `<div class="nm-head"><img class="nmyra${c.myraMv ? ' mv-' + c.myraMv : ''}" src="${esc(c.myraImg || 'stamps/myra-wave.png')}" alt=""><div class="nname">${esc(c.name || '')}</div></div>` : `<div class="nname">${esc(c.name || '')}</div>`}<div class="text">${esc(c.text)}</div>${(c.tags || []).length ? tagChips(c) : ''}`;
    case 'doc':
      return `<div class="pill">${CIC.doc}<span class="text">${esc(c.text)}</span></div>`;
    case 'canvas':
      return `<div class="cv-head">${CIC.canvas}<span class="text">${esc(c.text)}</span></div><div class="cv-prev"><em>empty canvas</em></div>`;
    case 'shape':
      return shapeSVG(c) + `<div class="text">${esc(c.text || '')}</div>`;
    case 'stamp':
      return `<div class="st">${c.src ? `<img src="${esc(c.src)}" alt="">` : pxSrc(c.emoji || '⭐') ? `<img src="${pxSrc(c.emoji || '⭐')}" alt="">` : `<span>${esc(c.emoji || '⭐')}</span>`}</div>`;
    case 'spotify':
      return (
        `<div class="sp-head"><svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.6 9.4c3.6-1.1 7.8-.8 11 1M7.2 12.6c3-.9 6.3-.6 9 .9M7.8 15.6c2.4-.6 4.9-.4 7 .8" stroke="#121212" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg><span>${esc(c.title || 'Spotify')}</span></div>` +
        `<div class="sp-wrap">${c.image ? `<img class="sp-art" src="${esc(c.image)}" alt="">` : ''}<iframe class="sp-frame" data-src="${esc(spEmbed(c))}" src="${esc(spEmbed(c))}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="${esc(c.title || 'Spotify')}"></iframe><div class="sp-shield" title="Click to select, then play"></div></div>`
      );
    case 'video': {
      if (c.src)
        return (
          `<div class="vd-stage"><video class="vd-v"></video><button class="vd-play" data-act="vd-play" aria-label="Play">${PLAY}</button></div><div class="vd-bar"><button class="vd-pp" data-act="vd-play" aria-label="Play or pause">${PLAY}</button><div class="vd-prog" data-act="vd-seek"><i></i></div><span class="vd-time">${fmtT(c.dur || 0)}</span><button class="vd-mute${c.muted ? ' off' : ''}" data-act="vd-mute" aria-label="Sound">${SPK}</button><button class="vd-txb${c.text ? ' on' : ''}" data-act="vd-tx" aria-label="Write it out" data-tip="Write it out">${Icon('captions', { size: 15 })}</button></div>` +
          (c.txShown
            ? `<div class="vd-txt"><div class="vd-txt-body${c.text ? '' : ' wait'}">${esc(c.text || c.txNote || 'Writing it out…')}</div>${c.text ? `<div class="vd-txt-acts">${settings.ai && appState.haveClaude !== false ? '<button data-act="vd-notes">✦ Turn into notes</button>' : ''}<button data-act="vd-copy">Copy</button></div>` : c.needTx ? '<div class="vd-txt-acts"><button data-act="vd-tx">✦ Write it out</button></div>' : ''}</div>`
            : '')
        );
      if (c.saving)
        return `<div class="vd-stage"><div class="vd-msg"><b>Saving your video…</b><span>${Math.round((c.pct || 0) * 100)}%</span></div></div><div class="vd-bar"><span class="vd-title">${esc(c.title || 'Video')}</span></div>`;
      return (
        `<div class="vd-stage live"><video class="vd-live"></video>${c.camErr ? `<div class="vd-msg"><b>${esc(c.camErr)}</b></div>` : c.camRest ? `<button class="vd-msg vd-wake" data-act="vd-wake"><b>Your camera is resting</b><span>Click to turn it on</span></button>` : ''}${c.count ? `<div class="vd-count">${c.count}</div>` : ''}${c.rec && !c.count ? `<div class="vd-recdot"><i></i><span class="vd-rtime">0:00</span></div>` : ''}${!c.rec && !c.camErr && cams.get(c.id) ? `<button class="vd-dev" data-act="vd-dev">${Icon('camera', { size: 13 })}<span>${esc(devName(cams.get(c.id).stream.getVideoTracks()[0], 'Camera'))}</span><i>▾</i></button>` : ''}${!c.rec && !c.camErr && cams.get(c.id) ? `<div class="vd-look"><button class="${settings.camFlip === false ? '' : 'on'}" data-act="vd-flip" data-tip="Flip" aria-label="Flip the camera">${Icon('flip')}</button></div>` : ''}${!c.rec && !c.camErr ? `<div class="vd-shape"><button data-act="vd-wide" class="${c.vert ? '' : 'on'}"><i class="w"></i>Wide</button><button data-act="vd-tall" class="${c.vert ? 'on' : ''}"><i class="t"></i>Phone</button></div>` : ''}</div>` +
        `<div class="vd-bar">${c.rec ? `<button class="vd-stop" data-act="vd-stop"><i></i>Stop</button>` : `<button class="vd-start" data-act="vd-start"><span class="au-rec"></span>${c.vert ? 'Record' : 'Start recording'}</button><button class="vd-file" data-act="vd-file" title="Use a video file">${c.vert ? Icon('upload', { size: 16 }) : 'Use a video file'}</button>`}</div>`
      );
    }
    case 'audio':
      return c.ready && !c.rec && !c.src
        ? `<div class="au-top"><span class="au-mic">${MIC}</span><span class="text">${esc(c.title || 'Voice memo')}</span></div><button class="au-start" data-act="au-start"><span class="au-rec"></span>Start recording</button><button class="au-dev" data-act="au-dev">${MIC}<span>${esc(devName(appState.warm?.getAudioTracks?.()[0], 'Microphone'))}</span><i>▾</i></button>`
        : c.rec
          ? `<div class="au-top"><span class="au-dot${c.count || c.starting ? ' wait' : ''}"></span><b>${c.count === 'connecting' ? 'Connecting to voice…' : c.count ? 'Start talking in…' : c.starting ? 'Starting…' : c.paused ? 'Paused' : 'Recording…'}</b><span class="au-time">0:00</span></div>${c.count || c.starting ? `<div class="au-count${typeof c.count === 'string' ? ' soft' : ''}">${c.count === 'connecting' ? '<i></i><i></i><i></i>' : c.count || ''}</div>` : '<canvas class="au-live" width="520" height="68"></canvas>'}<div class="au-acts"><button data-act="au-pause">${c.paused ? 'Resume' : 'Pause'}</button><button data-act="au-stop" class="solid">Stop</button></div>`
          : `<div class="au-top"><span class="text">${esc(c.title || 'Voice memo')}</span></div><div class="au-row"><button class="au-play" data-act="au-play">${PLAY}</button><div class="au-wave" data-act="au-seek">${(c.wave || Array(40).fill(0.2)).map(v => `<i style="height:${Math.max(8, v * 100)}%"></i>`).join('')}</div><span class="au-time">${fmtT(c.dur || 0)}</span></div>` +
            `<div class="au-tx${c.text ? '' : ' wait'}">${c.text ? esc(c.text) : esc(c.txNote || 'Writing it out…')}</div><div class="au-acts"><button data-act="au-replace">Replace</button>${c.text ? '<button data-act="au-notes">✦ Turn into notes</button>' : c.needTx ? '<button data-act="au-tx">✦ Write it out</button>' : ''}</div>`;
    case 'path':
      return `<svg class="pth" viewBox="0 0 ${c.ow} ${c.oh}" preserveAspectRatio="none"><path d="${pathD(c.pts, c.closed, c.radius || 0, c.ow / Math.max(1, c.w))}" fill="${c.closed && c.fill ? c.fill : 'none'}" stroke="${c.stroke && c.sw > 0 ? c.stroke : 'none'}" stroke-width="${c.sw || 0}" stroke-linecap="round" stroke-linejoin="round"${skStyle(c) === 'dash' ? ` stroke-dasharray="${c.dl ?? 8} ${c.dg ?? 6}"` : skStyle(c) === 'dot' ? ` stroke-dasharray="0 ${(c.dg ?? 6) + (c.sw || 0)}"` : ''} vector-effect="non-scaling-stroke"/></svg>`;
    case 'ink':
      return `<svg viewBox="0 0 ${c.ow} ${c.oh}" preserveAspectRatio="none">${inkPath(c.pts, c.pen, c.size, c.ink, true)}</svg>`;
    case 'frame':
      return `<div class="fr-body"></div><div class="fr-name">${esc(c.name || 'Screen')}</div>`;
    case 'section':
      return `<div class="sec-glass"></div><div class="sec-name"><span class="text">${esc(c.text || 'Section')}</span></div>`;
    case 'box':
      return `<div class="bx"></div>${c.img && !c.src ? `<div class="bx-ph">${Icon('image')}<span class="bx-l">${esc(c.img)}</span></div>` : ''}`;
    case 'font': {
      const f = esc(c.font || 'Figtree');
      useFont(c.font);
      return `<div class="fs-aa" style="font-family:'${f}', system-ui">Aa</div><div class="fs-meta"><b>${f}</b><span class="fs-src">${isLocalFont(c.font) ? 'On your computer' : 'Google Fonts'}</span></div><div class="fs-sample text" style="font-family:'${f}', system-ui">${esc(c.text || 'The quick brown fox jumps over the lazy dog')}</div>`;
    }
    case 'icon':
      return Icon(c.name || 'star', { cls: 'ci' });
    case 'text':
      return `<div class="text tx">${esc(c.text || '')}</div>`;
    case 'coll':
      return `<div class="coll-head"><span class="text">${esc(c.text)}</span></div><div class="coll-frame"></div>${c.kanban ? '<div class="kb-heads"></div>' : ''}${(c.kids || []).length || c.kanban ? '' : '<div class="coll-empty">Drop cards here</div>'}`;
    case 'title':
      return `<div class="text">${esc(c.text)}</div>`;
    case 'image': {
      // a crop shows a window onto the picture: the picture is scaled up and shifted so only the kept part shows
      const k = !c.cropEdit && c.crop,
        st = k
          ? `position:absolute;width:${100 / k.w}%;height:${100 / k.h}%;left:${(-k.x / k.w) * 100}%;top:${(-k.y / k.h) * 100}%;object-fit:fill;border-radius:0`
          : '';
      const ui =
        c.cropEdit && cropping
          ? `<div class="crop-ui"><div class="crop-box" style="left:${cropping.box.x * 100}%;top:${cropping.box.y * 100}%;width:${cropping.box.w * 100}%;height:${cropping.box.h * 100}%">${['nw', 'ne', 'sw', 'se'].map(h => `<i data-h="${h}"></i>`).join('')}</div></div>`
          : '';
      return `<div class="imgwrap"><img src="${esc(c.src)}" alt="" style="${st}">${ui}</div>${c.cropEdit ? '' : `<button class="chip" data-act="colors">${Icon('palette', { size: 16 })}<span>Pull colours</span></button>`}`;
    }
    case 'vnote': {
      const gone = c.blocked || c.missing,
        back = c.side === 'back',
        full = vnFull.get(c.id),
        sm = c.props || [];
      const head = `<div class="vn-head">${Icon('notebook')}<span class="vn-title text">${esc(c.title || 'Note')}</span><button class="vn-flip" data-act="vn-flip" title="${back ? 'Show the title and tags' : 'Show the content'}">${Icon('refresh')}</button></div>`;
      const btns = `${back && !gone ? `<button class="vn-btn" data-act="vn-full">${full ? 'Show less' : 'Show full text'}</button>` : ''}<button class="vn-btn" data-act="vn-open" title="Open in Obsidian">${Icon('open')}<span>Obsidian</span></button>`;
      const foot = `<div class="vn-foot">${btns}</div>`;
      if (gone)
        return `${head}<div class="vn-gone text">${c.missing ? 'I can’t find this note any more.' : 'Not available: this board isn’t allowed to read it.'}</div>${foot}`;
      if (!back)
        return `${head}${
          (c.tags || []).length
            ? `<div class="vn-tags">${c.tags
                .slice(0, 6)
                .map(t => `<i>#${esc(t)}</i>`)
                .join('')}</div>`
            : ''
        }${
          sm.length
            ? `<div class="vn-props text">${sm
                .slice(0, 5)
                .map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`)
                .join('')}</div>`
            : ''
        }<div class="vn-fill"></div>${foot}`;
      return `${head}${full ? `<div class="vn-md text">${vnMd(full.body)}${full.truncated ? '<p class="vn-cut">That is the first part. The rest is in the note.</p>' : ''}</div>` : `<div class="vn-ex text">${esc(c.excerpt || '')}</div>`}${foot}`;
    }
    case 'link':
      return !c.url
        ? `<div class="link-in${c.loading ? ' loading' : ''}">${CIC.link}<input placeholder="Add a link…" value="${esc(c.draft || '')}" spellcheck="false"></div>`
        : `<div class="thumb" style="${c.image ? `background-image:url('${esc(c.image)}')` : ''}"></div><div class="meta"><i class="fav" style="background-image:url('https://www.google.com/s2/favicons?sz=64&domain=${esc(host(c.url))}')"></i><div><b>${esc(c.title || c.url)}</b><span>${esc(c.desc || host(c.url))}</span></div></div>`;
    case 'todo':
      return `<div class="head">${esc(c.text)}</div><ul>${(c.items || []).map((it, i) => `<li class="${it.done ? 'done' : ''}" data-i="${i}"><input type="checkbox" ${it.done ? 'checked' : ''}><span>${esc(it.t)}</span><button class="li-x" data-act="item-x" title="Remove" aria-label="Remove this item">${Icon('close')}</button></li>`).join('')}</ul><button class="add-item" data-act="item">+ add</button>`;
    case 'swatch':
      return `<div class="chipcol"></div><div class="hex">${c.hideName ? '' : `<b>${esc(c.label || c.hex.toUpperCase())}</b>`}${c.hideHex ? '' : `<span>${esc(c.hex.toUpperCase())}</span>`}</div>`;
  }
  return '';
}

// which cards can be tilted by hand: everything except the things that hold other things (sections, screens, collections) and wireframe pieces (they rotate their own way)
const NO_TILT = typesWith('noTilt');
export const TILTS = c => !NO_TILT.includes(c.type);
// strokes: boxes and screens get a border (solid or dashed); titles, wireframe text and icons get an outline around the letters
const STROKABLE = typesWith('strokable');
export const STROKE_TEXT = ['title', 'text', 'icon'];

export const canStroke = c => STROKABLE.includes(c.type) && !(c.type === 'shape' && c.shape === 'line');

// boxes and screens: the line is drawn (an SVG rect) so it can be solid, dashed or dotted with your own dash length and gap, like Figma
export const skStyle = c => (c.sdash === true ? 'dash' : c.sdash || 'solid');

export function applyStroke(c, el) {
  if (c.type === 'title') {
    const t = el.querySelector('.text');
    if (t) t.style.color = c.tc && c.tc !== 'none' ? c.tc : '';
  } // a title's own text color (applied after its text is drawn)
  if (!canStroke(c)) return;
  const on = !!(c.stroke && c.sw > 0);
  el.classList.toggle('has-stroke', on);
  if (on) {
    el.style.setProperty('--sk', c.stroke);
    el.style.setProperty('--skw', c.sw + 'px');
  } else {
    el.style.removeProperty('--sk');
    el.style.removeProperty('--skw');
  }
  if (c.type !== 'box' && c.type !== 'frame') return;
  let svg = el.querySelector(':scope > .sk-svg');
  if (!on) {
    svg?.remove();
    return;
  }
  if (!svg) {
    el.insertAdjacentHTML(
      'beforeend',
      '<svg class="sk-svg" aria-hidden="true"><rect x="0" y="0" width="100%" height="100%"/></svg>',
    );
    svg = el.querySelector(':scope > .sk-svg');
  }
  const st = skStyle(c),
    w = c.sw,
    r = Math.max(0, (c.type === 'frame' ? (c.radius ?? 0) : c.radius || 0) - w / 2),
    rect = svg.firstChild;
  rect.setAttribute('rx', r);
  rect.setAttribute('ry', r);
  rect.setAttribute('stroke', c.stroke);
  rect.setAttribute('stroke-width', w);
  rect.setAttribute(
    'stroke-dasharray',
    st === 'dash' ? `${c.dl ?? 8} ${c.dg ?? 6}` : st === 'dot' ? `0 ${(c.dg ?? 6) + w}` : 'none',
  );
  rect.setAttribute('stroke-linecap', st === 'dot' ? 'round' : c.cap === 'round' ? 'round' : 'butt');
}

export const titleW = c => (c.type === 'title' && !c.fixedW ? 'max-content' : c.w + 'px');

export function renderCard(c, pop) {
  let el = cardEl(c.id);
  if (!el) {
    el = document.createElement('div');
    el.dataset.id = c.id;
    cardsEl.appendChild(el);
    if (pop) el.classList.add('pop');
  }
  el.className =
    `card ${c.type}` +
    (session.sel.has(c.id) ? ' sel' : '') +
    (isDim(c) ? ' dim' : '') +
    (find.cur === c.id ? ' find-cur' : '') +
    (pop ? ' pop' : '');
  Object.assign(el.style, {
    left: c.x + 'px',
    top: c.y + 'px',
    width: titleW(c),
    height: c.type === 'title' ? 'auto' : c.h + 'px',
  });
  el.classList.toggle('ly-off', !!c.hidden);
  el.classList.toggle('ly-lock', !!c.locked);
  el.classList.toggle('fixedw', !!c.fixedW);
  applyStroke(c, el);
  if (c.type === 'title' || c.type === 'text')
    el.classList.toggle('no-fill', (c.type === 'title' ? c.tc : c.color) === 'none');
  if (SIZED.includes(c.type)) {
    el.style.setProperty('--ta', c.align || 'left');
    el.style.setProperty('--tt', { upper: 'uppercase', lower: 'lowercase', title: 'capitalize' }[c.tcase] || 'none'); // Case: how the words show (what you typed stays as typed)
    if (c.lh != null) el.style.setProperty('--lh', c.lh);
    else el.style.removeProperty('--lh');
    el.classList.toggle('has-lh', c.lh != null);
    if (c.ls != null) el.style.setProperty('--ls', c.ls / 100 + 'em');
    else el.style.removeProperty('--ls');
    el.classList.toggle('has-ls', c.ls != null);
  }
  if (c.type === 'title')
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      if (!c.fixedW && el.offsetWidth) c.w = el.offsetWidth;
      if (el.offsetHeight) c.h = el.offsetHeight;
    });
  el.style.setProperty('--tilt', (c.type === 'stamp' && !c.tilted ? 0 : c.r) + 'deg');
  el.style.setProperty('--fill', COLORS[c.color] || '#fff');
  el.classList.add('c-' + (COLORS[c.color] && c.color !== 'white' ? c.color : 'white'));
  if (c.type === 'swatch') el.style.setProperty('--hex', c.hex);
  el.style.setProperty('--fs', fsMul(c));
  el.classList.toggle('has-font', !!c.font && SIZED.includes(c.type));
  if (c.font && SIZED.includes(c.type)) {
    el.style.setProperty('--cf', `"${String(c.font).replace(/"/g, '')}"`);
    useFont(c.font);
  } else el.style.removeProperty('--cf');
  ['bold', 'italic', 'under', 'strike'].forEach(k => {
    el.classList.toggle('t-' + k, c[k] === true);
    el.classList.toggle('t-no' + k, c[k] === false);
  });
  if (c.type === 'doc') el.classList.toggle('has-body', !!(c.body || '').trim());
  if (c.type === 'audio') {
    el.classList.toggle('paused', !!c.paused);
    if (!c.rec) requestAnimationFrame(() => fitAudio(c, el));
  }
  if (c.type === 'stamp') {
    el.style.setProperty('--sz', c.w + 'px');
    if (c.mv) el.classList.add('mv-' + c.mv);
  }
  if (c.type === 'link') el.classList.toggle('compact', !c.url || !c.image);
  if (c.type === 'canvas' && c.board)
    mini(c.board).then(svg => {
      const p = el.querySelector('.cv-prev');
      if (p && svg) p.innerHTML = svg;
    });
  if (c.type === 'link' && !c.url) setTimeout(() => wireLinkInput(c), 0);
  if (c.type === 'coll') {
    const t = COLL[c.color] || COLL.pink;
    el.style.setProperty('--chead', t[0]);
    el.style.setProperty('--cframe', t[1]);
    el.classList.toggle('nohead', c.head === false);
    el.style.height = c.h + 'px';
  } else if (parentOf(c.id)) el.classList.add('inside');
  if (c.type === 'spotify') {
    const fr = el.querySelector('.sp-frame');
    if (fr && fr.dataset.src === spEmbed(c)) {
      const t = el.querySelector('.sp-head span');
      if (t) t.textContent = c.title || 'Spotify';
      const tg = el.querySelector(':scope > .tag');
      if (tg) tg.textContent = c.tagText || '';
      if (!!tg === !!c.tagText) return el;
    }
  }
  el.innerHTML = `<div class="frame"></div><div class="body">${inner(c)}</div>${c.tagText ? `<div class="tag">${esc(c.tagText)}</div>` : ''}${dueChip(c)}${soloTagAdd(c)}<div class="knob"></div><div class="handle"></div>${TILTS(c) ? '<i class="rot-h" title="Drag to tilt"></i>' : ''}`;
  if (c.type === 'video') setupVideo(c, el);
  if (WF.includes(c.type))
    styleWF(c, el); // after the insides exist
  else applyStroke(c, el);
  if (c.type === 'image') el.style.setProperty('--img-r', (c.radius ?? 12) + 'px');
  return el;
}

// a card on a screen always sits above its screen in the stack (older boards could have them the other way round, which didn't show while screens were pinned to the back)
function keepOnScreens() {
  const at = new Map(session.board.cards.map((c, i) => [c.id, i]));
  if (!session.board.cards.some(c => c.onFrame && at.has(c.onFrame) && at.get(c.id) < at.get(c.onFrame))) return;
  const kids = new Map();
  session.board.cards.forEach(c => {
    if (c.onFrame && at.has(c.onFrame) && at.get(c.id) < at.get(c.onFrame)) {
      if (!kids.has(c.onFrame)) kids.set(c.onFrame, []);
      kids.get(c.onFrame).push(c);
    }
  });
  const moving = new Set([...kids.values()].flat()),
    out = [];
  session.board.cards.forEach(c => {
    if (moving.has(c)) return;
    out.push(c);
    (kids.get(c.id) || []).forEach(k => out.push(k));
  });
  session.board.cards = out;
}

export function renderAll() {
  keepOnScreens();
  wireLayers();
  layersSoon();
  applyColors();
  cardsEl.innerHTML = '';
  session.board.cards.filter(c => c.type === 'coll').forEach(c => renderCard(c));
  session.board.cards.filter(c => c.type !== 'coll').forEach(c => renderCard(c));
  layoutAll();
  renderWires();
  renderTray();
  applyView();
}
