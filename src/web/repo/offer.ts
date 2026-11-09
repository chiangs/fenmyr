import { namedList } from '../../shared/changeSummary.ts';
import type { ChatAction, ProtoOffer } from '../../shared/chat.ts';
import type { Project } from '../../shared/model.ts';
import { protoSlug } from '../../shared/repos.ts';
import { freshCopies } from '../canvas/clipboard.ts';
import { appState, session } from '../core/state.ts';
import type { Button, Piece } from '../myra/acts.ts';
import { renderChat } from '../myra/chatLog.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { reply } from '../myra/say.ts';
import { startBuild } from '../proto/build.ts';
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

// Once linked, the card offers Start and build, so the chat shows it: drawn again, or opened if it was closed.
const redraw = () => (chatOpen() ? renderChat() : myraOpen(true));

// The card under her line, drawn from the library as it is now, so linking a repo changes what it offers. Its buttons
// show while its board is open, since the cards it copies are there. A function declaration, since VIEW reads it inside
// an import cycle.
export function offerPieces({ board, offer: o }: Extract<ChatAction, { kind: 'offer' }>): Piece[] {
  const open = session.board.id === board,
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
      ? { label: 'Link a repo first', after: 'stay', run: () => linkRepo(p, redraw) }
      : { label: 'Start and build', after: 'self', run: () => startAndBuild(o) };
  return [
    card,
    { slot: 'reply', button: go },
    { slot: 'reply', button: { label: 'Not now', ghost: true, after: 'self', run: () => {} } },
  ];
}

// The cards are copied when the button is pressed, so choosing a project or linking its repo on the way can't lose them.
function startAndBuild(o: ProtoOffer) {
  const seed = freshCopies(session.board.cards.filter(c => o.from.includes(c.id))),
    p = projectFor(o.project);
  if (p) buildIn(p, o, seed);
  else pickProject(chosen => buildIn(chosen, o, seed));
}

// The board is made as any new prototype is, and its first build starts as any build does, from the cards it brought.
async function buildIn(chosen: Project, o: ProtoOffer, seed: Seed): Promise<void> {
  const p = appState.projects.find(x => x.id === chosen.id) ?? chosen,
    root = p.repo?.path;
  if (!root) return linkRepo(p, () => buildIn(p, o, seed));
  const f = await prototypingFolder(p, o.folder);
  if (!f) return;
  try {
    await createPrototype(f, root, o, seed);
  } catch (e) {
    return reply(`I couldn’t make “${o.name}”: ${e instanceof Error ? e.message : String(e)}`, 8000);
  }
  await startBuild(
    o.build,
    seed.cards.map(c => c.id),
  );
}
