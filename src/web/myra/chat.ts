import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { tilt } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { hasDue } from '../features/due.ts';
import { timerRequest } from '../features/duration.ts';
import { hideSlash, slash } from '../features/find.ts';
import { myTpls } from '../features/templates.ts';
import { clearGlow, runTimerRequest } from '../features/timer.ts';
import { foldersIn, looseFolders } from '../library/tree.ts';
import type { SayAction } from '../settings/licenses.ts';
import { reply } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { elementById, textField } from '../ui/dom.ts';
import { aiGrants, gatherVault, gatherVaultTasks, updateVaultChip, type VaultTasksUsed } from '../vault/ask.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { animIntent, animRequest, pickAnim, playAnim } from './anim.ts';
import { applyMyra } from './apply.ts';
import { birthdayFacts } from './birthday.ts';
import { addMsg, archiveChat, chatKeep, chatLog, renderChat, typing } from './chatLog.ts';
import { chatOpen, myraOpen } from './chatWindow.ts';
import { goo } from './goos.ts';
import { SLASH } from './greet.ts';
import { showConnections } from './helpers.ts';

import { initPerch, wonderIfEmpty } from './perch.ts';
import { parse } from './replyText.ts';

// what Myra sees: the cards (trimmed), where they are, what's selected, and what's in Unsorted
export function snapshot() {
  const brief = (c: Card) =>
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
          kids: 'kids' in c ? c.kids : undefined,
          desc: c.desc,
          body: 'body' in c && c.body ? c.body.slice(0, 600) : undefined,
          shape: 'shape' in c ? c.shape : undefined,
          label: c.tagText,
          tags: (c.tags || []).length ? c.tags : undefined,
          due: hasDue(c) ? c.due : undefined,
          items: 'items' in c && c.items ? c.items.map(i => i.t) : undefined,
          hex: c.hex,
          url: 'url' in c ? c.url : undefined,
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
    recentChat: (chatKeep() === 'off' ? chatLog().slice(-2) : chatLog().slice(-8)).map(
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
        folder: appState.folders.find(f => f.id === b.folder)?.name || null,
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

// set when Claude Code answered that it isn't signed in, so the next offline line offers the how-to
let signinHint = false;

function offlineMyra(q: string, why: string) {
  const tr = timerRequest(q);
  if (tr) {
    runTimerRequest(tr, true);
    return;
  }
  const an = animIntent(q);
  if (an) {
    playAnim(an === '*' ? pickAnim() : an);
    return;
  }
  if (/group|sort|organi[sz]e|tidy|line up/i.test(q)) {
    const n = tidyNotes();
    if (n) {
      reply(`I lined your ${n} notes up in tidy rows ✦ ${why}`, 9000);
      return;
    }
  }
  reply(
    `${why} Everything else on the board works without me thinking ✦`,
    0,
    (appState.haveClaude === false || signinHint) && settings.ai
      ? [{ label: 'Show me how to connect', run: () => Fenmyr.openURL(GUIDE) }]
      : [],
  );
  signinHint = false;
}

export const GUIDE = 'https://github.com/chiangs/fenmyr#connect-claude-code';
// the step-by-step page for connecting Claude Code
export const SIGNIN = /log ?in|api key|auth|credential|subscription|not (signed|logged)|oauth|unauthori[sz]ed|401|403/i;

// the web demo: Myra tidies for real, and for anything that needs AI she points you to the desktop app
export const getApp = () => Fenmyr.openURL(Fenmyr.getURL || 'https://github.com/chiangs/fenmyr/releases/latest');
// the button under her web-demo lines: get the desktop app
export let DL: SayAction[] = [];

function webMyra(q: string) {
  const tr = timerRequest(q);
  if (tr) {
    runTimerRequest(tr, true);
    return;
  }
  const an = animIntent(q);
  if (an) {
    playAnim(an === '*' ? pickAnim() : an);
    return;
  }
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

export async function ask(q: string, confirmed = false) {
  const did: string[] = []; // what the app already did for this sentence, so her answer can go with it
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
  const ctx: { asked: boolean; used: Awaited<ReturnType<typeof gatherVault>>; tasks: VaultTasksUsed | null } = {
    asked: false,
    used: [],
    tasks: null,
  };
  if (appState.vaultChip && aiGrants(session.board).length) {
    ctx.asked = true;
    try {
      ctx.tasks = await gatherVaultTasks(q);
      ctx.used = ctx.tasks ? [] : await gatherVault(q);
    } catch (_e) {}
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
        ...(ctx.tasks ? { vaultTasks: { items: ctx.tasks.items, summary: ctx.tasks.summary } } : {}),
      },
    );
    await applyMyra(parse(raw), q, ctx);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if (/Claude Code/.test(why)) {
      appState.haveClaude = false;
      return offlineMyra(
        q,
        "I need Claude Code on this computer to think. It's a one-time setup with your Claude account.",
      );
    }
    if (SIGNIN.test(why)) {
      signinHint = true;
      return offlineMyra(
        q,
        "Claude Code is here, but it isn't signed in yet. Open a terminal, type claude, and sign in with a Claude Pro or Max account.",
      );
    }
    reply(`Hmm, I couldn't reach Claude: ${why}`);
  } finally {
    $('myra').classList.remove('thinking');
    goo.think(false);
    typing(false);
  }
}
export function init31() {
  // ---------- with the chat open she perches on the top left of the input box (under her latest reply), and hops back to her button when it closes ----------
  initPerch();

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
    if (chatKeep() === 'board') {
      session.board.chat = [];
      save();
    } else chatLog().length = 0;
    appState.histOpen = false;
    renderChat();
    textField('mcInput').focus();
    if (!chatLog().length) playAnim('curious', false);
  };
  // a fresh, empty chat: she tilts her head and wonders what you will ask
  $('mcHist').onclick = () => {
    appState.histOpen = !appState.histOpen;
    renderChat();
  };

  const chatIn = textField('mcInput'),
    chatForm = elementById('mcForm', HTMLFormElement);
  chatForm.onsubmit = e => {
    e.preventDefault();
    const q = chatIn.value.trim();
    if (!q) return;
    chatIn.value = '';
    chatIn.style.height = '';
    hideSlash();
    if (q[0] === '/') return slash(q);
    chatIn.placeholder = 'Ask Myra… “group these by theme”';
    ask(q);
  };

  chatIn.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
    if (e.key === 'Escape') {
      myraOpen(false);
      e.stopPropagation();
    }
  };

  chatIn.oninput = () => {
    const t = chatIn;
    t.style.height = 'auto';
    t.style.height = `${Math.min(120, t.scrollHeight)}px`;
  };

  $('mChat').addEventListener('pointerdown', e => e.stopPropagation());

  appState.haveClaude = null;

  DL = [
    { label: 'Download Fenmyr ✦', run: getApp },
    { label: 'Keep playing', ghost: true, run: () => {} },
  ];
  appState.aiAnimAt = 0;

  const pillIn = textField('mInput');
  $('mForm').onsubmit = e => {
    e.preventDefault();
    const q = pillIn.value.trim();
    if (!q) return;
    pillIn.value = '';
    if (q[0] === '/') return slash(q);
    myraOpen(false);
    pillIn.placeholder = 'Ask Myra… “group these by theme”';
    ask(q);
  };
}
