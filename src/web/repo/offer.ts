import { namedList } from '../../shared/changeSummary.ts';
import type { ChatAction, ProtoOffer } from '../../shared/chat.ts';
import type { Project } from '../../shared/model.ts';
import { protoSlug } from '../../shared/repos.ts';
import { freshCopies } from '../canvas/clipboard.ts';
import { appState, session } from '../core/state.ts';
import type { Button, Piece } from '../myra/acts.ts';
import { chatLog, renderChat } from '../myra/chatLog.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { spend } from '../myra/replyView.ts';
import { reply, say } from '../myra/say.ts';
import { building, startBuild } from '../proto/build.ts';
import { linkRepo } from './link.ts';
import { projectFor, prototypingFolder } from './myra.ts';
import { createPrototype, type Seed } from './prototypes.ts';
import { pickProject } from './start.ts';

const FOR: Record<NonNullable<ProtoOffer['device']>, string> = {
  phone: 'phones',
  tablet: 'tablets',
  desktop: 'desktop',
};

function codeLine(o: ProtoOffer, p: Project | undefined) {
  if (!p) return 'Code goes in the repo of a project you choose';
  if (!p.repo) return `Code goes in a repo linked to “${p.name}”`;
  const repo = p.repo.path.split('/').filter(Boolean).pop() ?? p.repo.path;
  return `Code goes in ${repo}/prototypes/${protoSlug(o.name)}`;
}

type Offer = Extract<ChatAction, { kind: 'offer' }>;

// the message in the open chat that holds the offer: none once it is spent, or while another board is open
const holder = (a: Offer) => chatLog().find(m => m.acts?.includes(a));

// set while a board is being made from an offer, so a second press makes nothing
let making = false;

// Once linked, the card offers Start and build, so the chat shows it: drawn again, or opened if it was closed.
const redraw = () => (chatOpen() ? renderChat() : myraOpen(true));

// The card under her line, drawn from the library as it is now, so linking a repo changes what it offers. Its buttons
// work only while the open chat holds it, so on its own board, where the cards it copies are. A function declaration,
// since VIEW reads it inside an import cycle.
export function offerPieces(a: Offer): Piece[] {
  const o = a.offer,
    live = () => !!holder(a),
    open = live(),
    p = projectFor(o.project),
    from = open ? session.board.cards.filter(c => o.from.includes(c.id)) : [],
    count = from.length === 1 ? '1 card' : `${from.length} cards`,
    made = from.length ? `Made from ${count}: ${namedList(from)}` : 'Made from your request',
    stack = o.stack === 'html' ? 'Plain HTML' : 'React',
    lines = [made, codeLine(o, p), o.device ? `${stack}, for ${FOR[o.device]}` : stack],
    card: Piece = { slot: 'summary', head: `New prototype board: ${o.name}`, lines, cls: 'offer' };
  if (!open) return [card];
  const go: Button =
    p && !p.repo
      ? { label: 'Link a repo first', after: 'stay', live, run: () => linkRepo(p, redraw) }
      : { label: 'Start and build', after: 'stay', live, run: () => startAndBuild(a) };
  return [
    card,
    { slot: 'reply', button: go },
    { slot: 'reply', button: { label: 'Not now', ghost: true, after: 'self', live, run: () => {} } },
  ];
}

// The cards are copied when the button is pressed, so choosing a project or linking its repo on the way can't lose them.
function startAndBuild(a: Offer) {
  if (making) return;
  if (building()) return say('I’m still writing the last change. Press Start and build once it’s done.', 6000);
  const o = a.offer,
    seed = freshCopies(session.board.cards.filter(c => o.from.includes(c.id))),
    p = projectFor(o.project);
  if (p) buildIn(p, a, seed);
  else pickProject(chosen => buildIn(chosen, a, seed));
}

// The board is made as any new prototype is, and its first build starts as any build does, from the cards it brought.
// The offer is spent once the board is saved, so a step cancelled or failed on the way leaves it to press again.
async function buildIn(chosen: Project, a: Offer, seed: Seed): Promise<void> {
  const o = a.offer,
    p = appState.projects.find(x => x.id === chosen.id) ?? chosen,
    root = p.repo?.path;
  if (!root) return linkRepo(p, () => buildIn(p, a, seed));
  making = true;
  try {
    const f = await prototypingFolder(p, o.folder);
    if (!f) return;
    await createPrototype(f, root, o, seed, () => {
      const m = holder(a);
      if (m) spend(m, [a]);
    });
  } catch (e) {
    return reply(`I couldn’t make “${o.name}”: ${e instanceof Error ? e.message : String(e)}`, 8000);
  } finally {
    making = false;
  }
  await startBuild(o.build, { brought: seed.cards.map(c => c.id) });
}
