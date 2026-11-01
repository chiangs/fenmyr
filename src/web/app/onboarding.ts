// @ts-nocheck
import { fit } from '../canvas/handles.ts';
import { renderAll } from '../canvas/render.ts';
import { renderTray, renderWires } from '../canvas/wires.ts';
import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { closeHome, homeAt, openBoard } from '../library/home.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { foldersIn } from '../library/tree.ts';
import { newBoard } from '../model/boards.ts';
import { ask, getApp } from '../myra/chat.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { goos, hopMyra } from '../myra/goos.ts';
import { showConnections } from '../myra/helpers.ts';
import { closeSettings } from '../settings/colors.ts';
import { say } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { scope } from '../ui/toolbar.ts';
import { appState, session } from '../core/state.ts';

// ---------- first run: set up with Myra, then an optional hands-on tour ----------
const OB_N = 6;
let obAt = 0;

function obGo(i) {
  obAt = clamp(i, 0, OB_N - 1);
  document.querySelectorAll('.ob-step').forEach(s => s.classList.toggle('on', +s.dataset.step === obAt));
  $('obDots').innerHTML = Array.from(
    { length: OB_N },
    (_, k) => `<i class="${k === obAt ? 'on' : k < obAt ? 'done' : ''}"></i>`,
  ).join('');
  $('obBack').style.visibility = obAt ? 'visible' : 'hidden';
  $('obNext').textContent = obAt === 0 ? "Let's go" : 'Next';
  $('onboard').classList.toggle('last', obAt === OB_N - 1);
  $('obSkip').style.display = obAt === OB_N - 1 ? 'none' : '';
  if (obAt === 2) showConnections(true);
  if (obAt === OB_N - 1) $('obDoneTitle').textContent = `You're all set${settings.name ? ', ' + settings.name : ''}!`;
  if (obAt === 0) setTimeout(() => $('obName').focus(), 50);
  goos[4].hop();
  goos[5].hop();
}
let firstChoice = 'example';

export function openSetup() {
  closeSettings();
  $('obFirstRow').hidden = !appState.firstRunSetup;
  firstChoice = 'example';
  paintFirst();
  $('obName').value = settings.name || '';
  applySettings();
  $('onboard').classList.add('on');
  obGo(0);
}

const paintFirst = () =>
  document.querySelectorAll('#obFirst [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === firstChoice));

function finishSetup(tour) {
  // first run only: the example board can be swapped for an empty one
  if (appState.firstRunSetup && firstChoice === 'empty' && session.board.name === 'My first board') {
    session.board.cards = [];
    session.board.links = [];
    session.board.tray = [];
    renderAll();
    renderTray();
    renderWires();
    save();
  }
  appState.firstRunSetup = false;
  settings.name = $('obName').value.trim().slice(0, 40);
  applySettings();
  try {
    localStorage.setItem('fenmyr:onboarded', '1');
  } catch (e) {}
  $('onboard').classList.remove('on');
  if (tour) setTimeout(startTour, 350);
  else say(`Have fun${settings.name ? ', ' + settings.name : ''}! Click me anytime to chat ✦`, 6000);
}

export function obKeys(e) {
  if (e.target.closest?.('input')) return;
  if (e.key === 'ArrowRight') obGo(obAt + 1);
  if (e.key === 'ArrowLeft') obGo(obAt - 1);
  if (e.key === 'Enter' && !e.target.closest?.('button')) {
    e.preventDefault();
    obAt < OB_N - 1 ? $('obNext').click() : $('obTour').click();
  }
}

// the tour: Myra points at each part; some steps you try for real and she notices
const TOUR = [
  {
    el: '#tools',
    side: 'top',
    text: 'These are your tools. Pick one, then click the board to place it.',
    try: 'Try it: add a note (or double-click the board).',
    done: t => session.board.cards.length > t.cards,
  },
  {
    el: '#tools [data-add="tpl"]',
    side: 'top',
    text: 'Templates live here: thinking tools you add to a board, starter boards, and a Kanban with columns you can name. Right-click a selection or the board to save your own.',
  },
  {
    el: null,
    text: 'Got an idea mid-thought? Press ⌘K, type it and press Enter. It goes to Unsorted, and you keep your place.',
    try: 'Try it: press ⌘K and jot something down.',
    done: t => session.board.tray.length > t.tray,
  },
  {
    el: '#tray',
    side: 'left',
    text: 'Unsorted holds your quick ideas. Drag one onto the board when it finds a home, or ask me to sort them all.',
    try: 'Try it: drag a berry onto the board.',
    done: t => session.board.tray.length < t.tray,
  },
  {
    el: '#side .box',
    side: 'right',
    text: 'Your boards live here. Group them into projects and folders. Right-click anything to rename, move, duplicate or delete it.',
  },
  {
    el: '#design',
    side: 'left',
    text: 'Wireframes: screens, boxes, text, icons, and ready-made pieces, from nav bars to whole website sections. Things snap into line as you move them.',
  },
  {
    el: '#mPill',
    side: 'top',
    text: "And that's me! Click me to chat. Ask me to sort your notes, plan a project, explore fonts, or build screens and whole landing pages. I'll take you right to whatever I make.",
  },
  {
    el: '#gearBtn',
    side: 'right',
    text: 'Everything from setup lives in Settings, and you can replay this tour there anytime. Have fun! ✦',
  },
];

let tourAt = -1;
let tourPoll = 0;

export function startTour() {
  if (homeAt) closeHome();
  if (chatOpen()) myraOpen(false);
  $('mBubble').classList.remove('on');
  $('coach').classList.add('on');
  tourGo(0);
}

export function endTour() {
  clearInterval(tourPoll);
  tourAt = -1;
  $('coach').classList.remove('on');
}

function tourGo(i) {
  clearInterval(tourPoll);
  if (i >= TOUR.length) {
    endTour();
    say(`You're ready${settings.name ? ', ' + settings.name : ''}! Click me whenever you want help ✦`, 0, [
      {
        label: 'Brainstorm with me',
        cls: 'next',
        run: () => ask('Help me brainstorm a new project. Ask me one question to start.'),
      },
      {
        label: 'Build me a landing page',
        cls: 'next',
        run: () => {
          myraOpen(true);
          $('mcInput').value = 'Build me a landing page for ';
          $('mcInput').focus();
        },
      },
    ]);
    return;
  }
  tourAt = i;
  const st = TOUR[i],
    start = { cards: session.board.cards.length, tray: session.board.tray.length };
  $('coachStep').textContent = `${i + 1} of ${TOUR.length}`;
  $('coachText').textContent = st.text;
  $('coachTry').textContent = st.try || '';
  $('coachTry').classList.remove('yay');
  $('coachTry').style.display = st.try ? '' : 'none';
  $('coachNext').textContent = i === TOUR.length - 1 ? 'Done ✦' : 'Continue';
  placeCoach();
  goos[6].hop();
  if (st.done)
    tourPoll = setInterval(() => {
      if (tourAt !== i || !st.done(start)) return;
      clearInterval(tourPoll);
      $('coachTry').textContent = 'Nice! ✦';
      $('coachTry').classList.add('yay');
      hopMyra();
      setTimeout(() => tourAt === i && tourGo(i + 1), 1200);
    }, 250);
}

function placeCoach() {
  if (tourAt < 0) return;
  const st = TOUR[tourAt],
    t = st.el && document.querySelector(st.el),
    card = $('coachCard'),
    ring = $('coachRing');
  const r = t && t.getBoundingClientRect(),
    ok = r && r.width > 0 && r.height > 0,
    cw = card.offsetWidth,
    ch = card.offsetHeight,
    W = innerWidth,
    H = innerHeight;
  ring.style.display = ok ? '' : 'none';
  $('coach').classList.toggle('dim', !ok);
  let x = (W - cw) / 2,
    y = (H - ch) / 2;
  if (ok) {
    Object.assign(ring.style, {
      left: r.left - 8 + 'px',
      top: r.top - 8 + 'px',
      width: r.width + 16 + 'px',
      height: r.height + 16 + 'px',
    });
    if (st.side === 'top') {
      x = r.left + r.width / 2 - cw / 2;
      y = r.top - ch - 26;
    } else if (st.side === 'left') {
      x = r.left - cw - 26;
      y = r.top + Math.min(r.height, 300) / 2 - ch / 2;
    } else if (st.side === 'right') {
      x = r.right + 26;
      y = r.top + Math.min(r.height, 300) / 2 - ch / 2;
    }
  }
  card.style.left = clamp(x, 16, W - cw - 16) + 'px';
  card.style.top = clamp(y, 16, H - ch - 16) + 'px';
}
export function init60() {
  appState.firstRunSetup = false;

  $('obFirst').onclick = e => {
    const b = e.target.closest('[data-v]');
    if (b) {
      firstChoice = b.dataset.v;
      paintFirst();
    }
  };

  $('obNext').onclick = () => {
    if (obAt === 0) {
      settings.name = $('obName').value.trim().slice(0, 40);
      applySettings();
    }
    obGo(obAt + 1);
  };

  $('obBack').onclick = () => obGo(obAt - 1);

  $('obSkip').onclick = () => finishSetup(false);

  $('obTour').onclick = () => finishSetup(true);

  $('obExplore').onclick = () => finishSetup(false);

  $('obRecheck').onclick = () => showConnections(true);

  $('obName').onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('obNext').click();
    }
    e.stopPropagation();
  };

  $('redoSetup').onclick = openSetup;

  $('addExample').onclick = async () => {
    closeSettings();
    const b = newBoard('My first board', 'My first board'),
      { f, p } = scope(),
      into = f || (p && foldersIn(p.id)[0]);
    if (into) b.folder = into.id;
    await Fenmyr.save(b);
    await openBoard(b.id);
    fit(session.board.cards);
    refreshBoards();
  };

  $('redoTour').onclick = () => {
    closeSettings();
    setTimeout(startTour, 250);
  };

  addEventListener('resize', placeCoach);

  $('coachNext').onclick = () => tourGo(tourAt + 1);

  $('coachSkip').onclick = endTour;

  $('coachCard').addEventListener('pointerdown', e => e.stopPropagation());

  if (Fenmyr.web) document.body.classList.add('web');

  document.querySelectorAll('.get-app').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        getApp();
      }),
  );
}
