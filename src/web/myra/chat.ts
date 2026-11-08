import { renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { tilt } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { timerRequest } from '../features/duration.ts';
import { clearGlow, runTimerRequest } from '../features/timer.ts';
import { settings } from '../settings/settings.ts';
import { elementById, textField } from '../ui/dom.ts';
import { aiGrants, gatherVault, gatherVaultTasks, type VaultTasksUsed } from '../vault/ask.ts';
import { animIntent, animRequest, pickAnim, playAnim } from './anim.ts';
import { applyHeld, holdReply, Turn } from './apply.ts';
import type { Picked } from './applyTypes.ts';
import { initChatInput, setChatText } from './chatInput.ts';
import { addMsg, archiveChat, chatKeep, chatLog, renderChat } from './chatLog.ts';
import { chatOpen, myraOpen, renderHint } from './chatWindow.ts';
import { showConnections } from './helpers.ts';
import { initPerch, wonderIfEmpty } from './perch.ts';
import { parse } from './replyText.ts';
import type { SayAction } from './say.ts';
import { reply } from './say.ts';
import type { Sees } from './sees.ts';
import { takeSees } from './seesStrip.ts';
import { initSlashMenu, slash } from './slash.ts';
import { snapshot } from './snapshot.ts';
import { initStatus, noteSignIn, paintStatus, startJob } from './status.ts';

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
  // she just learned she can't think, so the header stops saying Ready
  paintStatus();
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

// A question as it was asked. `did`: what the app already did for the sentence; `sees`: what the "Myra sees" strip sent
// with it.
type Asked = { q: string; confirmed: boolean; did: string[]; sees: Sees };

// The person's line shows at once, and so does what the app can do for the sentence by itself (a timer, an
// animation). Her answer waits its turn, so it sees the board the previous reply left, but it keeps the selection, the
// vaults and the web the question was sent with. `sees`: a question asked again keeps what it was first sent with.
export function ask(q: string, confirmed = false, sees?: Sees) {
  const asked: Asked = { q, confirmed, did: confirmed ? [] : actOnSentence(q), sees: sees ?? takeSees() };
  if (!chatOpen()) myraOpen(true);
  if (!confirmed) addMsg('me', q);
  return Turn.take(turn => answer(turn, asked), session.board.id);
}

// what the app already did for this sentence, so her answer can go with it
function actOnSentence(q: string) {
  const did: string[] = [];
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
  return did;
}

async function answer(turn: Turn, { q, confirmed, did, sees }: Asked) {
  if (!turn.stillOpen()) return;
  if (Fenmyr.web) return webMyra(q);
  if (!settings.ai) return offlineMyra(q, 'My thinking is switched off in Settings, so I can only do simple tidying.');
  if (appState.haveClaude === false) {
    await showConnections(true);
    if (appState.haveClaude === false)
      return offlineMyra(
        q,
        "I need Claude Code on this computer to think. It's a one-time setup with your Claude account.",
      );
  } // look again first: they may have just set it up
  if (!navigator.onLine)
    return offlineMyra(q, "You're offline, so I can't think with Claude right now. I'll be back when the internet is.");
  if (confirmed) addMsg('myra', 'Making it… this can take a minute ✦');
  const job = startJob({ kind: 'thinking' });
  const ctx: Picked & { tasks: VaultTasksUsed | null; web: boolean } = {
    asked: false,
    used: [],
    tasks: null,
    web: sees.web && !!settings.webAccess,
    sees,
  };
  // a vault whose access was taken away after the question was sent is not read
  const grants = aiGrants(session.board).filter(g => sees.vaults.includes(g.vault));
  if (grants.length) {
    ctx.asked = true;
    try {
      ctx.tasks = await gatherVaultTasks(q, grants);
      ctx.used = ctx.tasks ? [] : await gatherVault(q, grants);
    } catch (_e) {}
    const notes = ctx.tasks ? ctx.tasks.notes : ctx.used.length;
    if (notes) job.show({ kind: 'reading', notes });
  }
  const canVault = !ctx.asked && aiGrants(session.board).length > 0;
  try {
    const raw = await Fenmyr.ask(
      (window.myraName && window.myraName !== 'Myra'
        ? `(The person named you ${window.myraName}. That's your name now; sign off and refer to yourself that way.) `
        : '') +
        q +
        (did.filter(Boolean).length
          ? ` (The app has already done this for them: ${did.filter(Boolean).join('; ')}. Do not claim you cannot. Answer in a short line.)`
          : ''),
      snapshot(new Set(sees.sel)),
      confirmed,
      {
        mobbin: settings.mobbin,
        higgs: settings.higgs,
        web: ctx.web,
        canVault,
        vaultNotes: ctx.used.map(n => ({ vault: n.vault, path: n.rel, title: n.title, tags: n.tags, text: n.text })),
        ...(ctx.tasks ? { vaultTasks: { items: ctx.tasks.items, summary: ctx.tasks.summary } } : {}),
      },
    );
    noteSignIn(false);
    await applyHeld(turn, await holdReply(parse(raw), q, ctx));
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
      noteSignIn(true);
      return offlineMyra(
        q,
        "Claude Code is here, but it isn't signed in yet. Open a terminal, type claude, and sign in with a Claude Pro or Max account.",
      );
    }
    reply(`Hmm, I couldn't reach Claude: ${why}`);
  } finally {
    job.end();
  }
}
export function init31() {
  initStatus();
  // with the chat open she perches at the start of its header, and hops back to her box when it closes
  initPerch();

  // her box only opens the chat; the chat's own rules close it
  $('mPill').onclick = () => {
    clearGlow();
    const was = chatOpen();
    myraOpen(true);
    if (!was) wonderIfEmpty();
  };

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
    setChatText('');
    if (!q) return;
    if (q[0] === '/') return slash(q);
    renderHint();
    ask(q);
  };

  initChatInput();
  initSlashMenu();

  $('mChat').addEventListener('pointerdown', e => e.stopPropagation());

  appState.haveClaude = null;

  DL = [
    { label: 'Download Fenmyr ✦', run: getApp },
    { label: 'Keep playing', ghost: true, run: () => {} },
  ];
  appState.aiAnimAt = 0;
}
