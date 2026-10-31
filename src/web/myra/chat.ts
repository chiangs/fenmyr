// @ts-nocheck
import { esc, renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { tilt, uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { hideSlash, slash } from '../features/find.ts';
import { myTpls } from '../features/templates.ts';
import { clearGlow, parse, runTimerRequest, timerRequest } from '../features/timer.ts';
import { foldersIn, looseFolders } from '../library/tree.ts';
import { animIntent, animRequest, liveOff, liveOn, pickAnim, playAnim } from './anim.ts';
import { applyMyra } from './apply.ts';
import { birthdayFacts } from './birthday.ts';
import { chatOpen, myraOpen } from './chatWindow.ts';
import { goo } from './goos.ts';
import { SLASH } from './greet.ts';
import { showConnections } from './helpers.ts';
import { reply } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { aiGrants, gatherVault, updateVaultChip } from '../vault/ask.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { appState, session } from '../core/state.ts';
export let gooSlot;

export let perched = false;
let gooAt = { x: 0, y: 0 };
let gooAnim = null;
let dizzyAt = 0;

const gooMove = t => {
  gooAt = t;
  gooSlot.style.transform = `translate(${t.x}px, ${t.y}px)`;
};

function perchTarget() {
  // layout values only (never her own transform), so it is right while she squashes, leans and flies, and while the chat is still fading in
  const my = $('myra').getBoundingClientRect(),
    chat = $('mChat'),
    cs = getComputedStyle(chat),
    form = $('mcForm'),
    pill = $('mPill'),
    pr = pill.getBoundingClientRect();
  const baseL = pr.left + (gooSlot.offsetLeft - pill.offsetLeft),
    baseT = pr.top + (gooSlot.offsetTop - pill.offsetTop); // where her slot sits in the button
  const chatL = my.right - parseFloat(cs.right) - chat.offsetWidth,
    chatT = my.bottom - parseFloat(cs.bottom) - chat.offsetHeight;
  return { x: chatL + form.offsetLeft + 12 - baseL, y: chatT + form.offsetTop + 6 - gooSlot.offsetHeight - baseT };
}

// her hop is one gooey jump, no springs: a short wind-up, then she stretches along the line she is travelling (diagonally up and left leaving the button, up and right going home), most when
// she is fastest and round again near the top of the arc, with a soft wobble just after she leaves the ground; she slows towards the top and quickens a little coming down; on landing she squashes
// once and settles. The landing spot is fixed when she takes off (measured again at touchdown), so she can never drift past the edge of the chat.
const HOP = { stretch: 0.3, wobble: 0.3, arc: 100, up: 480, home: 431, squash: 0.35, wind: 140, land: 300 };

const gooPose = (p, tf) => {
  gooAt = p;
  gooSlot.style.transform = `translate(${p.x}px, ${p.y}px)${tf || ''}`;
};

const gooRest = () => {
  gooSlot.style.transformOrigin = '';
};

function flyGoo(to, instant) {
  const from = gooAt;
  if (gooAnim) {
    gooAnim.stop();
    gooAnim = null;
  }
  const done = () => {
    if (appState.flightLive) {
      appState.flightLive = false;
      liveOff();
    }
  };
  if (instant || (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1)) {
    gooRest();
    gooMove(to);
    done();
    return;
  }
  if (!appState.flightLive) {
    appState.flightLive = true;
    liveOn();
  }
  gooRest();
  const up = to.y < from.y,
    WIND = up ? HOP.wind : HOP.wind * 0.6,
    AIR = up ? HOP.up : HOP.home,
    h = HOP.arc * (up ? 1 : 0.7),
    LAND = HOP.land;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    vref = Math.hypot(Math.abs(dx), Math.abs(dy) + 4 * h) / AIR;
  const t0 = performance.now(),
    sm = k => k * k * (3 - 2 * k),
    lerp = (a, b, k) => a + (b - a) * k;
  let target = to,
    landFrom = null,
    raf = 0,
    stopped = false;
  const step = now => {
    if (stopped) return;
    const e = now - t0;
    if (e < WIND) {
      const k = sm(e / WIND);
      gooPose(from, ` scale(${1 + (0.1 * k * HOP.squash) / 0.35}, ${1 - (0.14 * k * HOP.squash) / 0.35})`);
    } // a small crouch before she leaves
    else if (e < WIND + AIR) {
      gooSlot.style.transformOrigin = '50% 55%';
      const t = e - WIND,
        k = t / AIR,
        x = from.x + dx * k,
        y = from.y + dy * k - 4 * h * k * (1 - k);
      const vx = dx / AIR,
        vy = dy / AIR - (4 * h * (1 - 2 * k)) / AIR,
        sp = Math.hypot(vx, vy) / vref,
        th = Math.atan2(vy, vx);
      const el = sm(Math.min(1, sp)),
        along = 1 + HOP.stretch * el + HOP.wobble * 0.4 * Math.exp(-t / 170) * Math.sin(t / 34),
        across = 1 / Math.sqrt(along);
      gooPose({ x, y }, ` rotate(${th}rad) scale(${along}, ${across}) rotate(${-th}rad)`);
    } else {
      const l = e - WIND - AIR;
      if (!landFrom) {
        landFrom = { x: from.x + dx, y: from.y + dy };
        gooRest();
        target = perched ? perchTarget() : { x: 0, y: 0 };
      } // where the landing spot is now
      if (l >= LAND) {
        gooRest();
        gooMove(target);
        gooAnim = null;
        done();
        return;
      }
      const sq = Math.exp(-l / 85) * Math.cos(l / 40),
        blend = Math.min(1, l / 120);
      gooPose(
        { x: lerp(landFrom.x, target.x, blend), y: lerp(landFrom.y, target.y, blend) },
        ` scale(${1 + 0.55 * HOP.squash * sq}, ${1 - HOP.squash * sq})`,
      );
    }
    raf = requestAnimationFrame(step);
  };
  gooAnim = {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
  raf = requestAnimationFrame(step);
}

export function perchGoo(on) {
  const hidden = document.body.classList.contains('phone') || getComputedStyle($('mPill')).display === 'none';
  if (hidden) return;
  const now = Date.now();
  appState.toggleLog = appState.toggleLog.filter(t => now - t < 3000);
  appState.toggleLog.push(now);
  if (appState.dizzyAuto && appState.toggleLog.length >= 4 && now - dizzyAt > 8000) {
    dizzyAt = now;
    appState.toggleLog = [];
    setTimeout(() => playAnim('dizzy', false), 350);
  } // toggled over and over: she gets dizzy
  perched = on;
  gooSlot.classList.toggle('perched', on);
  flyGoo(
    on ? perchTarget() : { x: 0, y: 0 },
    window.myraMuted || matchMedia('(prefers-reduced-motion: reduce)').matches,
  ); // calmest and reduced motion: she just appears
}

export const keepPerch = () => {
  if (perched && !gooAnim) gooMove(perchTarget());
};
let perchWatch;
// click her in the chat and she does something
// you opened an empty chat (the button or M): once she has landed by the input she tilts her head, wondering what you'll ask. (Not when a question opens it, and not when you're toggling it over and over: then she is dizzy.)
export const wonderIfEmpty = () =>
  setTimeout(
    () => {
      if (chatOpen() && !chatLog().length && Date.now() - dizzyAt > 2500 && !$('myra').classList.contains('thinking'))
        playAnim('curious', false);
    },
    window.myraMuted ? 150 : 700,
  );

// earlier chats: when chats are saved with the board, New chat puts the current one away (the last 10 are kept) and History brings one back
const CHATS_KEPT = 10;

const keepsHistory = () => settings.chatKeep === 'board' && !!session.board;

function archiveChat() {
  if (!keepsHistory() || !(session.board.chat || []).length) return;
  const msgs = session.board.chat,
    first = msgs.find(m => m.who === 'me') || msgs[0];
  session.board.chats = [
    {
      id: uid(),
      title: String(first.text || 'Chat')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70),
      t: msgs[msgs.length - 1].t || Date.now(),
      msgs,
    },
    ...(session.board.chats || []),
  ].slice(0, CHATS_KEPT);
}

const whenText = t => {
  const d = new Date(t),
    days = Math.floor((Date.now() - t) / 864e5);
  return days < 1
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : days < 7
      ? d.toLocaleDateString([], { weekday: 'short' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

function renderHistory() {
  const list = $('mcList'),
    chats = session.board.chats || [];
  list.innerHTML =
    `<div class="mc-hist"><div class="mh-top"><button class="mc-btn" data-h="back">← Back to this chat</button><span>Earlier chats on this board</span></div>` +
    (chats.length
      ? chats
          .map(
            (c, i) =>
              `<div class="mh-row" data-i="${i}"><button class="mh-open" data-h="open"><b></b><small>${esc(whenText(c.t))} · ${c.msgs.length} message${c.msgs.length === 1 ? '' : 's'}</small></button><button class="mh-del" data-h="del" title="Delete this chat">×</button></div>`,
          )
          .join('')
      : '<div class="mc-empty">No earlier chats yet. New chat puts the current one here.</div>') +
    '</div>';
  list.querySelectorAll('.mh-row').forEach(r => (r.querySelector('b').textContent = chats[+r.dataset.i].title));
  list.onclick = e => {
    const a = e.target.closest('[data-h]')?.dataset.h;
    if (!a) return;
    e.stopPropagation();
    const i = +e.target.closest('.mh-row')?.dataset.i;
    if (a === 'back') {
      appState.histOpen = false;
      return renderChat();
    }
    if (a === 'del') {
      const del = e.target.closest('.mh-del');
      if (!del.classList.contains('sure')) {
        del.classList.add('sure');
        del.textContent = 'Delete?';
        return;
      }
      session.board.chats.splice(i, 1);
      save();
      return renderChat();
    }
    if (a === 'open') {
      const c = session.board.chats.splice(i, 1)[0];
      archiveChat();
      session.board.chat = c.msgs;
      save();
      appState.histOpen = false;
      renderChat();
      $('mcInput').focus();
    }
  };
}

const IDEAS = [
  'Group these by theme',
  'What am I missing?',
  'Make a checklist from this',
  'Find onboarding screens on Mobbin',
];

function msgEl(m) {
  const d = document.createElement('div');
  d.className = 'mc-msg ' + m.who;
  d.textContent = m.text;
  if (m.acts?.length) {
    const box = document.createElement('div');
    box.className = 'm-acts';
    m.acts.forEach(a => {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.className = a.cls || (a.ghost ? 'ghost' : '');
      b.onclick = () => {
        box.remove();
        a.run();
      };
      box.appendChild(b);
    });
    d.appendChild(box);
  }
  return d;
}

export function renderChat() {
  $('mcHist').hidden = !(keepsHistory() && ((session.board.chats || []).length || appState.histOpen));
  $('mcHist').classList.toggle('on', appState.histOpen);
  if (appState.histOpen && keepsHistory()) return renderHistory();
  appState.histOpen = false;
  const list = $('mcList');
  list.onclick = null;
  list.innerHTML = '';
  const msgs = chatLog();
  if (!msgs.length) {
    list.innerHTML = `<div class="mc-empty"><b>Hi! I'm Myra ✦</b>Ask me to sort, write, plan or find things for this board.<div class="mc-ideas">${IDEAS.filter(
      i => settings.mobbin || !/Mobbin/.test(i),
    )
      .map(i => `<button>${i}</button>`)
      .join('')}</div></div>`;
    list.querySelectorAll('.mc-ideas button').forEach(
      b =>
        (b.onclick = () => {
          ask(b.textContent);
        }),
    );
    return;
  }
  msgs.forEach(m => list.appendChild(msgEl(m)));
  list.scrollTop = list.scrollHeight;
}

// where a chat lives depends on Settings: saved with the board, kept only until Myra quits, or not kept at all
export const sessionChats = {};

function chatLog() {
  if (!session.board) return [];
  if (settings.chatKeep === 'board') return (session.board.chat = session.board.chat || []);
  return (sessionChats[session.board.id] = sessionChats[session.board.id] || []);
}

export function addMsg(who, text, acts = []) {
  if (!session.board) return;
  if (appState.histOpen) {
    appState.histOpen = false;
    renderChat();
  }
  const log = chatLog(),
    m = { who, text, t: Date.now() },
    max = +settings.chatMax || 60;
  log.push(m);
  if (log.length > max) log.splice(0, log.length - max);
  if (settings.chatKeep === 'board') save();
  const list = $('mcList');
  list.querySelector('.mc-empty')?.remove();
  list.appendChild(msgEl({ ...m, acts }));
  list.scrollTop = list.scrollHeight;
}

export function typing(on) {
  $('mcList').querySelector('.typing')?.remove();
  $('mcStatus').textContent = on ? 'thinking…' : '';
  if (on) {
    const d = document.createElement('div');
    d.className = 'mc-msg myra typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    $('mcList').appendChild(d);
    $('mcList').scrollTop = 1e9;
  }
}

// what Myra sees: the cards (trimmed), where they are, what's selected, and what's in Unsorted
export function snapshot() {
  const brief = c =>
    c.type === 'vnote'
      ? { id: c.id, type: 'vnote', x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }
      : {
          id: c.id,
          type: c.type,
          x: Math.round(c.x),
          y: Math.round(c.y),
          w: Math.round(c.w),
          h: Math.round(c.h),
          color: c.color,
          text: (c.text || c.title || c.label || '').slice(0, 300),
          font: c.font,
          name: c.name,
          kids: c.kids,
          desc: c.desc,
          body: c.body ? c.body.slice(0, 600) : undefined,
          shape: c.shape,
          label: c.tagText,
          tags: (c.tags || []).length ? c.tags : undefined,
          due: c.type === 'note' ? c.due : undefined,
          items: c.items ? c.items.map(i => i.t) : undefined,
          hex: c.hex,
          url: c.url,
          selected: session.sel.has(c.id) || undefined,
        };
  return {
    today: `${new Date().toDateString()}, ${new Date().toTimeString().slice(0, 5)}`,
    name: session.board.name,
    boardTags: session.board.tags || [],
    myTemplates: myTpls.map(t => t.name),
    cards: session.board.cards.map(brief),
    links: session.board.links.map(l => [l.a, l.b]),
    unsorted: session.board.tray.map(brief),
    boardColors: session.board.palette,
    fontsOnThisComputer: FONTS.filter(f => !/^(\.|Apple |System|STIX|Noto Sans [A-Z][a-z]+ [A-Z])/.test(f)).slice(
      0,
      400,
    ),
    recentChat: (settings.chatKeep === 'off' ? chatLog().slice(-2) : chatLog().slice(-8)).map(
      m => `${m.who === 'me' ? 'Person' : 'Myra'}: ${m.text}`,
    ),
    myraStyle: { name: settings.name || '', chat: settings.chat, emoji: !!settings.emoji }, // the host turns these into words (TONES in linux/prompts.js)
    commands: SLASH.filter(c => !c.dev).map(c => ({ cmd: c.cmd, arg: c.arg, desc: c.desc, ex: c.ex, opts: c.opts })),
    person: birthdayFacts(), // the slash commands, so she knows every one (the host puts them in her instructions)
    library: {
      projects: appState.projects.map(p => ({ name: p.name, folders: foldersIn(p.id).map(f => f.name) })),
      foldersNotInAProject: looseFolders().map(f => f.name),
      boards: appState.boardList.map(b => ({
        id: b.id,
        name: b.name,
        folder: (appState.folders.find(f => f.id === b.folder) || {}).name || null,
        current: b.id === session.board.id || undefined,
      })),
    },
  };
}

// without AI (switched off, or Claude Code not installed) Myra still helps with the simple stuff, right here on your computer
export function tidyNotes() {
  const notes = session.board.cards.filter(c => c.type === 'note' && !parentOf(c.id));
  if (!notes.length) return 0;
  const x0 = Math.min(...notes.map(c => c.x)),
    y0 = Math.min(...notes.map(c => c.y));
  notes.forEach((c, i) => {
    c.x = x0 + (i % 4) * 250;
    c.y = y0 + Math.floor(i / 4) * 180;
    c.r = tilt();
    renderCard(c);
  });
  renderWires();
  save();
  return notes.length;
}

function offlineMyra(q, why) {
  {
    const tr = timerRequest(q);
    if (tr) return void runTimerRequest(tr, true);
  }
  const an = animIntent(q);
  if (an) return void playAnim(an === '*' ? pickAnim() : an);
  if (/group|sort|organi[sz]e|tidy|line up/i.test(q)) {
    const n = tidyNotes();
    if (n) return reply(`I lined your ${n} notes up in tidy rows ✦ ${why}`, 9000);
  }
  reply(
    `${why} Everything else on the board works without me thinking ✦`,
    0,
    (appState.haveClaude === false || offlineMyra.signin) && settings.ai
      ? [{ label: 'Show me how to connect', run: () => Fenmyr.openURL(GUIDE) }]
      : [],
  );
  offlineMyra.signin = false;
}

export const GUIDE = 'https://github.com/chiangs/fenmyr#connect-claude-code';
// the step-by-step page for connecting Claude Code
export const SIGNIN = /log ?in|api key|auth|credential|subscription|not (signed|logged)|oauth|unauthori[sz]ed|401|403/i;

// the web demo: Myra tidies for real, and for anything that needs AI she points you to the desktop app
export const getApp = () => Fenmyr.openURL(Fenmyr.getURL || 'https://github.com/chiangs/fenmyr/releases/latest');
export let DL;

function webMyra(q) {
  {
    const tr = timerRequest(q);
    if (tr) return void runTimerRequest(tr, true);
  }
  const an = animIntent(q);
  if (an) return void playAnim(an === '*' ? pickAnim() : an);
  const notes = session.board.cards.filter(c => c.type === 'note' && !parentOf(c.id));
  if (/group|sort|organi[sz]e|tidy|line up/i.test(q) && notes.length)
    return offlineMyra(q, 'In the desktop app I can sort them by theme too, with Claude.');
  const what = /mobbin/i.test(q)
    ? 'Mobbin lives in your Claude account, and I can only reach it from the desktop app.'
    : /higgsfield|photo|picture|image/i.test(q)
      ? 'Making pictures with Higgsfield happens in the desktop app, where I can check the price with you first.'
      : 'I think with Claude Code, and that lives in the desktop app.';
  reply(
    `I'd love to help with that! ${what} Download me and I'll connect to your Claude, Mobbin and Higgsfield ✦`,
    0,
    DL,
  );
}

export let animAskedAt = 0;
export let timerAskedAt = 0;

export async function ask(q, confirmed = false) {
  const did = []; // what the app already did for this sentence, so her answer can go with it
  if (!confirmed) {
    const an = animRequest(q);
    if (an) {
      animAskedAt = Date.now();
      const n = an === '*' ? pickAnim() : an;
      if (playAnim(n, false)) did.push(`played her ${n} animation`);
    }
    const tr = timerRequest(q);
    if (tr) {
      timerAskedAt = Date.now();
      did.push(runTimerRequest(tr));
    }
  }
  if (Fenmyr.web) {
    if (!chatOpen()) myraOpen(true);
    addMsg('me', q);
    return webMyra(q);
  }
  if (!settings.ai || appState.haveClaude === false) {
    if (!chatOpen()) myraOpen(true);
    addMsg('me', q);
  }
  if (!settings.ai) return offlineMyra(q, 'My thinking is switched off in Settings, so I can only do simple tidying.');
  if (appState.haveClaude === false) {
    await showConnections(true);
    if (appState.haveClaude === false)
      return offlineMyra(
        q,
        "I need Claude Code on this computer to think. It's a one-time setup with your Claude account.",
      );
  } // look again first: they may have just set it up
  if (!navigator.onLine) {
    if (!chatOpen()) myraOpen(true);
    addMsg('me', q);
    return offlineMyra(q, "You're offline, so I can't think with Claude right now. I'll be back when the internet is.");
  }
  if (!chatOpen()) myraOpen(true);
  if (!confirmed) addMsg('me', q);
  else addMsg('myra', 'Making it… this can take a minute ✦');
  $('myra').classList.add('thinking');
  goo.think(true);
  typing(true);
  const ctx = { asked: false, used: [] };
  if (appState.vaultChip && aiGrants(session.board).length) {
    ctx.asked = true;
    try {
      ctx.used = await gatherVault(q);
    } catch (e) {}
  }
  const canVault = !ctx.asked && aiGrants(session.board).length > 0;
  appState.vaultChip = false;
  updateVaultChip();
  try {
    const raw = await Fenmyr.ask(
      (window.myraName && window.myraName !== 'Myra'
        ? `(The person named you ${window.myraName}. That's your name now; sign off and refer to yourself that way.) `
        : '') +
        q +
        (did.filter(Boolean).length
          ? ` (The app has already done this for them: ${did.filter(Boolean).join('; ')}. Do not claim you cannot. Answer in a short line.)`
          : ''),
      snapshot(),
      confirmed,
      {
        mobbin: settings.mobbin,
        higgs: settings.higgs,
        web: !!settings.webAccess,
        canVault,
        vaultNotes: ctx.used.map(n => ({ vault: n.vault, path: n.rel, title: n.title, tags: n.tags, text: n.text })),
      },
    );
    await applyMyra(parse(raw), q, ctx);
  } catch (err) {
    if (/Claude Code/.test(err.message)) {
      appState.haveClaude = false;
      return offlineMyra(
        q,
        "I need Claude Code on this computer to think. It's a one-time setup with your Claude account.",
      );
    }
    if (SIGNIN.test(err.message)) {
      offlineMyra.signin = true;
      return offlineMyra(
        q,
        "Claude Code is here, but it isn't signed in yet. Open a terminal, type claude, and sign in with a Claude Pro or Max account.",
      );
    }
    reply("Hmm, I couldn't reach Claude: " + err.message);
  } finally {
    $('myra').classList.remove('thinking');
    goo.think(false);
    typing(false);
  }
}
export function init31() {
  // ---------- with the chat open she perches on the top left of the input box (under her latest reply), and hops back to her button when it closes ----------
  gooSlot = $('gooSlot');
  appState.toggleLog = [];
  appState.dizzyAuto = true;

  addEventListener('resize', keepPerch);
  perchWatch = new ResizeObserver(keepPerch);
  [$('mChat'), $('mPill'), $('myra')].forEach(el => perchWatch.observe(el));
  // the button changing width (a label appearing) moves the whole bar, and the chat with it
  gooSlot.addEventListener('click', e => {
    if (!perched) return;
    e.stopPropagation();
    playAnim(pickAnim(), false);
  });

  $('mPill').onclick = () => {
    clearGlow();
    const opening = !chatOpen();
    myraOpen(opening);
    if (opening) wonderIfEmpty();
  };

  $('mcClose').onclick = () => myraOpen(false);
  appState.histOpen = false;

  $('mcNew').onclick = () => {
    archiveChat();
    if (settings.chatKeep === 'board') {
      session.board.chat = [];
      save();
    } else chatLog().length = 0;
    appState.histOpen = false;
    renderChat();
    $('mcInput').focus();
    if (!chatLog().length) playAnim('curious', false);
  };
  // a fresh, empty chat: she tilts her head and wonders what you will ask
  $('mcHist').onclick = () => {
    appState.histOpen = !appState.histOpen;
    renderChat();
  };

  $('mcForm').onsubmit = e => {
    e.preventDefault();
    const q = $('mcInput').value.trim();
    if (!q) return;
    $('mcInput').value = '';
    $('mcInput').style.height = '';
    hideSlash();
    if (q[0] === '/') return slash(q);
    $('mcInput').placeholder = 'Ask Myra… “group these by theme”';
    ask(q);
  };

  $('mcInput').onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('mcForm').requestSubmit();
    }
    if (e.key === 'Escape') {
      myraOpen(false);
      e.stopPropagation();
    }
  };

  $('mcInput').oninput = () => {
    const t = $('mcInput');
    t.style.height = 'auto';
    t.style.height = Math.min(120, t.scrollHeight) + 'px';
  };

  $('mChat').addEventListener('pointerdown', e => e.stopPropagation());

  appState.haveClaude = null;

  DL = [
    { label: 'Download Fenmyr ✦', run: getApp },
    { label: 'Keep playing', ghost: true, run: () => {} },
  ];
  appState.aiAnimAt = 0;

  $('mForm').onsubmit = e => {
    e.preventDefault();
    const q = $('mInput').value.trim();
    if (!q) return;
    $('mInput').value = '';
    if (q[0] === '/') return slash(q);
    myraOpen(false);
    $('mInput').placeholder = 'Ask Myra… “group these by theme”';
    ask(q);
  };
}
