import type { Board, CardOf } from '../../shared/model.ts';
import { inCommit, readCapture } from '../../shared/repos.ts';
import { stage } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { card } from '../model/boards.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { askGit } from '../repo/askGit.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { say } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { esc } from '../ui/dom.ts';
import { renderGitBar } from './gitbar.ts';
import { knobsChanged } from './knobs.ts';
import { previewShot, showCommit } from './preview.ts';

// Captures: a picture of the preview put on the board as a card, tied to the commit it shows, so clicking the card
// brings that version back into the preview. A commit is what makes that possible, so nothing uncommitted is captured.
type Prototype = Extract<Board, { kind: 'prototype' }>;
const CARD_W = 260;
const failed = (e: unknown) => say(e instanceof Error ? e.message : String(e), 8000);

async function take(commit: string) {
  const shot = previewShot();
  if (!shot || shot.rect.w < 4 || shot.rect.h < 4) return say('Open the preview first, then capture it.', 5000);
  const src = await Fenmyr.captureArea(shot.rect).catch(() => '');
  if (!src) return say('I couldn’t take a picture of the preview.', 5000);
  const h = Math.round((CARD_W * shot.rect.h) / shot.rect.w) + 16,
    capture = { commit, device: shot.device, width: shot.width, at: Date.now() },
    c = card('image', { src, w: CARD_W, h, capture }),
    // a new capture goes to the right of the last one, so a series reads left to right; the first, mid-view
    last = session.board.cards.filter(x => x.type === 'image' && readCapture(x.capture)).pop(),
    p = centerWorld();
  c.x = last ? last.x + last.w + 24 : p.x - CARD_W / 2;
  c.y = last ? last.y : p.y - h / 2;
  addCard(c);
  say(`Captured ${commit.slice(0, 7)}. Click the card any time to see this version in the preview again ✦`, 6000);
}

async function commitThenTake(b: Prototype, root: string, message: string) {
  try {
    const s = await Fenmyr.gitCommit({ root, dir: b.proto.dir, message });
    renderGitBar(b);
    if (s.kind === 'repo' && s.head) await take(s.head);
  } catch (e) {
    failed(e);
  }
}

export async function takeCapture(b: Prototype) {
  const root = rootOf(b);
  if (!root) return;
  if (knobsChanged())
    return say('Keep or reset the controls you moved first, so the capture matches a saved version.', 6000);
  const s = await Fenmyr.gitStatus(root).catch(() => null);
  if (s?.kind !== 'repo') return say('Git can’t read this prototype’s repo.', 5000);
  const pending = s.changed.filter(c => inCommit(b.proto.dir, c.path)).length;
  if (!pending && s.head) return take(s.head);
  const repo = s.root.split('/').pop() ?? s.root,
    branch = s.branch ?? 'this branch',
    message = `Update ${b.name}`,
    files = pending === 1 ? '1 changed file' : `${pending} changed files`;
  askGit(
    `A capture points at a commit, and ${repo}/${b.proto.dir} has ${files} not committed. Commit them to ${branch} first? Message: “${message}”`,
    'Everything in the prototype has to be committed before I can capture it, so the picture always matches a version you can come back to. I can commit it now and then take the capture.',
    [
      { label: 'Commit and capture', cls: 'next', run: () => commitThenTake(b, root, message) },
      { label: 'Not now', ghost: true, run: () => {} },
    ],
  );
}

// the line under a capture card's picture: where and when it was taken, and its commit
export function captureTag(c: CardOf<'image'>) {
  const cap = readCapture(c.capture);
  if (!cap) return '';
  const when = new Date(cap.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
    words = esc(`${cap.device} ${cap.width}px · ${cap.commit.slice(0, 7)} · ${when}`),
    camera = Icon('camera', { size: 12 });
  return `<div class="cap-tag" title="Click to see this version in the preview">${camera}<span>${words}</span></div>`;
}

// clicking a capture card, without dragging it, shows its commit in the preview
export function watchCaptures() {
  let down: { x: number; y: number; id: string } | null = null;
  stage.addEventListener(
    'pointerdown',
    e => {
      const id = e.target instanceof Element ? e.target.closest<HTMLElement>('.card')?.dataset.id : undefined;
      down = id ? { x: e.clientX, y: e.clientY, id } : null;
    },
    true,
  );
  stage.addEventListener(
    'pointerup',
    e => {
      const was = down;
      down = null;
      if (!was || session.board.kind !== 'prototype' || Math.hypot(e.clientX - was.x, e.clientY - was.y) > 4) return;
      const c = session.board.cards.find(x => x.id === was.id),
        cap = c?.type === 'image' ? readCapture(c.capture) : null;
      if (cap) showCommit(cap);
    },
    true,
  );
}
