import { stage } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { LY, layersSoon } from '../panels/layers.ts';
import { cardEl } from '../ui/dom.ts';
import { renderWires } from './wires.ts';

export function selectWire(id: string | null) {
  session.selWire = id;
  if (id) selectOnly([]);
  renderWires();
}

// (the stage gets a 'multi' class when more than one thing is selected: tilt handles only show for one thing at a time)
export function selectOnly(ids: string[]) {
  if (ids.length && session.selWire) {
    session.selWire = null;
    renderWires();
  }
  session.sel = new Set(ids);
  stage.classList.toggle('multi', session.sel.size > 1);
  LY.reveal = true;
  layersSoon();
  session.board.cards.forEach(c => {
    const el = cardEl(c.id);
    el?.classList.toggle('sel', session.sel.has(c.id));
  });
}
