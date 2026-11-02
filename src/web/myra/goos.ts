import { $ } from '../core/dom.ts';
import { elementById } from '../ui/dom.ts';

const canvas = (id: string) => elementById(id, HTMLCanvasElement);

// ---------- Myra on the board ----------
// her hop: she jumps right up out of her pill, then squishes a little as she lands
export function hopMyra() {
  goo.hop();
  const c = $('goo');
  c.classList.remove('hopping');
  void c.offsetWidth;
  c.classList.add('hopping');
}
// Myra on the board, the one the other modules move
export let goo: ReturnType<typeof Goo>;
const SMALL = { headroom: 8 };
export let goos: ReturnType<typeof Goo>[] = [];
export function init24() {
  goo = Goo(canvas('goo'), { headroom: 8 });
  // small Myras get room above them
  goos = [
    goo,
    Goo(canvas('obGoo'), { headroom: 8 }),
    Goo(canvas('obGoo2'), { headroom: 8 }),
    Goo(canvas('coachGoo'), SMALL),
    Goo(canvas('setGoo'), SMALL),
  ];
}
