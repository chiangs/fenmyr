import type { Wanted } from '../../shared/myraReply.ts';
import { addBoardHere } from '../library/addHere.ts';
import { boardsMade, cappedAt, onePrototype, prototypeAsked } from './madeLines.ts';

// Her boards.create: each name is what /board with that name makes, where the person is looking, and she says what she
// made once all are made. Each opens as it is made, so the last stays open and her line is in its chat. `told` collects
// her lines, which join what she says in her reply.
export async function makeBoards({ items, over }: Wanted<string>, told: string[]) {
  const made: string[] = [];
  let into: string | undefined;
  for (const [i, name] of items.entries()) {
    const added = await addBoardHere(name);
    if (added.kind === 'prototype') {
      // a prototyping folder holds prototypes, which a form makes one at a time; without a repo she has sent the
      // person to link one and said so already
      const rest = items.length - i - 1;
      if (added.asked) told.push(prototypeAsked(added.into.name), ...(rest ? [onePrototype(rest)] : []));
      return;
    }
    made.push(added.board.name);
    into = added.into?.name;
  }
  if (made.length) told.push(boardsMade(made, into));
  if (over) told.push(cappedAt(over));
}
